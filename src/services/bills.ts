import { supabase } from '@/lib/supabase'
import type { Bill, BillItem, BillFilters, ParsedBill, Vendor, PaymentStatus, TransactionType } from '@/types'

// ─── Vendor Operations ────────────────────────────────────────────────────────

function buildVendorPayload(vendorData: Partial<Vendor>) {
  return {
    name:       vendorData.name?.trim(),
    address:    vendorData.address?.trim()    || null,
    gstin:      vendorData.gstin?.trim()      || null,
    pan:        vendorData.pan?.trim()        || null,
    phone:      vendorData.phone?.trim()      || null,
    dl_no:      vendorData.dl_no?.trim()      || null,
    bank_name:  vendorData.bank_name?.trim()  || null,
    account_no: vendorData.account_no?.trim() || null,
    ifsc_code:  vendorData.ifsc_code?.trim()  || null,
  }
}

export async function createVendor(vendorData: Partial<Vendor>): Promise<Vendor> {
  if (!vendorData.name?.trim()) throw new Error('Vendor name is required')

  const payload = buildVendorPayload(vendorData)
  const { data, error } = await supabase
    .from('vendors')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Vendor
}

export async function updateVendor(id: string, vendorData: Partial<Vendor>): Promise<Vendor> {
  if (!id) throw new Error('Vendor id is required')
  if (!vendorData.name?.trim()) throw new Error('Vendor name is required')

  const payload = buildVendorPayload(vendorData)
  const { data, error } = await supabase
    .from('vendors')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Vendor
}

export async function upsertVendor(vendorData: Partial<Vendor>): Promise<Vendor> {
  if (!vendorData.name) throw new Error('Vendor name is required')

  const name = vendorData.name.trim()
  const payload = buildVendorPayload({ ...vendorData, name })

  // Layer 1: Fast upsert (single query via unique constraint on name)
  const { data: upserted, error: upsertErr } = await supabase
    .from('vendors')
    .upsert(payload, { onConflict: 'name' })
    .select()
    .single()

  if (!upsertErr && upserted) return upserted as Vendor

  // Layer 2: Upsert failed — try SELECT first
  console.warn('[vendors] Upsert failed, falling back to SELECT+INSERT:', upsertErr?.message)

  const { data: existing } = await supabase
    .from('vendors')
    .select('*')
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    const { data: updated, error: updateErr } = await supabase
      .from('vendors')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (!updateErr && updated) return updated as Vendor
    return existing as Vendor
  }

  // Layer 3: Insert fresh
  const { data: inserted, error: insertErr } = await supabase
    .from('vendors')
    .insert(payload)
    .select()
    .single()

  if (insertErr) throw insertErr
  return inserted as Vendor
}

export async function getVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select(`*, bill_count:bills(count)`)
    .order('name')

  if (error) throw error

  return (data || []).map(v => ({
    ...v,
    bill_count: (v.bill_count as unknown as { count: number }[])?.[0]?.count ?? 0,
  })) as Vendor[]
}

// ─── Upload Bill Image ────────────────────────────────────────────────────────

export async function uploadBillImage(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const safeName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('bills')
    .upload(safeName, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
      cacheControl: '31536000',
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  return safeName
}

export async function getBillImageUrl(imagePath: string): Promise<string> {
  if (!imagePath) return ''

  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath
  }

  const { data, error } = await supabase.storage
    .from('bills')
    .createSignedUrl(imagePath, 60 * 15)

  if (error || !data?.signedUrl) {
    throw new Error('Unable to load the stored bill image')
  }

  return data.signedUrl
}

// ─── Create Bill from Parsed Data ────────────────────────────────────────────

export async function createBillFromParsed(
  parsed: ParsedBill,
  imageUrl: string | null,
  userId: string,
  transactionType: TransactionType = 'PURCHASE'
): Promise<Bill> {
  // ── Round-trip 1: Vendor (~100–150ms) ────────────────────────────────────
  let vendorId: string | null = null
  if (parsed.vendor?.name && parsed.vendor.name !== 'Unknown Vendor') {
    try {
      const vendor = await upsertVendor(parsed.vendor)
      vendorId = vendor.id
    } catch (err) {
      console.warn('[bills] Vendor upsert failed (non-fatal):', err)
    }
  }

  const confidence = parsed._meta?.confidence ?? null
  const needsReview = typeof confidence === 'number' && confidence < 75

  // ── Round-trip 2: Bill insert (~100–150ms) ────────────────────────────────
  const { data: bill, error: billError } = await supabase
    .from('bills')
    .insert({
      user_id:          userId,
      vendor_id:        vendorId,
      invoice_no:       parsed.invoice?.invoice_no       ?? null,
      invoice_date:     parsed.invoice?.invoice_date     ?? null,
      due_date:         parsed.invoice?.due_date         ?? null,
      payment_mode:     parsed.invoice?.payment_mode     ?? null,
      customer_name:    parsed.customer?.name            ?? null,
      customer_address: parsed.customer?.address         ?? null,
      customer_dl:      parsed.customer?.dl_no           ?? null,
      customer_pan:     parsed.customer?.pan             ?? null,
      net_amount:       parsed.totals?.net_amount        ?? null,
      total_taxable:    parsed.totals?.total_taxable     ?? null,
      total_gst:        parsed.totals?.total_gst         ?? null,
      round_off:        parsed.totals?.round_off         ?? null,
      image_url:        imageUrl,
      raw_parsed_json:  JSON.stringify(parsed),
      transaction_type: transactionType,
      payment_status:   'UNPAID' as PaymentStatus,
      amount_paid:      0,
      needs_review:     needsReview,
      ai_confidence:    confidence,
    })
    .select()
    .single()

  if (billError) throw billError

  // ── Round-trip 3: Items bulk insert (~100–200ms regardless of count) ────────
  if (parsed.items && parsed.items.length > 0) {
    const items = parsed.items.map((item, idx) => ({
      bill_id:        bill.id,
      sr_no:          item.sr_no          ?? idx + 1,
      hsn_code:       item.hsn_code       ?? null,
      description:    item.description    || 'Unknown Item',
      manufacturer:   item.manufacturer   ?? null,
      pack:           item.pack           ?? null,
      batch_no:       item.batch_no       ?? null,
      expiry_date:    item.expiry_date     ?? null,
      mrp:            item.mrp            ?? null,
      quantity:       item.quantity       ?? null,
      free_quantity:  item.free_quantity  ?? null,
      rate:           item.rate           ?? null,
      discount_pct:   item.discount_pct   ?? null,
      taxable_amount: item.taxable_amount ?? null,
      gst_pct:        item.gst_pct        ?? null,
      gst_value:      item.gst_value      ?? null,
      total_amount:   item.total_amount   ?? null,
    }))

    const { error: itemsError } = await supabase.from('bill_items').insert(items)
    if (itemsError) {
      console.error('[bills] Items insert failed:', itemsError)
    }
  }

  return bill as Bill
}

// ─── Record a Payment Against a Bill ─────────────────────────────────────────

export async function recordPayment(
  billId: string,
  amountBeingPaid: number
): Promise<Bill> {
  const { data: current, error: fetchErr } = await supabase
    .from('bills')
    .select('net_amount, amount_paid')
    .eq('id', billId)
    .single()

  if (fetchErr) throw fetchErr

  const netAmount = current.net_amount ?? 0
  const newAmountPaid = Math.min((current.amount_paid ?? 0) + amountBeingPaid, netAmount)
  const newStatus: PaymentStatus =
    newAmountPaid >= netAmount ? 'PAID'
    : newAmountPaid > 0 ? 'PARTIAL'
    : 'UNPAID'

  const { data, error } = await supabase
    .from('bills')
    .update({
      amount_paid:    newAmountPaid,
      payment_status: newStatus,
    })
    .eq('id', billId)
    .select()
    .single()

  if (error) throw error
  return data as Bill
}

// ─── Record a Quick Payment-Out Transaction ───────────────────────────────────

export async function createPaymentOut(
  vendorId: string,
  amount: number,
  userId: string,
  notes?: string
): Promise<Bill> {
  const { data, error } = await supabase
    .from('bills')
    .insert({
      user_id:          userId,
      vendor_id:        vendorId,
      net_amount:       amount,
      amount_paid:      amount,
      payment_status:   'PAID' as PaymentStatus,
      transaction_type: 'PAYMENT_OUT' as TransactionType,
      payment_mode:     'CASH',
      invoice_date:     new Date().toISOString().split('T')[0],
      notes:            notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Bill
}

// ─── Get Bills with Filters ───────────────────────────────────────────────────

export async function getBills(filters: BillFilters = {}): Promise<{ bills: Bill[]; total: number }> {
  const {
    search,
    vendor_id,
    date_from,
    date_to,
    payment_mode,
    payment_status,
    transaction_type,
    needs_review,
    sort_by = 'created_at',
    sort_order = 'desc',
    page = 1,
    limit = 20,
  } = filters

  let query = supabase
    .from('bills')
    .select(`*, vendor:vendors(id, name, gstin)`, { count: 'exact' })

  if (search) {
    query = query.or(`invoice_no.ilike.%${search}%,customer_name.ilike.%${search}%`)
  }
  if (vendor_id)        query = query.eq('vendor_id', vendor_id)
  if (date_from)        query = query.gte('invoice_date', date_from)
  if (date_to)          query = query.lte('invoice_date', date_to)
  if (payment_mode)     query = query.eq('payment_mode', payment_mode)
  if (payment_status)   query = query.eq('payment_status', payment_status)
  if (transaction_type) query = query.eq('transaction_type', transaction_type)
  if (needs_review)     query = query.eq('needs_review', true)

  const sortColumn = sort_by === 'vendor' ? 'vendor_id' : sort_by
  query = query.order(sortColumn, { ascending: sort_order === 'asc' })

  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  return { bills: (data || []) as Bill[], total: count || 0 }
}

// ─── Get Single Bill with Items ───────────────────────────────────────────────

export async function getBillById(id: string): Promise<Bill> {
  const { data, error } = await supabase
    .from('bills')
    .select(`*, vendor:vendors(*), items:bill_items(*)`)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Bill
}

// ─── Delete Bill ──────────────────────────────────────────────────────────────

export async function deleteBill(id: string): Promise<void> {
  const { data: bill } = await supabase
    .from('bills')
    .select('image_url')
    .eq('id', id)
    .single()

  const deleteDb = async (): Promise<void> => {
    const { error } = await supabase.from('bills').delete().eq('id', id)
    if (error) throw error
  }

  const deleteStorage = async (): Promise<void> => {
    if (!bill?.image_url) return
    try {
      const path = /^https?:\/\//i.test(bill.image_url)
        ? new URL(bill.image_url).pathname.split('/storage/v1/object/')[1]?.split('/bills/')[1]?.split('?')[0]
        : bill.image_url
      if (path) await supabase.storage.from('bills').remove([path])
    } catch {
      // Storage deletion failure is non-fatal
    }
  }

  await Promise.all([deleteDb(), deleteStorage()])
}

// ─── Update Bill Image URL (after async upload completes) ─────────────────────

export async function updateBillImage(id: string, imageUrl: string): Promise<void> {
  await supabase.from('bills').update({ image_url: imageUrl }).eq('id', id)
}

// ─── Update Bill ──────────────────────────────────────────────────────────────

export async function updateBill(id: string, updates: Partial<Bill>): Promise<Bill> {
  const { data, error } = await supabase
    .from('bills')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Bill
}

// ─── Update Bill Items ────────────────────────────────────────────────────────

export async function updateBillItems(billId: string, items: Partial<BillItem>[]): Promise<void> {
  await supabase.from('bill_items').delete().eq('bill_id', billId)

  if (items.length > 0) {
    const { error } = await supabase.from('bill_items').insert(
      items.map((item, idx) => ({
        ...item,
        bill_id: billId,
        sr_no: item.sr_no ?? idx + 1,
      }))
    )
    if (error) throw error
  }
}

export async function updateExistingBillItems(items: Partial<BillItem>[]): Promise<void> {
  for (const item of items) {
    if (!item.id) throw new Error('Bill item id is required')

    const { error } = await supabase
      .from('bill_items')
      .update({
        sr_no: item.sr_no ?? null,
        hsn_code: item.hsn_code ?? null,
        description: item.description ?? 'Unknown Item',
        manufacturer: item.manufacturer ?? null,
        pack: item.pack ?? null,
        batch_no: item.batch_no ?? null,
        expiry_date: item.expiry_date ?? null,
        mrp: item.mrp ?? null,
        quantity: item.quantity ?? null,
        free_quantity: item.free_quantity ?? null,
        rate: item.rate ?? null,
        discount_pct: item.discount_pct ?? null,
        taxable_amount: item.taxable_amount ?? null,
        gst_pct: item.gst_pct ?? null,
        gst_value: item.gst_value ?? null,
        total_amount: item.total_amount ?? null,
      })
      .eq('id', item.id)

    if (error) throw error
  }
}

// ─── Get Outstanding Balance Per Vendor ──────────────────────────────────────

export async function getVendorOutstanding(vendorId: string): Promise<number> {
  const { data, error } = await supabase
    .from('bills')
    .select('net_amount, amount_paid, transaction_type')
    .eq('vendor_id', vendorId)

  if (error) throw error

  let outstanding = 0
  for (const bill of data || []) {
    if (bill.transaction_type === 'PURCHASE') {
      outstanding += (bill.net_amount ?? 0) - (bill.amount_paid ?? 0)
    } else if (bill.transaction_type === 'PURCHASE_RETURN') {
      outstanding -= (bill.net_amount ?? 0)
    }
  }
  return Math.max(0, outstanding)
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [allBills, monthBills, vendors, recentBills, vendorStats, expiringBatches, unpaidBills] = await Promise.all([
    supabase.from('bills').select('net_amount', { count: 'exact' }),
    supabase.from('bills').select('net_amount', { count: 'exact' }).gte('invoice_date', monthStart),
    supabase.from('vendors').select('id', { count: 'exact' }),
    supabase
      .from('bills')
      .select('*, vendor:vendors(id, name)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('bills')
      .select('vendor_id, net_amount, vendor:vendors(name)')
      .not('vendor_id', 'is', null),
    supabase
      .from('inventory_batches')
      .select('*, inventory:inventory(display_name)')
      .lte('expiry_date', thirtyDaysOut)
      .gte('expiry_date', now.toISOString().split('T')[0])
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true })
      .limit(10),
    supabase
      .from('bills')
      .select('net_amount, amount_paid', { count: 'exact' })
      .eq('payment_status', 'UNPAID')
      .eq('transaction_type', 'PURCHASE'),
  ])

  const totalAmount = (allBills.data || []).reduce((sum, b) => sum + (b.net_amount || 0), 0)
  const monthAmount = (monthBills.data || []).reduce((sum, b) => sum + (b.net_amount || 0), 0)

  const vendorMap = new Map<string, { name: string; count: number; amount: number }>()
  for (const row of vendorStats.data || []) {
    const vid = row.vendor_id as string
    const vname = (row.vendor as unknown as { name: string } | null)?.name || 'Unknown'
    if (!vendorMap.has(vid)) vendorMap.set(vid, { name: vname, count: 0, amount: 0 })
    const v = vendorMap.get(vid)!
    v.count++
    v.amount += row.net_amount || 0
  }

  const topVendors = Array.from(vendorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const totalOutstanding = (unpaidBills.data || []).reduce(
    (sum, b) => sum + ((b.net_amount ?? 0) - (b.amount_paid ?? 0)),
    0
  )

  return {
    totalBills:       allBills.count        || 0,
    totalAmount,
    thisMonthBills:   monthBills.count      || 0,
    thisMonthAmount:  monthAmount,
    uniqueVendors:    vendors.count         || 0,
    recentBills:      (recentBills.data     || []) as Bill[],
    topVendors,
    expiringBatches:  (expiringBatches.data || []) as any[],
    totalOutstanding,
    unpaidBillsCount: unpaidBills.count     || 0,
  }
}

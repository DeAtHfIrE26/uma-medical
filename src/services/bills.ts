import { supabase } from '@/lib/supabase'
import type { Bill, BillItem, BillFilters, ParsedBill, Vendor } from '@/types'

// ─── Vendor Operations ────────────────────────────────────────────────────────

export async function upsertVendor(vendorData: Partial<Vendor>): Promise<Vendor> {
  if (!vendorData.name) throw new Error('Vendor name is required')

  const name = vendorData.name.trim()
  const payload = {
    name,
    address:    vendorData.address    ?? null,
    gstin:      vendorData.gstin      ?? null,
    pan:        vendorData.pan        ?? null,
    phone:      vendorData.phone      ?? null,
    dl_no:      vendorData.dl_no      ?? null,
    bank_name:  vendorData.bank_name  ?? null,
    account_no: vendorData.account_no ?? null,
    ifsc_code:  vendorData.ifsc_code  ?? null,
  }

  // Layer 1: Fast upsert (requires unique constraint on name — added in schema)
  const { data: upserted, error: upsertErr } = await supabase
    .from('vendors')
    .upsert(payload, { onConflict: 'name' })
    .select()
    .single()

  if (!upsertErr && upserted) return upserted as Vendor

  // Layer 2: Upsert failed (e.g. schema cache not refreshed yet) — try SELECT first
  console.warn('[vendors] Upsert failed, falling back to SELECT+INSERT:', upsertErr?.message)

  const { data: existing } = await supabase
    .from('vendors')
    .select('*')
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    // Found existing — update with latest info
    const { data: updated, error: updateErr } = await supabase
      .from('vendors')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (!updateErr && updated) return updated as Vendor
    return existing as Vendor  // Return existing even if update fails
  }

  // Layer 3: Doesn't exist — insert fresh
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

  const { data } = supabase.storage.from('bills').getPublicUrl(safeName)
  return data.publicUrl
}

// ─── Create Bill from Parsed Data ────────────────────────────────────────────
// Optimised pipeline:
//   Round-trip 1: vendor upsert (single query, no SELECT first)
//   Round-trip 2: bill insert  (fires immediately after vendor)
//   Round-trip 3: items insert  (single bulk insert, no per-item queries)
//
// Vendor upsert + bill insert cannot be parallelised because the bill
// needs vendor_id. But both are now single fast queries.

export async function createBillFromParsed(
  parsed: ParsedBill,
  imageUrl: string | null,
  userId: string
): Promise<Bill> {
  // ── Round-trip 1: Vendor (single upsert, ~100–150ms) ─────────────────────
  let vendorId: string | null = null
  if (parsed.vendor?.name && parsed.vendor.name !== 'Unknown Vendor') {
    try {
      const vendor = await upsertVendor(parsed.vendor)
      vendorId = vendor.id
    } catch (err) {
      console.warn('[bills] Vendor upsert failed (non-fatal):', err)
    }
  }

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
    })
    .select()
    .single()

  if (billError) throw billError

  // ── Round-trip 3: Items bulk insert (~100–200ms regardless of count) ───────
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

    // Single bulk INSERT for all items — one query no matter how many rows
    const { error: itemsError } = await supabase.from('bill_items').insert(items)
    if (itemsError) {
      // Non-fatal: bill exists, items can be fixed later
      console.error('[bills] Items insert failed:', itemsError)
    }
  }

  return bill as Bill
}

// ─── Get Bills with Filters ───────────────────────────────────────────────────

export async function getBills(filters: BillFilters = {}): Promise<{ bills: Bill[]; total: number }> {
  const {
    search,
    vendor_id,
    date_from,
    date_to,
    payment_mode,
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
  if (vendor_id)    query = query.eq('vendor_id', vendor_id)
  if (date_from)    query = query.gte('invoice_date', date_from)
  if (date_to)      query = query.lte('invoice_date', date_to)
  if (payment_mode) query = query.eq('payment_mode', payment_mode)

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

  // Fire storage deletion and DB deletion in parallel
  const deleteDb = async (): Promise<void> => {
    const { error } = await supabase.from('bills').delete().eq('id', id)
    if (error) throw error
  }

  const deleteStorage = async (): Promise<void> => {
    if (!bill?.image_url) return
    try {
      const url = new URL(bill.image_url)
      const pathParts = url.pathname.split('/storage/v1/object/public/bills/')
      if (pathParts[1]) {
        await supabase.storage.from('bills').remove([pathParts[1]])
      }
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
  // Delete + re-insert in parallel preparation (delete fires first, insert waits)
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

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  // All 4 queries fire in parallel — single await for all
  const [allBills, monthBills, vendors, recentBills, vendorStats] = await Promise.all([
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

  return {
    totalBills:       allBills.count  || 0,
    totalAmount,
    thisMonthBills:   monthBills.count || 0,
    thisMonthAmount:  monthAmount,
    uniqueVendors:    vendors.count   || 0,
    recentBills:      (recentBills.data || []) as Bill[],
    topVendors,
  }
}

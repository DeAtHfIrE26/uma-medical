import { supabase } from '@/lib/supabase'
import type { InventoryItem, InventoryBatch } from '@/types'

function normalizeItemName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buildInventoryPayload(item: Partial<InventoryItem>) {
  const displayName = item.display_name?.trim() || item.item_name?.trim() || ''

  return {
    item_name:      normalizeItemName(displayName),
    display_name:   displayName,
    hsn_code:       item.hsn_code?.trim() || null,
    manufacturer:   item.manufacturer?.trim() || null,
    pack:           item.pack?.trim() || null,
    current_stock:  item.current_stock ?? 0,
    unit:           item.unit?.trim() || 'STRIP',
    reorder_level:  item.reorder_level ?? 0,
  }
}

export async function createInventoryItem(item: Partial<InventoryItem>): Promise<InventoryItem> {
  if (!item.display_name?.trim() && !item.item_name?.trim()) {
    throw new Error('Item name is required')
  }

  const payload = buildInventoryPayload(item)
  const { data, error } = await supabase
    .from('inventory')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as InventoryItem
}

export async function updateInventoryItem(id: string, item: Partial<InventoryItem>): Promise<InventoryItem> {
  if (!id) throw new Error('Inventory id is required')
  if (!item.display_name?.trim() && !item.item_name?.trim()) {
    throw new Error('Item name is required')
  }

  const payload = buildInventoryPayload(item)
  const { data, error } = await supabase
    .from('inventory')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as InventoryItem
}

async function syncInventoryStockFromBatches(inventoryId: string) {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('quantity')
    .eq('inventory_id', inventoryId)

  if (error) throw error

  const total = (data || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  const { error: updateError } = await supabase
    .from('inventory')
    .update({ current_stock: total })
    .eq('id', inventoryId)

  if (updateError) throw updateError
}

export async function createInventoryBatch(batch: Partial<InventoryBatch>): Promise<InventoryBatch> {
  if (!batch.inventory_id) throw new Error('Inventory item is required')
  if (!batch.batch_no?.trim()) throw new Error('Batch number is required')

  const payload = {
    inventory_id: batch.inventory_id,
    bill_id: batch.bill_id ?? null,
    batch_no: batch.batch_no.trim(),
    expiry_date: batch.expiry_date || null,
    quantity: batch.quantity ?? 0,
    mrp: batch.mrp ?? null,
    purchase_rate: batch.purchase_rate ?? null,
  }

  const { data, error } = await supabase
    .from('inventory_batches')
    .insert(payload)
    .select('*, inventory:inventory(id, display_name, unit)')
    .single()

  if (error) throw error
  await syncInventoryStockFromBatches(batch.inventory_id)
  return data as InventoryBatch
}

export async function updateInventoryBatch(id: string, batch: Partial<InventoryBatch>): Promise<InventoryBatch> {
  if (!id) throw new Error('Batch id is required')
  if (!batch.inventory_id) throw new Error('Inventory item is required')
  if (!batch.batch_no?.trim()) throw new Error('Batch number is required')

  const payload = {
    batch_no: batch.batch_no.trim(),
    expiry_date: batch.expiry_date || null,
    quantity: batch.quantity ?? 0,
    mrp: batch.mrp ?? null,
    purchase_rate: batch.purchase_rate ?? null,
  }

  const { data, error } = await supabase
    .from('inventory_batches')
    .update(payload)
    .eq('id', id)
    .select('*, inventory:inventory(id, display_name, unit)')
    .single()

  if (error) throw error
  await syncInventoryStockFromBatches(batch.inventory_id)
  return data as InventoryBatch
}

// ─── Get All Inventory Items ──────────────────────────────────────────────────

export async function getInventory(search?: string): Promise<InventoryItem[]> {
  let query = supabase
    .from('inventory')
    .select('*')
    .order('display_name', { ascending: true })

  if (search && search.trim()) {
    query = query.ilike('display_name', `%${search.trim()}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []) as InventoryItem[]
}

// ─── Get Low Stock Items ──────────────────────────────────────────────────────

export async function getLowStockItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('current_stock', { ascending: true })

  if (error) throw error
  const items = (data || []) as InventoryItem[]
  return items.filter(i => (i.current_stock ?? 0) <= (i.reorder_level ?? 0))
}

// ─── Get Items Expiring Within N Days ────────────────────────────────────────

export async function getExpiringBatches(withinDays = 30): Promise<InventoryBatch[]> {
  const now = new Date()
  const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('inventory_batches')
    .select('*, inventory:inventory(id, display_name, unit)')
    .gte('expiry_date', now.toISOString().split('T')[0])
    .lte('expiry_date', future.toISOString().split('T')[0])
    .gt('quantity', 0)
    .order('expiry_date', { ascending: true })

  if (error) throw error
  return (data || []) as InventoryBatch[]
}

// ─── Get Batches for a Specific Inventory Item ───────────────────────────────

export async function getBatchesForItem(inventoryId: string): Promise<InventoryBatch[]> {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('inventory_id', inventoryId)
    .gt('quantity', 0)
    .order('expiry_date', { ascending: true })

  if (error) throw error
  return (data || []) as InventoryBatch[]
}

// ─── Get Inventory Summary Stats ─────────────────────────────────────────────

export async function getInventoryStats(): Promise<{
  totalItems: number
  lowStockCount: number
  expiringCount: number
  totalStockValue: number
}> {
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [allItems, lowStock, expiring] = await Promise.all([
    supabase.from('inventory').select('current_stock, reorder_level'),
    supabase.from('inventory').select('id').lte('current_stock', 0),
    supabase
      .from('inventory_batches')
      .select('id', { count: 'exact' })
      .gte('expiry_date', today)
      .lte('expiry_date', thirtyDaysOut)
      .gt('quantity', 0),
  ])

  const items = allItems.data || []
  const lowStockCount = items.filter(i => i.current_stock <= (i.reorder_level ?? 0)).length

  return {
    totalItems:      items.length,
    lowStockCount,
    expiringCount:   expiring.count || 0,
    totalStockValue: 0,
  }
}

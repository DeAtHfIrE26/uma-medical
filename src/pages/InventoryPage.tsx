import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, Search, AlertTriangle, X,
  ChevronDown, ChevronUp, Clock, CheckCircle2,
  RefreshCw, Plus, Pencil
} from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import { createInventoryBatch, createInventoryItem, getInventory, getExpiringBatches, updateInventoryBatch, updateInventoryItem } from '@/services/inventory'
import { TopBar } from '@/components/layout/TopBar'
import { Modal } from '@/components/ui/Modal'
import { SkeletonList } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { InventoryItem, InventoryBatch } from '@/types'
import toast from 'react-hot-toast'

type InventoryTab = 'stock' | 'expiring'

function StockBadge({ stock, reorder }: { stock: number; reorder: number }) {
  if (stock <= 0) return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-500/15 text-danger-400">
      Out of Stock
    </span>
  )
  if (stock <= reorder) return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-500/15 text-warning-400">
      <AlertTriangle size={10} /> Low
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-500/15 text-success-400">
      <CheckCircle2 size={10} /> In Stock
    </span>
  )
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-surface-500 text-xs">No expiry</span>
  const days = differenceInDays(new Date(date), new Date())
  if (days <= 0)  return <span className="text-danger-400 text-xs font-semibold">Expired</span>
  if (days <= 7)  return <span className="text-danger-400 text-xs font-semibold">{days}d left</span>
  if (days <= 30) return <span className="text-warning-400 text-xs font-semibold">{days}d left</span>
  return <span className="text-surface-400 text-xs">{format(new Date(date), 'MMM yyyy')}</span>
}

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [expiringBatches, setExpiringBatches] = useState<InventoryBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expiryDays, setExpiryDays] = useState(30)
  const [formOpen, setFormOpen] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [batchFormOpen, setBatchFormOpen] = useState(false)
  const [batchFormLoading, setBatchFormLoading] = useState(false)
  const [editingBatch, setEditingBatch] = useState<InventoryBatch | null>(null)
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null)
  const [formValues, setFormValues] = useState({
    display_name: '',
    manufacturer: '',
    pack: '',
    hsn_code: '',
    current_stock: '0',
    unit: 'STRIP',
    reorder_level: '0',
  })
  const [batchFormValues, setBatchFormValues] = useState({
    batch_no: '',
    expiry_date: '',
    quantity: '0',
    mrp: '',
    purchase_rate: '',
  })

  const loadStock = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const data = await getInventory(q)
      setItems(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadExpiring = useCallback(async (days: number) => {
    setLoading(true)
    try {
      const data = await getExpiringBatches(days)
      setExpiringBatches(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'stock') {
      loadStock(search || undefined)
    } else {
      loadExpiring(expiryDays)
    }
  }, [activeTab, search, expiryDays, loadStock, loadExpiring])

  const filteredItems = items.filter(item =>
    !search || item.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => {
    setEditingItem(null)
    setFormValues({
      display_name: '',
      manufacturer: '',
      pack: '',
      hsn_code: '',
      current_stock: '0',
      unit: 'STRIP',
      reorder_level: '0',
    })
    setFormOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item)
    setFormValues({
      display_name: item.display_name || '',
      manufacturer: item.manufacturer || '',
      pack: item.pack || '',
      hsn_code: item.hsn_code || '',
      current_stock: String(item.current_stock ?? 0),
      unit: item.unit || 'STRIP',
      reorder_level: String(item.reorder_level ?? 0),
    })
    setFormOpen(true)
  }

  const handleSaveItem = async () => {
    if (!formValues.display_name.trim()) {
      toast.error('Item name is required')
      return
    }

    const payload = {
      display_name: formValues.display_name,
      manufacturer: formValues.manufacturer,
      pack: formValues.pack,
      hsn_code: formValues.hsn_code,
      current_stock: Number(formValues.current_stock || 0),
      unit: formValues.unit,
      reorder_level: Number(formValues.reorder_level || 0),
    }

    setFormLoading(true)
    try {
      if (editingItem) {
        const updated = await updateInventoryItem(editingItem.id, payload)
        setItems((prev) => prev.map((item) => item.id === updated.id ? updated : item))
        toast.success('Inventory item updated')
      } else {
        const created = await createInventoryItem(payload)
        setItems((prev) => [...prev, created].sort((a, b) => a.display_name.localeCompare(b.display_name)))
        toast.success('Inventory item added')
      }
      setFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save inventory item')
    } finally {
      setFormLoading(false)
    }
  }

  const openCreateBatch = (item: InventoryItem) => {
    setSelectedInventoryItem(item)
    setEditingBatch(null)
    setBatchFormValues({
      batch_no: '',
      expiry_date: '',
      quantity: '0',
      mrp: '',
      purchase_rate: '',
    })
    setBatchFormOpen(true)
  }

  const openEditBatch = (batch: InventoryBatch) => {
    const inventory = batch.inventory as InventoryItem | undefined
    setSelectedInventoryItem(inventory || null)
    setEditingBatch(batch)
    setBatchFormValues({
      batch_no: batch.batch_no || '',
      expiry_date: batch.expiry_date || '',
      quantity: String(batch.quantity ?? 0),
      mrp: batch.mrp != null ? String(batch.mrp) : '',
      purchase_rate: batch.purchase_rate != null ? String(batch.purchase_rate) : '',
    })
    setBatchFormOpen(true)
  }

  const handleSaveBatch = async () => {
    if (!selectedInventoryItem?.id) {
      toast.error('Inventory item is required')
      return
    }
    if (!batchFormValues.batch_no.trim()) {
      toast.error('Batch number is required')
      return
    }

    const payload = {
      inventory_id: selectedInventoryItem.id,
      batch_no: batchFormValues.batch_no,
      expiry_date: batchFormValues.expiry_date || null,
      quantity: Number(batchFormValues.quantity || 0),
      mrp: batchFormValues.mrp ? Number(batchFormValues.mrp) : null,
      purchase_rate: batchFormValues.purchase_rate ? Number(batchFormValues.purchase_rate) : null,
    }

    setBatchFormLoading(true)
    try {
      if (editingBatch) {
        await updateInventoryBatch(editingBatch.id, payload)
        toast.success('Batch updated')
      } else {
        await createInventoryBatch(payload)
        toast.success('Batch added')
      }

      await Promise.all([
        loadStock(search || undefined),
        loadExpiring(expiryDays),
      ])

      setBatchFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save batch')
    } finally {
      setBatchFormLoading(false)
    }
  }

  return (
    <div className="min-h-dvh max-w-screen-xl mx-auto">
      <TopBar
        title="Inventory"
        subtitle="Stock & expiry tracking"
        rightAction={
          activeTab === 'stock' ? (
            <button
              onClick={openCreate}
              className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition-colors"
              aria-label="Add inventory item"
            >
              <Plus size={18} />
            </button>
          ) : undefined
        }
      />

      {/* Tab Bar */}
      <div className="px-4 lg:px-8 pb-4 flex gap-2">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors
            ${activeTab === 'stock' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}
        >
          <Package size={14} /> Stock List
        </button>
        <button
          onClick={() => setActiveTab('expiring')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors
            ${activeTab === 'expiring' ? 'bg-warning-500 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}
        >
          <Clock size={14} /> Expiring
          {expiringBatches.length > 0 && activeTab !== 'expiring' && (
            <span className="w-4 h-4 rounded-full bg-warning-500 text-white text-xs flex items-center justify-center">
              {expiringBatches.length > 9 ? '9+' : expiringBatches.length}
            </span>
          )}
        </button>
      </div>

      <div className="px-4 lg:px-8 space-y-3 pb-6">

        {/* ── Stock Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'stock' && (
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search medicines, items..."
                className="input-base pl-9 pr-9 py-2.5 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {loading ? (
              <SkeletonList count={6} />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No inventory yet"
                description="Stock is automatically tracked when you scan purchase bills"
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {filteredItems.map(item => (
                  <motion.div
                    key={item.id}
                    layout
                    className="glass-card overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="w-full p-4 flex items-center gap-3 text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                        <Package size={18} className="text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{item.display_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.manufacturer && (
                            <span className="text-surface-500 text-xs truncate">{item.manufacturer}</span>
                          )}
                          {item.pack && (
                            <span className="text-brand-400 text-xs">{item.pack}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StockBadge stock={item.current_stock} reorder={item.reorder_level} />
                        <span className="text-white text-sm font-bold">
                          {item.current_stock} {item.unit}
                        </span>
                        {expandedId === item.id
                          ? <ChevronUp size={14} className="text-surface-500" />
                          : <ChevronDown size={14} className="text-surface-500" />
                        }
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedId === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-surface-700/30"
                        >
                          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-xs">
                            {item.hsn_code && (
                              <div>
                                <p className="text-surface-500 mb-0.5">HSN Code</p>
                                <p className="text-white font-mono">{item.hsn_code}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-surface-500 mb-0.5">Reorder At</p>
                              <p className="text-white">{item.reorder_level} {item.unit}</p>
                            </div>
                            <div>
                              <p className="text-surface-500 mb-0.5">Last Updated</p>
                              <p className="text-white">{format(new Date(item.updated_at), 'dd MMM yy')}</p>
                            </div>
                            <div className="col-span-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                  onClick={() => openEdit(item)}
                                  className="btn-secondary w-full py-2 text-xs"
                                >
                                  <Pencil size={14} />
                                  Edit Item
                                </button>
                                <button
                                  onClick={() => openCreateBatch(item)}
                                  className="btn-secondary w-full py-2 text-xs"
                                >
                                  <Plus size={14} />
                                  Add Batch
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Expiring Tab ──────────────────────────────────────────────── */}
        {activeTab === 'expiring' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-surface-400 text-sm shrink-0">Within</span>
              {[15, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setExpiryDays(d)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                    ${expiryDays === d ? 'bg-warning-500 text-white' : 'bg-surface-700 text-surface-300'}`}
                >
                  {d}d
                </button>
              ))}
              <button onClick={() => loadExpiring(expiryDays)} className="ml-auto text-brand-400">
                <RefreshCw size={15} />
              </button>
            </div>

            {loading ? (
              <SkeletonList count={5} />
            ) : expiringBatches.length === 0 ? (
              <div className="glass-card p-10 text-center">
                <CheckCircle2 size={40} className="text-success-400 mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">All Good!</p>
                <p className="text-surface-400 text-sm">No batches expiring within {expiryDays} days</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="glass-card px-4 py-3 flex justify-between">
                  <span className="text-surface-400 text-sm">{expiringBatches.length} batches expiring</span>
                  <span className="text-warning-400 text-sm font-medium">Review required</span>
                </div>
                {expiringBatches.map(batch => {
                  const days = batch.expiry_date
                    ? differenceInDays(new Date(batch.expiry_date), new Date())
                    : null
                  const isUrgent = days != null && days <= 7
                  return (
                    <div
                      key={batch.id}
                      className={`glass-card p-4 border ${isUrgent ? 'border-danger-500/30' : 'border-warning-500/20'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isUrgent ? 'bg-danger-500/15' : 'bg-warning-500/15'
                        }`}>
                          <AlertTriangle size={18} className={isUrgent ? 'text-danger-400' : 'text-warning-400'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">
                            {(batch.inventory as any)?.display_name || 'Unknown Item'}
                          </p>
                          <p className="text-surface-400 text-xs mt-0.5">
                            Batch: <span className="font-mono text-white">{batch.batch_no}</span>
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-surface-400 text-xs">Qty: {batch.quantity} strips</span>
                            <ExpiryBadge date={batch.expiry_date} />
                          </div>
                          {batch.mrp != null && (
                            <p className="text-surface-500 text-xs mt-1">
                              MRP: ₹{batch.mrp}
                            </p>
                          )}
                          <button
                            onClick={() => openEditBatch(batch)}
                            className="btn-secondary mt-3 w-full py-2 text-xs"
                          >
                            <Pencil size={14} />
                            Edit Batch
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
        size="lg"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Item Name</label>
            <input
              value={formValues.display_name}
              onChange={(e) => setFormValues((prev) => ({ ...prev, display_name: e.target.value }))}
              className="input-base"
              placeholder="e.g. Dolo 650"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Manufacturer</label>
              <input
                value={formValues.manufacturer}
                onChange={(e) => setFormValues((prev) => ({ ...prev, manufacturer: e.target.value }))}
                className="input-base"
                placeholder="Manufacturer"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Pack</label>
              <input
                value={formValues.pack}
                onChange={(e) => setFormValues((prev) => ({ ...prev, pack: e.target.value }))}
                className="input-base"
                placeholder="e.g. 1x10"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">HSN Code</label>
              <input
                value={formValues.hsn_code}
                onChange={(e) => setFormValues((prev) => ({ ...prev, hsn_code: e.target.value }))}
                className="input-base"
                placeholder="HSN"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Unit</label>
              <input
                value={formValues.unit}
                onChange={(e) => setFormValues((prev) => ({ ...prev, unit: e.target.value.toUpperCase() }))}
                className="input-base"
                placeholder="STRIP"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Current Stock</label>
              <input
                type="number"
                value={formValues.current_stock}
                onChange={(e) => setFormValues((prev) => ({ ...prev, current_stock: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Reorder Level</label>
              <input
                type="number"
                value={formValues.reorder_level}
                onChange={(e) => setFormValues((prev) => ({ ...prev, reorder_level: e.target.value }))}
                className="input-base"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setFormOpen(false)} className="btn-secondary flex-1 py-3">
              Cancel
            </button>
            <button
              onClick={handleSaveItem}
              disabled={formLoading || !formValues.display_name.trim()}
              className="btn-primary flex-1 py-3 disabled:opacity-50"
            >
              {formLoading ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={batchFormOpen}
        onClose={() => setBatchFormOpen(false)}
        title={editingBatch ? 'Edit Batch' : 'Add Batch'}
        size="lg"
      >
        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-surface-900/40 border border-surface-700/40 px-4 py-3">
            <p className="text-surface-400 text-xs mb-1">Inventory Item</p>
            <p className="text-white text-sm font-semibold">{selectedInventoryItem?.display_name || 'Unknown item'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Batch Number</label>
              <input
                value={batchFormValues.batch_no}
                onChange={(e) => setBatchFormValues((prev) => ({ ...prev, batch_no: e.target.value }))}
                className="input-base"
                placeholder="e.g. AB1234"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Expiry Date</label>
              <input
                type="date"
                value={batchFormValues.expiry_date}
                onChange={(e) => setBatchFormValues((prev) => ({ ...prev, expiry_date: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Quantity</label>
              <input
                type="number"
                value={batchFormValues.quantity}
                onChange={(e) => setBatchFormValues((prev) => ({ ...prev, quantity: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">MRP</label>
              <input
                type="number"
                value={batchFormValues.mrp}
                onChange={(e) => setBatchFormValues((prev) => ({ ...prev, mrp: e.target.value }))}
                className="input-base"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Purchase Rate</label>
              <input
                type="number"
                value={batchFormValues.purchase_rate}
                onChange={(e) => setBatchFormValues((prev) => ({ ...prev, purchase_rate: e.target.value }))}
                className="input-base"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setBatchFormOpen(false)} className="btn-secondary flex-1 py-3">
              Cancel
            </button>
            <button
              onClick={handleSaveBatch}
              disabled={batchFormLoading || !batchFormValues.batch_no.trim()}
              className="btn-primary flex-1 py-3 disabled:opacity-50"
            >
              {batchFormLoading ? 'Saving...' : 'Save Batch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

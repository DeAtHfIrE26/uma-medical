import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, SlidersHorizontal, FileText,
  Calendar, ChevronRight, X, Filter
} from 'lucide-react'
import { format } from 'date-fns'
import { getBills, getVendors } from '@/services/bills'
import { TopBar } from '@/components/layout/TopBar'
import { PaymentModeBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import type { Bill, Vendor, BillFilters } from '@/types'

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export function BillsPage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState<Bill[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [filters, setFilters] = useState<BillFilters>({
    search: '',
    sort_by: 'created_at',
    sort_order: 'desc',
    page: 1,
    limit: 20,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getBills(filters)
      setBills(result.bills)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    getVendors().then(setVendors).catch(() => {})
  }, [])

  const handleSearch = (value: string) => {
    setFilters(f => ({ ...f, search: value, page: 1 }))
  }

  const clearFilters = () => {
    setFilters({ sort_by: 'created_at', sort_order: 'desc', page: 1, limit: 20, search: '' })
  }

  const activeFilterCount = [
    filters.vendor_id,
    filters.date_from,
    filters.date_to,
    filters.payment_mode,
  ].filter(Boolean).length

  return (
    <div className="min-h-dvh">
      <TopBar title="Bills" subtitle={`${total} records found`} />

      {/* Search + Filter Bar */}
      <div className="px-4 pb-4 flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="search"
            value={filters.search || ''}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search bills, vendors..."
            className="input-base pl-9 pr-4 py-2.5 text-sm"
          />
          {filters.search && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setFiltersOpen(true)}
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors
            ${activeFilterCount > 0 ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'}`}
        >
          <SlidersHorizontal size={18} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger-500 rounded-full text-white text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <Filter size={12} className="text-surface-400" />
          <span className="text-surface-400 text-xs">Filters active</span>
          <button onClick={clearFilters} className="text-brand-400 text-xs ml-auto flex items-center gap-1">
            <X size={12} /> Clear all
          </button>
        </div>
      )}

      {/* Bills List */}
      <div className="px-4 space-y-2.5 pb-4">
        {loading ? (
          <SkeletonList count={5} />
        ) : bills.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No bills found"
            description="Start by scanning or uploading a pharmaceutical bill"
            action={
              <button onClick={() => navigate('/scan')} className="btn-primary px-6">
                Scan First Bill
              </button>
            }
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2.5"
          >
            {bills.map((bill, i) => (
              <motion.button
                key={bill.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/bills/${bill.id}`)}
                className="glass-card w-full text-left p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
              >
                {/* Vendor avatar */}
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600/30 to-cyan-600/30 border border-brand-500/20 flex items-center justify-center text-brand-300 font-bold text-sm shrink-0">
                  {((bill.vendor as { name: string } | undefined)?.name || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-white text-sm font-semibold truncate">
                    {(bill.vendor as { name: string } | undefined)?.name || 'Unknown Vendor'}
                  </p>
                  <div className="flex items-center gap-2">
                    {bill.invoice_no && (
                      <span className="text-surface-400 text-xs font-mono">#{bill.invoice_no}</span>
                    )}
                    {bill.invoice_date && (
                      <span className="text-surface-500 text-xs flex items-center gap-0.5">
                        <Calendar size={10} />
                        {format(new Date(bill.invoice_date), 'dd MMM yy')}
                      </span>
                    )}
                  </div>
                  <PaymentModeBadge mode={bill.payment_mode} />
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-white text-sm font-bold">{formatCurrency(bill.net_amount)}</p>
                  <ChevronRight size={16} className="text-surface-600" />
                </div>
              </motion.button>
            ))}

            {total > bills.length && (
              <button
                onClick={() => setFilters(f => ({ ...f, page: (f.page || 1) + 1 }))}
                className="btn-secondary w-full py-3 text-sm"
              >
                Load more
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Filter Modal */}
      <Modal isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter Bills">
        <div className="p-5 space-y-4">
          {/* Vendor filter */}
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Vendor</label>
            <select
              value={filters.vendor_id || ''}
              onChange={e => setFilters(f => ({ ...f, vendor_id: e.target.value || undefined, page: 1 }))}
              className="input-base"
            >
              <option value="">All vendors</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">From</label>
              <input
                type="date"
                value={filters.date_from || ''}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined, page: 1 }))}
                className="input-base text-sm"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">To</label>
              <input
                type="date"
                value={filters.date_to || ''}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined, page: 1 }))}
                className="input-base text-sm"
              />
            </div>
          </div>

          {/* Payment mode */}
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Payment Mode</label>
            <div className="flex gap-2 flex-wrap">
              {['', 'CASH', 'CREDIT', 'CHEQUE'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilters(f => ({ ...f, payment_mode: mode || undefined, page: 1 }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                    ${(filters.payment_mode || '') === mode
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                    }`}
                >
                  {mode || 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Sort By</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'created_at', label: 'Date Added' },
                { value: 'invoice_date', label: 'Invoice Date' },
                { value: 'net_amount', label: 'Amount' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilters(f => ({
                    ...f,
                    sort_by: value as BillFilters['sort_by'],
                    sort_order: f.sort_by === value && f.sort_order === 'desc' ? 'asc' : 'desc',
                    page: 1,
                  }))}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left
                    ${filters.sort_by === value
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                    }`}
                >
                  {label}
                  {filters.sort_by === value && (
                    <span className="ml-1">{filters.sort_order === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={clearFilters} className="btn-secondary flex-1 py-2.5 text-sm">Clear All</button>
            <button onClick={() => setFiltersOpen(false)} className="btn-primary flex-1 py-2.5 text-sm">Apply</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

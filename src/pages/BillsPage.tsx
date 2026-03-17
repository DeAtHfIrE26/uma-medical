import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, SlidersHorizontal, FileText,
  Calendar, ChevronRight, X, Filter,
  AlertTriangle, Clock, AlertCircle, CheckCircle2
} from 'lucide-react'
import { format } from 'date-fns'
import { getBills, getVendors } from '@/services/bills'
import { TopBar } from '@/components/layout/TopBar'
import { PaymentModeBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import type { Bill, Vendor, BillFilters, PaymentStatus } from '@/types'

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function PaymentStatusBadge({ status }: { status: PaymentStatus | string | null | undefined }) {
  if (!status) return null
  if (status === 'PAID') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-success-500/15 text-success-400">
      <CheckCircle2 size={9} /> PAID
    </span>
  )
  if (status === 'PARTIAL') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-warning-500/15 text-warning-400">
      <Clock size={9} /> PARTIAL
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-danger-500/15 text-danger-400">
      <AlertCircle size={9} /> UNPAID
    </span>
  )
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
    filters.payment_status,
    filters.needs_review,
  ].filter(Boolean).length

  return (
    <div className="min-h-dvh max-w-screen-xl mx-auto">
      <TopBar title="Bills" subtitle={`${total} records found`} />

      {/* ── Search + Filter bar ───────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pb-4 flex gap-2">
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

      {activeFilterCount > 0 && (
        <div className="px-4 lg:px-8 pb-3 flex items-center gap-2">
          <Filter size={12} className="text-surface-400" />
          <span className="text-surface-400 text-xs">Filters active</span>
          <button onClick={clearFilters} className="text-brand-400 text-xs ml-auto flex items-center gap-1">
            <X size={12} /> Clear all
          </button>
        </div>
      )}

      {/* ── Bill list: cards on mobile/tablet, table on desktop ─────────── */}
      <div className="px-4 lg:px-8 pb-4">
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
          <>
            {/* ── Mobile / tablet card list ──────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:hidden space-y-2.5"
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
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600/30 to-cyan-600/30 border border-brand-500/20 flex items-center justify-center text-brand-300 font-bold text-sm shrink-0 relative">
                    {((bill.vendor as { name: string } | undefined)?.name || 'U').charAt(0).toUpperCase()}
                    {bill.needs_review && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-warning-500 rounded-full flex items-center justify-center">
                        <AlertTriangle size={9} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-white text-sm font-semibold truncate">
                      {(bill.vendor as { name: string } | undefined)?.name || 'Unknown Vendor'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PaymentModeBadge mode={bill.payment_mode} />
                      <PaymentStatusBadge status={bill.payment_status} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-white text-sm font-bold">{formatCurrency(bill.net_amount)}</p>
                    {bill.balance_due != null && bill.balance_due > 0 && (
                      <p className="text-danger-400 text-xs">Due: {formatCurrency(bill.balance_due)}</p>
                    )}
                    <ChevronRight size={16} className="text-surface-600" />
                  </div>
                </motion.button>
              ))}
            </motion.div>

            {/* ── Desktop table view ─────────────────────────────────── */}
            <div className="hidden lg:block glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/40">
                    <th className="text-left px-5 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Vendor</th>
                    <th className="text-left px-4 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Invoice</th>
                    <th className="text-left px-4 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Mode</th>
                    <th className="text-left px-4 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Amount</th>
                    <th className="text-right px-5 py-3.5 text-surface-400 font-semibold text-xs uppercase tracking-wider">Due</th>
                    <th className="px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700/25">
                  {bills.map(bill => (
                    <tr
                      key={bill.id}
                      onClick={() => navigate(`/bills/${bill.id}`)}
                      className="hover:bg-surface-700/20 cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600/30 to-cyan-600/30 border border-brand-500/20 flex items-center justify-center text-brand-300 font-bold text-xs shrink-0 relative">
                            {((bill.vendor as { name: string } | undefined)?.name || 'U').charAt(0).toUpperCase()}
                            {bill.needs_review && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-warning-500 rounded-full" />
                            )}
                          </div>
                          <span className="text-white font-medium truncate max-w-[180px]">
                            {(bill.vendor as { name: string } | undefined)?.name || 'Unknown Vendor'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-surface-300 font-mono text-xs">
                        {bill.invoice_no ? `#${bill.invoice_no}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-surface-400 text-xs whitespace-nowrap">
                        {bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <PaymentModeBadge mode={bill.payment_mode} />
                      </td>
                      <td className="px-4 py-3.5">
                        <PaymentStatusBadge status={bill.payment_status} />
                      </td>
                      <td className="px-5 py-3.5 text-right text-white font-semibold">
                        {formatCurrency(bill.net_amount)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {bill.balance_due != null && bill.balance_due > 0
                          ? <span className="text-danger-400 font-medium">{formatCurrency(bill.balance_due)}</span>
                          : <span className="text-surface-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ChevronRight size={16} className="text-surface-600 group-hover:text-surface-400 transition-colors ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > bills.length && (
              <button
                onClick={() => setFilters(f => ({ ...f, page: (f.page || 1) + 1 }))}
                className="btn-secondary w-full py-3 text-sm mt-3"
              >
                Load more
              </button>
            )}
          </>
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

          {/* Payment status */}
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Payment Status</label>
            <div className="flex gap-2 flex-wrap">
              {(['', 'UNPAID', 'PARTIAL', 'PAID'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilters(f => ({ ...f, payment_status: s as PaymentStatus || undefined, page: 1 }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                    ${(filters.payment_status || '') === s
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                    }`}
                >
                  {s || 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Needs review toggle */}
          <div className="flex items-center justify-between">
            <label className="text-surface-300 text-sm font-medium">Needs Review Only</label>
            <button
              onClick={() => setFilters(f => ({ ...f, needs_review: !f.needs_review, page: 1 }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${filters.needs_review ? 'bg-warning-500' : 'bg-surface-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${filters.needs_review ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
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

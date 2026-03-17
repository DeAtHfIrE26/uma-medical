import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3, TrendingUp, IndianRupee, FileText,
  Calendar, ChevronRight, BookOpen, TrendingDown,
  CheckCircle2, AlertCircle, Clock
} from 'lucide-react'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/layout/TopBar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { Bill } from '@/types'

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

interface MonthStats {
  month: string
  label: string
  count: number
  amount: number
  paidCount: number
  unpaidAmount: number
}

interface DayEntry {
  bill: Bill
  vendor: string
}

type ReportTab = 'monthly' | 'daybook' | 'pl'

export function HistoryPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ReportTab>('monthly')
  const [loading, setLoading] = useState(true)
  const [monthlyStats, setMonthlyStats] = useState<MonthStats[]>([])
  const [maxAmount, setMaxAmount] = useState(1)

  // Day Book state
  const [dayBookDate, setDayBookDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([])
  const [dayLoading, setDayLoading] = useState(false)

  // P&L state
  const [plMonth, setPlMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [plData, setPlData] = useState<{
    purchases: number
    purchaseReturns: number
    payments: number
    openingStock: number
    closingStock: number
    grossProfit: number
  } | null>(null)
  const [plLoading, setPlLoading] = useState(false)

  // Load 6-month stats in parallel (all queries at once)
  useEffect(() => {
    async function loadMonthly() {
      const now = new Date()
      const queries: Array<{ date: Date; start: string; end: string; label: string; month: string }> = []

      for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i)
        const start = format(startOfMonth(date), 'yyyy-MM-dd')
        const end = format(endOfMonth(date), 'yyyy-MM-dd')
        queries.push({ date, start, end, label: format(date, 'MMM yy'), month: format(date, 'yyyy-MM') })
      }

      const results = await Promise.all(
        queries.map(({ start, end }) =>
          supabase
            .from('bills')
            .select('net_amount, amount_paid, payment_status')
            .eq('transaction_type', 'PURCHASE')
            .gte('invoice_date', start)
            .lte('invoice_date', end)
        )
      )

      const months: MonthStats[] = results.map((res, i) => {
        const data = res.data || []
        const amount = data.reduce((s, b) => s + (b.net_amount || 0), 0)
        const paidCount = data.filter(b => b.payment_status === 'PAID').length
        const unpaidAmount = data.reduce((s, b) => s + ((b.net_amount || 0) - (b.amount_paid || 0)), 0)
        return {
          month: queries[i].month,
          label: queries[i].label,
          count: data.length,
          amount,
          paidCount,
          unpaidAmount,
        }
      })

      setMonthlyStats(months)
      setMaxAmount(Math.max(...months.map(m => m.amount), 1))
      setLoading(false)
    }

    loadMonthly()
  }, [])

  // Load Day Book when date changes
  useEffect(() => {
    if (activeTab !== 'daybook') return
    loadDayBook(dayBookDate)
  }, [dayBookDate, activeTab])

  async function loadDayBook(date: string) {
    setDayLoading(true)
    try {
      const { data } = await supabase
        .from('bills')
        .select('*, vendor:vendors(name)')
        .eq('invoice_date', date)
        .order('created_at', { ascending: true })

      setDayEntries(
        (data || []).map(b => ({
          bill: b as Bill,
          vendor: (b.vendor as { name: string } | null)?.name || 'Unknown',
        }))
      )
    } finally {
      setDayLoading(false)
    }
  }

  // Load P&L when month changes
  useEffect(() => {
    if (activeTab !== 'pl') return
    loadPL(plMonth)
  }, [plMonth, activeTab])

  async function loadPL(month: string) {
    setPlLoading(true)
    try {
      const start = `${month}-01`
      const date = new Date(start)
      const end = format(endOfMonth(date), 'yyyy-MM-dd')

      const [purchases, returns, payments] = await Promise.all([
        supabase.from('bills').select('net_amount').eq('transaction_type', 'PURCHASE')
          .gte('invoice_date', start).lte('invoice_date', end),
        supabase.from('bills').select('net_amount').eq('transaction_type', 'PURCHASE_RETURN')
          .gte('invoice_date', start).lte('invoice_date', end),
        supabase.from('bills').select('net_amount').eq('transaction_type', 'PAYMENT_OUT')
          .gte('invoice_date', start).lte('invoice_date', end),
      ])

      const totalPurchases   = (purchases.data || []).reduce((s, b) => s + (b.net_amount || 0), 0)
      const totalReturns     = (returns.data  || []).reduce((s, b) => s + (b.net_amount || 0), 0)
      const totalPayments    = (payments.data || []).reduce((s, b) => s + (b.net_amount || 0), 0)

      setPlData({
        purchases: totalPurchases,
        purchaseReturns: totalReturns,
        payments: totalPayments,
        openingStock: 0,
        closingStock: 0,
        grossProfit: totalReturns - totalPurchases + totalPayments,
      })
    } finally {
      setPlLoading(false)
    }
  }

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'monthly', label: 'Monthly', icon: BarChart3 },
    { id: 'daybook', label: 'Day Book', icon: BookOpen },
    { id: 'pl',      label: 'P & L',   icon: TrendingUp },
  ]

  const totalBills  = monthlyStats.reduce((s, m) => s + m.count, 0)
  const totalAmount = monthlyStats.reduce((s, m) => s + m.amount, 0)
  const avgPerMonth = totalAmount / Math.max(monthlyStats.filter(m => m.count > 0).length, 1)

  return (
    <div className="min-h-dvh max-w-screen-xl mx-auto">
      <TopBar title="Reports" subtitle="Analytics & Day Book" />

      {/* Tab Bar */}
      <div className="px-4 pb-4 flex gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${activeTab === id
                ? 'bg-brand-500 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
              }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="px-4 space-y-5 pb-6">

          {/* ── Monthly Tab ──────────────────────────────────────────────── */}
          {activeTab === 'monthly' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-card p-3 text-center">
                  <FileText size={18} className="text-brand-400 mx-auto mb-1.5" />
                  <p className="font-display font-bold text-lg text-white">{totalBills}</p>
                  <p className="text-surface-500 text-xs">Total Bills</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <IndianRupee size={18} className="text-success-400 mx-auto mb-1.5" />
                  <p className="font-display font-bold text-base text-white leading-tight">
                    {formatCurrency(totalAmount).replace('₹', '')}
                  </p>
                  <p className="text-surface-500 text-xs">Total Value</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <TrendingUp size={18} className="text-warning-400 mx-auto mb-1.5" />
                  <p className="font-display font-bold text-base text-white leading-tight">
                    {formatCurrency(avgPerMonth).replace('₹', '')}
                  </p>
                  <p className="text-surface-500 text-xs">Avg/Month</p>
                </div>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 size={16} className="text-brand-400" />
                  <h3 className="font-display font-semibold text-white text-sm">Monthly Purchases</h3>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {monthlyStats.map((m, i) => {
                    const heightPct = maxAmount > 0 ? (m.amount / maxAmount) * 100 : 0
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(heightPct, 2)}%` }}
                          transition={{ delay: i * 0.08, duration: 0.5, ease: 'easeOut' }}
                          className={`w-full rounded-t-lg ${m.amount > 0 ? 'bg-gradient-to-t from-brand-600 to-brand-400' : 'bg-surface-700'}`}
                          style={{ minHeight: '4px' }}
                        />
                        <span className="text-surface-500 text-xs">{m.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="glass-card divide-y divide-surface-700/20">
                {monthlyStats.map(m => m.count > 0 && (
                  <div key={m.month} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm font-medium flex items-center gap-1.5">
                        <Calendar size={12} className="text-brand-400" />
                        {m.label}
                      </span>
                      <span className="text-white text-sm font-bold">{formatCurrency(m.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-surface-400">{m.count} bills · {m.paidCount} paid</span>
                      {m.unpaidAmount > 0 && (
                        <span className="text-danger-400">Due: {formatCurrency(m.unpaidAmount)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Day Book Tab ──────────────────────────────────────────────── */}
          {activeTab === 'daybook' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-brand-400 shrink-0" />
                <input
                  type="date"
                  value={dayBookDate}
                  onChange={e => setDayBookDate(e.target.value)}
                  className="input-base flex-1"
                />
              </div>

              {dayLoading ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingSpinner size="md" />
                </div>
              ) : dayEntries.length === 0 ? (
                <div className="glass-card p-10 text-center">
                  <BookOpen size={32} className="text-surface-600 mx-auto mb-3" />
                  <p className="text-surface-400 text-sm">No transactions for {format(new Date(dayBookDate + 'T00:00:00'), 'dd MMM yyyy')}</p>
                </div>
              ) : (
                <>
                  <div className="glass-card px-4 py-3 flex justify-between items-center">
                    <span className="text-surface-400 text-sm">{dayEntries.length} transactions</span>
                    <span className="text-white font-bold">
                      {formatCurrency(dayEntries.reduce((s, e) => s + (e.bill.net_amount || 0), 0))}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {dayEntries.map(({ bill, vendor }) => (
                      <button
                        key={bill.id}
                        onClick={() => navigate(`/bills/${bill.id}`)}
                        className="glass-card w-full text-left p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          bill.transaction_type === 'PURCHASE'        ? 'bg-brand-500/15' :
                          bill.transaction_type === 'PAYMENT_OUT'    ? 'bg-danger-500/15' :
                          bill.transaction_type === 'PURCHASE_RETURN' ? 'bg-success-500/15' :
                          'bg-surface-700'
                        }`}>
                          {bill.transaction_type === 'PAYMENT_OUT'
                            ? <TrendingDown size={18} className="text-danger-400" />
                            : bill.transaction_type === 'PURCHASE_RETURN'
                            ? <TrendingUp size={18} className="text-success-400" />
                            : <FileText size={18} className="text-brand-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{vendor}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-surface-500 text-xs">
                              {(bill.transaction_type || 'PURCHASE').replace('_', ' ')}
                            </span>
                            {bill.invoice_no && (
                              <span className="text-surface-500 text-xs font-mono">#{bill.invoice_no}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {bill.payment_status === 'PAID' && (
                              <span className="text-[10px] text-success-400 flex items-center gap-0.5">
                                <CheckCircle2 size={9} /> PAID
                              </span>
                            )}
                            {bill.payment_status === 'UNPAID' && (
                              <span className="text-[10px] text-danger-400 flex items-center gap-0.5">
                                <AlertCircle size={9} /> UNPAID
                              </span>
                            )}
                            {bill.payment_status === 'PARTIAL' && (
                              <span className="text-[10px] text-warning-400 flex items-center gap-0.5">
                                <Clock size={9} /> PARTIAL
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white text-sm font-bold">
                            {bill.transaction_type === 'PURCHASE_RETURN' ? '+' : ''}
                            {formatCurrency(bill.net_amount ?? 0)}
                          </p>
                          <ChevronRight size={14} className="text-surface-600 ml-auto mt-1" />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── P&L Tab ───────────────────────────────────────────────────── */}
          {activeTab === 'pl' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center gap-3">
                <TrendingUp size={16} className="text-brand-400 shrink-0" />
                <input
                  type="month"
                  value={plMonth}
                  onChange={e => setPlMonth(e.target.value)}
                  className="input-base flex-1"
                />
              </div>

              {plLoading ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingSpinner size="md" />
                </div>
              ) : plData ? (
                <div className="space-y-3">
                  <div className="glass-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-surface-700/30">
                      <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider">Purchase Summary</p>
                    </div>
                    <div className="divide-y divide-surface-700/20">
                      <PLRow label="Total Purchases" value={plData.purchases} negative />
                      <PLRow label="Purchase Returns" value={plData.purchaseReturns} positive />
                      <PLRow label="Net Purchases" value={plData.purchases - plData.purchaseReturns} negative bold />
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-surface-700/30">
                      <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider">Payments</p>
                    </div>
                    <PLRow label="Total Payments Out" value={plData.payments} negative />
                  </div>

                  <div className="glass-card px-4 py-4 flex justify-between items-center">
                    <div>
                      <p className="text-surface-400 text-xs mb-1">Net Position</p>
                      <p className="font-display font-bold text-white text-lg">
                        {formatCurrency(Math.abs(plData.purchases - plData.purchaseReturns))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-surface-400 text-xs mb-1">
                        {format(new Date(plMonth + '-01'), 'MMMM yyyy')}
                      </p>
                      <p className={`text-sm font-semibold ${plData.purchases > 0 ? 'text-danger-400' : 'text-success-400'}`}>
                        {plData.purchases > 0 ? 'You Owe' : 'Credit'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}

        </div>
      )}
    </div>
  )
}

function PLRow({
  label, value, negative, positive, bold
}: {
  label: string
  value: number
  negative?: boolean
  positive?: boolean
  bold?: boolean
}) {
  return (
    <div className={`flex justify-between px-4 py-3 ${bold ? 'bg-surface-800/50' : ''}`}>
      <span className={`text-sm ${bold ? 'text-white font-semibold' : 'text-surface-300'}`}>{label}</span>
      <span className={`text-sm font-medium ${
        bold ? 'text-white font-bold' :
        positive ? 'text-success-400' :
        negative ? 'text-danger-400' :
        'text-white'
      }`}>
        {negative && value > 0 ? '- ' : positive && value > 0 ? '+ ' : ''}
        {formatCurrency(value)}
      </span>
    </div>
  )
}

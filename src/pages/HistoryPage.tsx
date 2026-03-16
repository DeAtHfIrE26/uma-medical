import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3, TrendingUp, IndianRupee, FileText,
  Calendar, Building2, ChevronRight
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
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [monthlyStats, setMonthlyStats] = useState<MonthStats[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [maxAmount, setMaxAmount] = useState(1)

  useEffect(() => {
    async function load() {
      // Get last 6 months of data
      const months: MonthStats[] = []
      const now = new Date()

      for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i)
        const start = format(startOfMonth(date), 'yyyy-MM-dd')
        const end = format(endOfMonth(date), 'yyyy-MM-dd')
        const label = format(date, 'MMM yy')
        const month = format(date, 'yyyy-MM')

        const { data, count } = await supabase
          .from('bills')
          .select('net_amount', { count: 'exact' })
          .gte('invoice_date', start)
          .lte('invoice_date', end)

        const amount = (data || []).reduce((s, b) => s + (b.net_amount || 0), 0)
        months.push({ month, label, count: count || 0, amount })
      }

      setMonthlyStats(months)
      setMaxAmount(Math.max(...months.map(m => m.amount), 1))

      // All bills for timeline
      const { data: allBills } = await supabase
        .from('bills')
        .select('*, vendor:vendors(name)')
        .order('invoice_date', { ascending: false })
        .limit(30)

      setBills((allBills || []) as Bill[])
      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const totalBills = monthlyStats.reduce((s, m) => s + m.count, 0)
  const totalAmount = monthlyStats.reduce((s, m) => s + m.amount, 0)
  const avgPerMonth = totalAmount / Math.max(monthlyStats.filter(m => m.count > 0).length, 1)

  return (
    <div className="min-h-dvh">
      <TopBar title="Reports" subtitle="Last 6 months analytics" />

      <div className="px-4 space-y-5 pb-6">
        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
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
        </motion.div>

        {/* Monthly Chart */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-brand-400" />
            <h3 className="font-display font-semibold text-white text-sm">Monthly Billing</h3>
          </div>

          {/* Bar Chart */}
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

          {/* Monthly detail */}
          <div className="mt-4 space-y-1">
            {monthlyStats.map(m => m.count > 0 && (
              <div key={m.month} className="flex items-center justify-between text-xs py-1">
                <span className="text-surface-400 flex items-center gap-1.5">
                  <Calendar size={11} className="text-brand-400" />
                  {m.label}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-surface-400">{m.count} bills</span>
                  <span className="text-white font-medium">{formatCurrency(m.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Bills Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="font-display font-semibold text-base text-white mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-brand-400" />
            Bill Timeline
          </h3>

          {bills.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-surface-400 text-sm">No bills recorded yet</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-surface-700/50" />

              <div className="space-y-3 pl-12">
                {bills.map(bill => {
                  const vendor = bill.vendor as { name: string } | undefined
                  return (
                    <button
                      key={bill.id}
                      onClick={() => navigate(`/bills/${bill.id}`)}
                      className="glass-card w-full text-left p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform relative"
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-7 w-3 h-3 rounded-full bg-brand-500 border-2 border-surface-900" />

                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">
                          {vendor?.name || 'Unknown Vendor'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {bill.invoice_no && (
                            <span className="text-surface-500 text-xs font-mono">#{bill.invoice_no}</span>
                          )}
                          {bill.invoice_date && (
                            <span className="text-surface-400 text-xs">
                              {format(new Date(bill.invoice_date), 'dd MMM yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-1">
                        <p className="text-brand-300 text-sm font-bold">
                          {bill.net_amount ? formatCurrency(bill.net_amount) : '—'}
                        </p>
                        <ChevronRight size={14} className="text-surface-600" />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

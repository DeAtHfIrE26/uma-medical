import { PaymentModeBadge } from '@/components/ui/Badge'
import { SkeletonList } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/services/auth'
import { getDashboardStats } from '@/services/bills'
import { useAuthStore } from '@/stores/auth'
import type { DashboardStats } from '@/types'
import { differenceInDays, format } from 'date-fns'
import { motion } from 'framer-motion'
import {
    AlertCircle,
    AlertTriangle,
    Building2,
    Calendar,
    ChevronRight,
    FileText,
    IndianRupee,
    LogOut,
    Package,
    Settings,
    TrendingUp
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }

export function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(() => {
    getDashboardStats()
      .then(setStats)
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Realtime: refresh dashboard on any new bill insert
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-bills-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills' },
        () => { getDashboardStats().then(setStats).catch(() => {}) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    /* ── Responsive page shell ───────────────────────────────────────────── */
    <div className="px-4 lg:px-8 pt-5 lg:pt-8 pb-6 max-w-screen-xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 lg:mb-8">
        <div>
          <p className="text-surface-400 text-xs mb-0.5">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
          <h1 className="font-display font-bold text-2xl lg:text-3xl text-white">
            Hey, {profile?.full_name?.split(' ')[0] || 'Admin'} 👋
          </h1>
        </div>
        {/* Header actions — hidden on desktop (sidebar handles these) */}
        <div className="flex gap-2 lg:hidden">
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center text-surface-400 hover:text-danger-400 hover:bg-surface-700 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonList count={4} />
      ) : stats ? (
        <motion.div variants={container} initial="hidden" animate="show">

          {/* ── Alert banners ────────────────────────────────────────────── */}
          {((stats.expiringBatches && stats.expiringBatches.length > 0) || stats.totalOutstanding > 0) && (
            <motion.div variants={item} className="grid gap-3 sm:grid-cols-2 mb-6">
              {stats.expiringBatches && stats.expiringBatches.length > 0 && (
                <button
                  onClick={() => navigate('/inventory')}
                  className="p-3.5 rounded-2xl bg-warning-500/10 border border-warning-500/30 flex items-center gap-3 text-left w-full"
                >
                  <div className="w-9 h-9 rounded-xl bg-warning-500/20 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-warning-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-warning-400 text-sm font-semibold truncate">
                      {stats.expiringBatches.length} batch{stats.expiringBatches.length > 1 ? 'es' : ''} expiring soon
                    </p>
                    <p className="text-warning-300 text-xs mt-0.5">Tap to view inventory</p>
                  </div>
                  <ChevronRight size={16} className="text-warning-400 shrink-0" />
                </button>
              )}
              {stats.totalOutstanding > 0 && (
                <button
                  onClick={() => navigate('/bills', { state: { filter: 'UNPAID' } })}
                  className="p-3.5 rounded-2xl bg-danger-500/10 border border-danger-500/30 flex items-center gap-3 text-left w-full"
                >
                  <div className="w-9 h-9 rounded-xl bg-danger-500/20 flex items-center justify-center shrink-0">
                    <AlertCircle size={18} className="text-danger-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-danger-400 text-sm font-semibold truncate">
                      {formatCurrency(stats.totalOutstanding)} outstanding
                    </p>
                    <p className="text-danger-300 text-xs mt-0.5">
                      {stats.unpaidBillsCount} unpaid bill{stats.unpaidBillsCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-danger-400 shrink-0" />
                </button>
              )}
            </motion.div>
          )}

          {/* ── Stats grid: 2-col mobile, 4-col desktop ──────────────────── */}
          <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
            <StatCard
              icon={FileText}
              label="Total Bills"
              value={stats.totalBills.toString()}
              sublabel={`${stats.thisMonthBills} this month`}
              iconColor="text-brand-400"
              iconBg="bg-brand-500/10"
            />
            <StatCard
              icon={IndianRupee}
              label="Total Value"
              value={formatCurrency(stats.totalAmount)}
              sublabel={`${formatCurrency(stats.thisMonthAmount)} this month`}
              iconColor="text-success-400"
              iconBg="bg-success-500/10"
            />
            <StatCard
              icon={Building2}
              label="Vendors"
              value={stats.uniqueVendors.toString()}
              sublabel="Unique suppliers"
              iconColor="text-cyan-400"
              iconBg="bg-cyan-500/10"
            />
            <StatCard
              icon={TrendingUp}
              label="This Month"
              value={stats.thisMonthBills.toString()}
              sublabel="Bills recorded"
              iconColor="text-warning-400"
              iconBg="bg-warning-500/10"
            />
          </motion.div>

          {/*
            Desktop: 2-column side-by-side panels
            Mobile: stacked single column
          */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Recent Bills ─────────────────────────────────────────── */}
            {stats.recentBills.length > 0 && (
              <motion.div variants={item}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-semibold text-base text-white">Recent Bills</h2>
                  <button onClick={() => navigate('/bills')} className="text-brand-400 text-xs flex items-center gap-0.5">
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  {stats.recentBills.map(bill => (
                    <button
                      key={bill.id}
                      onClick={() => navigate(`/bills/${bill.id}`)}
                      className="glass-card w-full text-left px-4 py-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
                    >
                      <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {(bill.vendor as { name: string } | undefined)?.name || 'Unknown Vendor'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Calendar size={11} className="text-surface-500" />
                          <span className="text-surface-400 text-xs">
                            {bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMM yyyy') : 'No date'}
                          </span>
                          {bill.invoice_no && (
                            <span className="text-surface-500 text-xs">· #{bill.invoice_no}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white text-sm font-semibold">
                          {bill.net_amount ? formatCurrency(bill.net_amount) : '—'}
                        </p>
                        <PaymentModeBadge mode={bill.payment_mode} />
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Right column: Top Vendors + Expiring Batches ─────────── */}
            <div className="space-y-6">

              {/* Top Vendors */}
              {stats.topVendors.length > 0 && (
                <motion.div variants={item}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display font-semibold text-base text-white">Top Vendors</h2>
                    <button onClick={() => navigate('/vendors')} className="text-brand-400 text-xs flex items-center gap-0.5">
                      View all <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="glass-card divide-y divide-surface-700/30">
                    {stats.topVendors.map((v, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-600 to-cyan-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {v.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{v.name}</p>
                          <p className="text-surface-400 text-xs">{v.count} bills</p>
                        </div>
                        <p className="text-success-400 text-sm font-medium shrink-0">
                          {formatCurrency(v.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Expiring Batches Preview */}
              {stats.expiringBatches && stats.expiringBatches.length > 0 && (
                <motion.div variants={item}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display font-semibold text-base text-white flex items-center gap-2">
                      <Package size={16} className="text-warning-400" />
                      Expiring Soon
                    </h2>
                    <button onClick={() => navigate('/inventory')} className="text-brand-400 text-xs flex items-center gap-0.5">
                      View all <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="glass-card divide-y divide-surface-700/30">
                    {stats.expiringBatches.slice(0, 4).map((batch: any) => {
                      const daysLeft = batch.expiry_date
                        ? differenceInDays(new Date(batch.expiry_date), new Date())
                        : null
                      return (
                        <div key={batch.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 rounded-xl bg-warning-500/20 flex items-center justify-center shrink-0">
                            <AlertTriangle size={14} className="text-warning-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {batch.inventory?.display_name || 'Unknown Item'}
                            </p>
                            <p className="text-surface-400 text-xs">
                              Batch: {batch.batch_no} · Qty: {batch.quantity}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-xs font-semibold ${daysLeft != null && daysLeft <= 7 ? 'text-danger-400' : 'text-warning-400'}`}>
                              {daysLeft != null ? `${daysLeft}d left` : '—'}
                            </p>
                            <p className="text-surface-500 text-xs">{batch.expiry_date}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}

            </div>{/* end right col */}
          </div>{/* end 2-col grid */}

        </motion.div>
      ) : null}
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, sublabel, iconColor, iconBg
}: {
  icon: React.ElementType
  label: string
  value: string
  sublabel: string
  iconColor: string
  iconBg: string
}) {
  return (
    <div className="glass-card p-4 lg:p-5 space-y-2 lg:space-y-3">
      <div className={`w-9 h-9 lg:w-11 lg:h-11 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon size={18} className={`${iconColor} lg:hidden`} />
        <Icon size={22} className={`${iconColor} hidden lg:block`} />
      </div>
      <div>
        <p className="font-display font-bold text-xl lg:text-2xl text-white leading-tight">{value}</p>
        <p className="text-surface-400 text-xs lg:text-sm mt-0.5">{label}</p>
        <p className="text-surface-500 text-xs mt-0.5 truncate">{sublabel}</p>
      </div>
    </div>
  )
}

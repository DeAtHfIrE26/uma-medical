import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Phone, CreditCard, Hash, FileText,
  Calendar, ChevronRight, AlertCircle, IndianRupee,
  CheckCircle2, Clock, AlertTriangle, Pencil
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { createPaymentOut, updateVendor } from '@/services/bills'
import { TopBar } from '@/components/layout/TopBar'
import { PaymentModeBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { VendorFormModal } from '@/components/vendors/VendorFormModal'
import { useAuthStore } from '@/stores/auth'
import type { Vendor, Bill, PaymentStatus } from '@/types'
import toast from 'react-hot-toast'

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function PaymentStatusDot({ status }: { status: PaymentStatus | string | null | undefined }) {
  if (!status) return null
  if (status === 'PAID') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-success-400">
      <CheckCircle2 size={9} /> PAID
    </span>
  )
  if (status === 'PARTIAL') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning-400">
      <Clock size={9} /> PARTIAL
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-danger-400">
      <AlertCircle size={9} /> UNPAID
    </span>
  )
}

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  const [vendor, setVendor]   = useState<Vendor | null>(null)
  const [bills, setBills]     = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payAmount, setPayAmount]       = useState('')
  const [payNotes, setPayNotes]         = useState('')
  const [paying, setPaying]             = useState(false)
  const [editOpen, setEditOpen]         = useState(false)
  const [savingVendor, setSavingVendor] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('vendors').select('*').eq('id', id).single(),
      supabase
        .from('bills')
        .select('*')
        .eq('vendor_id', id)
        .order('invoice_date', { ascending: false }),
    ]).then(([vRes, bRes]) => {
      if (vRes.data) setVendor(vRes.data as Vendor)
      if (bRes.data) setBills(bRes.data as Bill[])
    }).finally(() => setLoading(false))
  }, [id])

  const handlePaymentOut = async () => {
    if (!vendor || !payAmount || !profile?.id) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }
    setPaying(true)
    try {
      const newBill = await createPaymentOut(vendor.id, amount, profile.id, payNotes || undefined)
      setBills(prev => [newBill, ...prev])
      setPayModalOpen(false)
      setPayAmount('')
      setPayNotes('')
      toast.success(`Payment of ${formatCurrency(amount)} recorded`)
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setPaying(false)
    }
  }

  const handleVendorUpdate = async (values: {
    name: string
    address: string
    gstin: string
    pan: string
    phone: string
    dl_no: string
    bank_name: string
    account_no: string
    ifsc_code: string
  }) => {
    if (!vendor) return
    setSavingVendor(true)
    try {
      const updated = await updateVendor(vendor.id, values)
      setVendor(updated)
      setEditOpen(false)
      toast.success('Vendor updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update vendor')
    } finally {
      setSavingVendor(false)
    }
  }

  if (loading) {
    return <div className="min-h-dvh flex items-center justify-center"><LoadingSpinner size="lg" /></div>
  }

  if (!vendor) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <AlertCircle size={40} className="text-surface-500" />
        <p className="text-surface-400">Vendor not found</p>
        <button onClick={() => navigate('/vendors')} className="btn-primary px-6">Back</button>
      </div>
    )
  }

  // Calculate outstanding balance from purchase bills
  const purchaseBills = bills.filter(b => !b.transaction_type || b.transaction_type === 'PURCHASE')
  const totalAmount   = purchaseBills.reduce((s, b) => s + (b.net_amount || 0), 0)
  const totalPaid     = purchaseBills.reduce((s, b) => s + (b.amount_paid || 0), 0)
  const outstanding   = Math.max(0, totalAmount - totalPaid)
  const unpaidCount   = purchaseBills.filter(b => b.payment_status === 'UNPAID' || b.payment_status === 'PARTIAL').length

  return (
    <div className="min-h-dvh max-w-screen-xl mx-auto">
      <TopBar
        title={vendor.name}
        subtitle={`${bills.length} transactions`}
        showBack
        rightAction={
          <button
            onClick={() => setEditOpen(true)}
            className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400 hover:bg-brand-500/20 transition-colors"
            aria-label="Edit vendor"
          >
            <Pencil size={16} />
          </button>
        }
      />

      <div className="px-4 space-y-4 pb-8">

        {/* ── Vendor Info Card ─────────────────────────────────────────── */}
        <div className="glass-card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600/20 to-cyan-600/10 p-5 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white font-bold text-2xl shrink-0">
              {vendor.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-white text-lg leading-tight">{vendor.name}</h2>
              {vendor.gstin && <p className="text-brand-300 text-xs mt-1 font-mono">GSTIN: {vendor.gstin}</p>}
            </div>
          </div>
          <div className="px-4 pb-2 pt-2 divide-y divide-surface-700/30">
            {vendor.address && (
              <div className="flex items-start gap-3 py-2.5">
                <MapPin size={14} className="text-surface-500 mt-0.5 shrink-0" />
                <p className="text-surface-200 text-sm">{vendor.address}</p>
              </div>
            )}
            {vendor.pan && (
              <div className="flex items-center gap-3 py-2.5">
                <Hash size={14} className="text-surface-500 shrink-0" />
                <div>
                  <p className="text-surface-500 text-xs">PAN</p>
                  <p className="text-white text-sm font-mono">{vendor.pan}</p>
                </div>
              </div>
            )}
            {vendor.phone && (
              <div className="flex items-center gap-3 py-2.5">
                <Phone size={14} className="text-surface-500 shrink-0" />
                <p className="text-surface-200 text-sm">{vendor.phone}</p>
              </div>
            )}
            {vendor.dl_no && (
              <div className="flex items-center gap-3 py-2.5">
                <CreditCard size={14} className="text-surface-500 shrink-0" />
                <div>
                  <p className="text-surface-500 text-xs">Drug License</p>
                  <p className="text-white text-sm font-mono">{vendor.dl_no}</p>
                </div>
              </div>
            )}
            {vendor.bank_name && (
              <div className="flex items-start gap-3 py-2.5">
                <CreditCard size={14} className="text-surface-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-surface-500 text-xs">Bank</p>
                  <p className="text-white text-sm">{vendor.bank_name}</p>
                  {vendor.account_no && <p className="text-surface-400 text-xs font-mono">A/c: {vendor.account_no}</p>}
                  {vendor.ifsc_code && <p className="text-surface-400 text-xs font-mono">IFSC: {vendor.ifsc_code}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Balance Summary ──────────────────────────────────────────── */}
        <div className="glass-card p-4 space-y-3">
          <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider">Account Summary</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Bills',   value: bills.length.toString(),    color: 'text-white' },
              { label: 'Total Billed',  value: formatCurrency(totalAmount), color: 'text-white' },
              { label: 'Outstanding',   value: formatCurrency(outstanding), color: outstanding > 0 ? 'text-danger-400' : 'text-success-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-surface-800/60 rounded-xl px-3 py-2.5 text-center">
                <p className="text-surface-400 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-sm font-bold ${color} leading-tight`}>{value}</p>
              </div>
            ))}
          </div>

          {outstanding > 0 && (
            <div className="flex items-center justify-between p-3 bg-danger-500/8 border border-danger-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-danger-400 shrink-0" />
                <p className="text-danger-300 text-xs">
                  {unpaidCount} unpaid bill{unpaidCount !== 1 ? 's' : ''} · You owe {formatCurrency(outstanding)}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => setPayModalOpen(true)}
            className="btn-primary w-full py-3 text-sm gap-2"
          >
            <IndianRupee size={15} />
            Record Payment to {vendor.name.split(' ')[0]}
          </button>
        </div>

        {/* ── Bills List ───────────────────────────────────────────────── */}
        <div>
          <h3 className="font-display font-semibold text-base text-white mb-3 flex items-center gap-2">
            <FileText size={16} className="text-brand-400" />
            Transactions
          </h3>

          {bills.length === 0 ? (
            <EmptyState icon={FileText} title="No transactions yet" />
          ) : (
            <div className="space-y-2.5">
              {bills.map(bill => (
                <motion.button
                  key={bill.id}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(`/bills/${bill.id}`)}
                  className="glass-card w-full text-left p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    bill.transaction_type === 'PAYMENT_OUT'
                      ? 'bg-danger-500/15'
                      : bill.transaction_type === 'PURCHASE_RETURN'
                      ? 'bg-success-500/15'
                      : 'bg-brand-500/15'
                  }`}>
                    <FileText size={18} className={
                      bill.transaction_type === 'PAYMENT_OUT'    ? 'text-danger-400' :
                      bill.transaction_type === 'PURCHASE_RETURN' ? 'text-success-400' :
                      'text-brand-400'
                    } />
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      {bill.invoice_no && (
                        <p className="text-white text-sm font-semibold">#{bill.invoice_no}</p>
                      )}
                      <span className="text-surface-500 text-xs">
                        {(bill.transaction_type || 'PURCHASE').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={10} className="text-surface-500" />
                      <span className="text-surface-400 text-xs">
                        {bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMM yyyy') : 'No date'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PaymentModeBadge mode={bill.payment_mode} />
                      <PaymentStatusDot status={bill.payment_status} />
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${
                      bill.transaction_type === 'PAYMENT_OUT' ? 'text-danger-400' :
                      bill.transaction_type === 'PURCHASE_RETURN' ? 'text-success-400' :
                      'text-brand-300'
                    }`}>
                      {bill.transaction_type === 'PAYMENT_OUT' ? '- ' :
                       bill.transaction_type === 'PURCHASE_RETURN' ? '+ ' : ''}
                      {formatCurrency(bill.net_amount)}
                    </p>
                    {bill.balance_due != null && bill.balance_due > 0 && (
                      <p className="text-danger-400 text-xs">Due: {formatCurrency(bill.balance_due)}</p>
                    )}
                    <ChevronRight size={14} className="text-surface-600 ml-auto mt-1" />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Payment Bottom Sheet ───────────────────────────────── */}
      {payModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setPayModalOpen(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="w-full max-w-lg bg-surface-800 rounded-t-3xl p-6 space-y-4 border-t border-surface-700/50 z-[80]"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 bg-surface-600 rounded-full mx-auto" />
            <h3 className="font-display font-bold text-white text-lg">
              Pay {vendor.name.split(' ')[0]}
            </h3>

            {outstanding > 0 && (
              <div className="flex items-center justify-between bg-danger-500/10 border border-danger-500/20 rounded-xl px-4 py-3">
                <span className="text-surface-300 text-sm">Outstanding Balance</span>
                <span className="text-danger-400 font-bold">{formatCurrency(outstanding)}</span>
              </div>
            )}

            <div>
              <label className="text-surface-300 text-sm font-medium block mb-2">Amount (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="Enter amount"
                className="input-base text-xl font-semibold py-4"
                autoFocus
              />
            </div>

            {outstanding > 0 && (
              <div className="flex gap-2 flex-wrap">
                {[outstanding, Math.floor(outstanding / 2)]
                  .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
                  .map(v => (
                    <button
                      key={v}
                      onClick={() => setPayAmount(String(v))}
                      className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 rounded-xl text-xs font-medium text-white transition-colors"
                    >
                      ₹{v.toLocaleString('en-IN')}
                    </button>
                  ))
                }
              </div>
            )}

            <div>
              <label className="text-surface-300 text-sm font-medium block mb-2">Notes (optional)</label>
              <input
                type="text"
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder="e.g. Paid via NEFT"
                className="input-base"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setPayModalOpen(false); setPayAmount(''); setPayNotes('') }}
                className="btn-secondary flex-1 py-3.5"
              >
                Cancel
              </button>
              <button
                onClick={handlePaymentOut}
                disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
                className="btn-primary flex-1 py-3.5 disabled:opacity-50"
              >
                {paying ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      <VendorFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleVendorUpdate}
        initialVendor={vendor}
        loading={savingVendor}
        title="Edit Vendor"
      />
    </div>
  )
}

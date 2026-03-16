import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Phone, CreditCard, Hash, FileText,
  Calendar, ChevronRight, AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/layout/TopBar'
import { PaymentModeBadge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Vendor, Bill } from '@/types'

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('vendors').select('*').eq('id', id).single(),
      supabase.from('bills').select('*').eq('vendor_id', id).order('invoice_date', { ascending: false }),
    ]).then(([vRes, bRes]) => {
      if (vRes.data) setVendor(vRes.data as Vendor)
      if (bRes.data) setBills(bRes.data as Bill[])
    }).finally(() => setLoading(false))
  }, [id])

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

  const totalAmount = bills.reduce((s, b) => s + (b.net_amount || 0), 0)

  return (
    <div className="min-h-dvh">
      <TopBar title={vendor.name} subtitle={`${bills.length} bills`} showBack />

      <div className="px-4 space-y-4 pb-6">
        {/* Vendor Info Card */}
        <div className="glass-card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600/20 to-cyan-600/10 p-5 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white font-bold text-2xl">
              {vendor.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-white text-lg leading-tight">{vendor.name}</h2>
              {vendor.gstin && <p className="text-brand-300 text-xs mt-1 font-mono">GSTIN: {vendor.gstin}</p>}
            </div>
          </div>
          <div className="px-4 pb-2 pt-2 space-y-0">
            {vendor.address && (
              <div className="flex items-start gap-3 py-2.5 border-b border-surface-700/30">
                <MapPin size={14} className="text-surface-500 mt-0.5 shrink-0" />
                <p className="text-surface-200 text-sm">{vendor.address}</p>
              </div>
            )}
            {vendor.pan && (
              <div className="flex items-center gap-3 py-2.5 border-b border-surface-700/30">
                <Hash size={14} className="text-surface-500 shrink-0" />
                <div>
                  <p className="text-surface-500 text-xs">PAN</p>
                  <p className="text-white text-sm font-mono">{vendor.pan}</p>
                </div>
              </div>
            )}
            {vendor.phone && (
              <div className="flex items-center gap-3 py-2.5 border-b border-surface-700/30">
                <Phone size={14} className="text-surface-500 shrink-0" />
                <p className="text-surface-200 text-sm">{vendor.phone}</p>
              </div>
            )}
            {vendor.dl_no && (
              <div className="flex items-center gap-3 py-2.5 border-b border-surface-700/30">
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

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4 text-center">
            <p className="font-display font-bold text-2xl text-white">{bills.length}</p>
            <p className="text-surface-400 text-xs mt-1">Total Bills</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="font-display font-bold text-xl text-success-400">
              {formatCurrency(totalAmount)}
            </p>
            <p className="text-surface-400 text-xs mt-1">Total Value</p>
          </div>
        </div>

        {/* Bills List */}
        <div>
          <h3 className="font-display font-semibold text-base text-white mb-3">Bills from {vendor.name}</h3>
          {bills.length === 0 ? (
            <EmptyState icon={FileText} title="No bills yet" />
          ) : (
            <div className="space-y-2.5">
              {bills.map(bill => (
                <motion.button
                  key={bill.id}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(`/bills/${bill.id}`)}
                  className="glass-card w-full text-left p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {bill.invoice_no && (
                      <p className="text-white text-sm font-medium">#{bill.invoice_no}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar size={11} className="text-surface-500" />
                      <span className="text-surface-400 text-xs">
                        {bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMM yyyy') : 'No date'}
                      </span>
                    </div>
                    <PaymentModeBadge mode={bill.payment_mode} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-brand-300 font-bold text-sm">{formatCurrency(bill.net_amount)}</p>
                    <ChevronRight size={14} className="text-surface-600 ml-auto mt-1" />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

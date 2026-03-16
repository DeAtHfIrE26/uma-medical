import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Building2, Calendar, Hash, CreditCard, User, MapPin,
  Package, Trash2, ExternalLink, Download, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, FileText
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { getBillById, deleteBill } from '@/services/bills'
import { TopBar } from '@/components/layout/TopBar'
import { PaymentModeBadge } from '@/components/ui/Badge'
import { ConfirmModal } from '@/components/ui/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { Bill } from '@/types'

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function InfoRow({ label, value, icon: Icon }: {
  label: string
  value: string | null | undefined
  icon?: React.ElementType
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-surface-700/30 last:border-0">
      {Icon && <Icon size={15} className="text-surface-500 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-surface-400 text-xs mb-0.5">{label}</p>
        <p className="text-white text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  )
}

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isFresh = location.state?.freshlyScanned

  const [bill, setBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [itemsExpanded, setItemsExpanded] = useState(true)

  useEffect(() => {
    if (!id) return
    getBillById(id)
      .then(setBill)
      .catch(() => toast.error('Failed to load bill'))
      .finally(() => setLoading(false))
  }, [id])

  const handleDelete = async () => {
    if (!bill) return
    setDeleting(true)
    try {
      await deleteBill(bill.id)
      toast.success('Bill deleted')
      navigate('/bills', { replace: true })
    } catch {
      toast.error('Failed to delete bill')
    } finally {
      setDeleting(false)
      setDeleteModalOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6">
        <AlertCircle size={40} className="text-surface-500" />
        <p className="text-surface-400">Bill not found</p>
        <button onClick={() => navigate('/bills')} className="btn-primary px-6">Go to Bills</button>
      </div>
    )
  }

  const vendor = bill.vendor as { name: string; address?: string; gstin?: string; pan?: string; phone?: string; dl_no?: string } | undefined
  const items = bill.items || []

  return (
    <div className="min-h-dvh">
      <TopBar
        title="Bill Details"
        showBack
        rightAction={
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="w-9 h-9 rounded-xl bg-danger-500/10 flex items-center justify-center text-danger-400 hover:bg-danger-500/20 transition-colors"
          >
            <Trash2 size={17} />
          </button>
        }
      />

      {isFresh && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-4 p-3 rounded-2xl bg-success-500/10 border border-success-500/20 flex items-center gap-2"
        >
          <CheckCircle2 size={16} className="text-success-400" />
          <p className="text-success-400 text-sm font-medium">Bill successfully scanned & saved!</p>
        </motion.div>
      )}

      <div className="px-4 pb-6 space-y-4">
        {/* Vendor Card */}
        {vendor && (
          <div className="glass-card overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600/20 to-cyan-600/10 px-4 py-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                {vendor.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display font-bold text-white text-base leading-tight">{vendor.name}</h2>
                {vendor.gstin && <p className="text-brand-300 text-xs mt-0.5 font-mono">GSTIN: {vendor.gstin}</p>}
              </div>
            </div>
            <div className="px-4 pb-2 pt-1">
              <InfoRow label="Address" value={vendor.address} icon={MapPin} />
              <InfoRow label="PAN" value={vendor.pan} />
              <InfoRow label="Phone" value={vendor.phone} />
              <InfoRow label="Drug License" value={vendor.dl_no} />
            </div>
          </div>
        )}

        {/* Invoice Meta */}
        <div className="glass-card px-4 py-2">
          <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider py-2">Invoice Details</p>
          <InfoRow label="Invoice Number" value={bill.invoice_no} icon={Hash} />
          <InfoRow
            label="Invoice Date"
            value={bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMMM yyyy') : null}
            icon={Calendar}
          />
          <InfoRow
            label="Due Date"
            value={bill.due_date ? format(new Date(bill.due_date), 'dd MMMM yyyy') : null}
            icon={Calendar}
          />
          <div className="flex items-start gap-3 py-2.5 border-b border-surface-700/30">
            <CreditCard size={15} className="text-surface-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-surface-400 text-xs mb-0.5">Payment Mode</p>
              <PaymentModeBadge mode={bill.payment_mode} />
            </div>
          </div>
          <InfoRow label="Customer" value={bill.customer_name} icon={User} />
          <InfoRow label="Customer Address" value={bill.customer_address} icon={MapPin} />
          <InfoRow label="Customer DL" value={bill.customer_dl} />
          <InfoRow label="Customer PAN" value={bill.customer_pan} />
        </div>

        {/* Bill Image */}
        {bill.image_url && (
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700/30 flex items-center justify-between">
              <p className="text-surface-300 text-sm font-medium flex items-center gap-2">
                <FileText size={15} className="text-surface-500" /> Original Bill
              </p>
              <a
                href={bill.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 text-xs flex items-center gap-1"
              >
                View <ExternalLink size={12} />
              </a>
            </div>
            <img src={bill.image_url} alt="Bill" className="w-full object-contain max-h-64" />
          </div>
        )}

        {/* Line Items */}
        <div className="glass-card overflow-hidden">
          <button
            onClick={() => setItemsExpanded(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between border-b border-surface-700/30"
          >
            <p className="text-white font-semibold flex items-center gap-2">
              <Package size={16} className="text-brand-400" />
              Items ({items.length})
            </p>
            {itemsExpanded ? <ChevronUp size={18} className="text-surface-400" /> : <ChevronDown size={18} className="text-surface-400" />}
          </button>

          {itemsExpanded && (
            <div className="overflow-x-auto">
              {items.length === 0 ? (
                <p className="text-surface-400 text-sm text-center py-8">No items recorded</p>
              ) : (
                <table className="data-table min-w-max w-full">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>HSN</th>
                      <th>Batch</th>
                      <th>Exp</th>
                      <th>MRP</th>
                      <th>Qty</th>
                      <th>Free</th>
                      <th>Rate</th>
                      <th>Disc%</th>
                      <th>GST%</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="text-surface-400 text-xs">{item.sr_no ?? '—'}</td>
                        <td className="font-medium min-w-[160px]">
                          <div>{item.description}</div>
                          {item.manufacturer && <div className="text-xs text-surface-500">{item.manufacturer}</div>}
                          {item.pack && <div className="text-xs text-brand-400">{item.pack}</div>}
                        </td>
                        <td className="text-xs text-surface-400 font-mono">{item.hsn_code ?? '—'}</td>
                        <td className="text-xs font-mono">{item.batch_no ?? '—'}</td>
                        <td className="text-xs">{item.expiry_date ?? '—'}</td>
                        <td className="text-right">{formatCurrency(item.mrp)}</td>
                        <td className="text-center font-semibold">{item.quantity ?? '—'}</td>
                        <td className="text-center text-success-400">{item.free_quantity ?? '—'}</td>
                        <td className="text-right">{formatCurrency(item.rate)}</td>
                        <td className="text-center text-warning-400">{item.discount_pct != null ? `${item.discount_pct}%` : '—'}</td>
                        <td className="text-center">{item.gst_pct != null ? `${item.gst_pct}%` : '—'}</td>
                        <td className="text-right font-bold text-brand-300">{formatCurrency(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="glass-card px-4 py-2">
          <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider py-2">Summary</p>
          {bill.total_taxable != null && (
            <div className="flex justify-between py-2.5 border-b border-surface-700/30">
              <span className="text-surface-300 text-sm">Taxable Amount</span>
              <span className="text-white text-sm font-medium">{formatCurrency(bill.total_taxable)}</span>
            </div>
          )}
          {bill.total_gst != null && (
            <div className="flex justify-between py-2.5 border-b border-surface-700/30">
              <span className="text-surface-300 text-sm">Total GST</span>
              <span className="text-white text-sm font-medium">{formatCurrency(bill.total_gst)}</span>
            </div>
          )}
          {bill.round_off != null && bill.round_off !== 0 && (
            <div className="flex justify-between py-2.5 border-b border-surface-700/30">
              <span className="text-surface-300 text-sm">Round Off</span>
              <span className="text-white text-sm font-medium">{formatCurrency(bill.round_off)}</span>
            </div>
          )}
          <div className="flex justify-between py-3">
            <span className="font-display font-bold text-white text-base">Net Amount</span>
            <span className="font-display font-bold text-brand-400 text-xl">{formatCurrency(bill.net_amount)}</span>
          </div>
        </div>

        {/* Download placeholder */}
        <button className="btn-secondary w-full py-3 gap-2">
          <Download size={17} />
          Export Bill (Coming Soon)
        </button>
      </div>

      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Bill"
        message="Are you sure you want to permanently delete this bill? This action cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  )
}

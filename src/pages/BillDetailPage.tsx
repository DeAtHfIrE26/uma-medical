import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Hash, CreditCard, User, MapPin,
  Package, Trash2, ExternalLink, Download, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, FileText,
  IndianRupee, AlertTriangle, Share2, Clock, Pencil
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { getBillById, deleteBill, getBillImageUrl, getVendors, recordPayment, updateBill, updateExistingBillItems } from '@/services/bills'
import { TopBar } from '@/components/layout/TopBar'
import { PaymentModeBadge } from '@/components/ui/Badge'
import { ConfirmModal, Modal } from '@/components/ui/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { Bill, BillItem, PaymentStatus, Vendor } from '@/types'

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n)
}

function formatNum(n: number | null | undefined) {
  if (n == null) return '—'
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function PaymentStatusBadge({ status }: { status: PaymentStatus | string | null | undefined }) {
  if (!status) return null
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    PAID:    { color: 'bg-success-500/15 text-success-400 border-success-500/30', icon: <CheckCircle2 size={10} /> },
    PARTIAL: { color: 'bg-warning-500/15 text-warning-400 border-warning-500/30', icon: <Clock size={10} /> },
    UNPAID:  { color: 'bg-danger-500/15 text-danger-400 border-danger-500/30',   icon: <AlertCircle size={10} /> },
  }
  const { color, icon } = cfg[status] ?? cfg.UNPAID
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {icon} {status}
    </span>
  )
}

function InfoRow({
  label, value, icon: Icon,
}: { label: string; value: string | null | undefined; icon?: React.ElementType }) {
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

// ─── Item Card — shown on mobile as cards instead of table rows ───────────────
function ItemCard({ item, index }: { item: BillItem; index: number }) {
  const [open, setOpen] = useState(false)

  const isNearExpiry = item.expiry_date
    ? new Date(item.expiry_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : false

  return (
    <div className={`rounded-xl border transition-colors ${
      isNearExpiry
        ? 'border-warning-500/30 bg-warning-500/5'
        : 'border-surface-700/40 bg-surface-800/40'
    }`}>
      {/* Always-visible header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-3 py-3 flex items-start gap-3 text-left"
      >
        {/* Sr no */}
        <span className="text-surface-500 text-xs font-mono mt-0.5 w-5 shrink-0">
          {item.sr_no ?? index + 1}
        </span>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-snug">{item.description}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {item.manufacturer && (
              <span className="text-surface-500 text-xs">{item.manufacturer}</span>
            )}
            {item.pack && (
              <span className="text-brand-400 text-xs font-medium">{item.pack}</span>
            )}
            {item.batch_no && (
              <span className="text-surface-400 text-xs font-mono">B:{item.batch_no}</span>
            )}
            {item.expiry_date && (
              <span className={`text-xs font-medium ${isNearExpiry ? 'text-warning-400' : 'text-surface-400'}`}>
                Exp:{item.expiry_date}
              </span>
            )}
          </div>
        </div>

        {/* Amount + expand */}
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <span className="text-brand-300 text-sm font-bold">{formatCurrency(item.total_amount)}</span>
          <span className="text-surface-500 text-xs">
            {item.quantity != null ? `Qty: ${item.quantity}` : ''}
          </span>
          {open
            ? <ChevronUp size={13} className="text-surface-500" />
            : <ChevronDown size={13} className="text-surface-500" />
          }
        </div>
      </button>

      {/* Expanded detail grid */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-surface-700/30"
          >
            <div className="grid grid-cols-3 gap-px bg-surface-700/20 text-xs">
              {[
                { label: 'MRP',     value: formatCurrency(item.mrp) },
                { label: 'Rate',    value: formatCurrency(item.rate) },
                { label: 'Qty',     value: formatNum(item.quantity) },
                { label: 'Free',    value: item.free_quantity != null ? String(item.free_quantity) : '—' },
                { label: 'Disc%',   value: item.discount_pct != null ? `${item.discount_pct}%` : '—' },
                { label: 'GST%',    value: item.gst_pct != null ? `${item.gst_pct}%` : '—' },
                { label: 'Taxable', value: formatCurrency(item.taxable_amount) },
                { label: 'GST Amt', value: formatCurrency(item.gst_value) },
                { label: 'HSN',     value: item.hsn_code ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-800/60 px-3 py-2">
                  <p className="text-surface-500 text-[10px] uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-white font-medium truncate">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isFresh = location.state?.freshlyScanned

  const [bill, setBill]             = useState<Bill | null>(null)
  const [billImageUrl, setBillImageUrl] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [itemsExpanded, setItemsExpanded] = useState(true)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [savingEdits, setSavingEdits] = useState(false)
  const [itemEditModalOpen, setItemEditModalOpen] = useState(false)
  const [savingItems, setSavingItems] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [editValues, setEditValues] = useState({
    vendor_id: '',
    invoice_no: '',
    invoice_date: '',
    due_date: '',
    payment_mode: '',
    customer_name: '',
    customer_address: '',
    customer_dl: '',
    customer_pan: '',
    notes: '',
  })
  const [itemDrafts, setItemDrafts] = useState<Array<{
    id: string
    sr_no: string
    description: string
    manufacturer: string
    pack: string
    batch_no: string
    expiry_date: string
    hsn_code: string
    quantity: string
    free_quantity: string
    mrp: string
    rate: string
    discount_pct: string
    taxable_amount: string
    gst_pct: string
    gst_value: string
    total_amount: string
  }>>([])

  useEffect(() => {
    if (!id) return
    getBillById(id)
      .then(setBill)
      .catch(() => toast.error('Failed to load bill'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!bill?.image_url) { setBillImageUrl(null); return }
    getBillImageUrl(bill.image_url).then(setBillImageUrl).catch(() => setBillImageUrl(null))
  }, [bill?.image_url])

  useEffect(() => {
    getVendors().then(setVendors).catch(() => {})
  }, [])

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

  const handleRecordPayment = async () => {
    if (!bill || !paymentAmount) return
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }
    const maxAllowed = bill.balance_due ?? ((bill.net_amount ?? 0) - (bill.amount_paid ?? 0))
    if (amount > maxAllowed + 0.01) { toast.error('Amount exceeds balance due'); return }
    setRecordingPayment(true)
    try {
      const updated = await recordPayment(bill.id, amount)
      setBill(updated)
      setPaymentModalOpen(false)
      setPaymentAmount('')
      toast.success(`₹${amount.toLocaleString('en-IN')} payment recorded`)
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setRecordingPayment(false)
    }
  }

  const openEditModal = () => {
    if (!bill) return
    setEditValues({
      vendor_id: bill.vendor_id || '',
      invoice_no: bill.invoice_no || '',
      invoice_date: bill.invoice_date || '',
      due_date: bill.due_date || '',
      payment_mode: bill.payment_mode || '',
      customer_name: bill.customer_name || '',
      customer_address: bill.customer_address || '',
      customer_dl: bill.customer_dl || '',
      customer_pan: bill.customer_pan || '',
      notes: bill.notes || '',
    })
    setEditModalOpen(true)
  }

  const handleSaveEdits = async () => {
    if (!bill) return
    setSavingEdits(true)
    try {
      await updateBill(bill.id, {
        vendor_id: editValues.vendor_id || null,
        invoice_no: editValues.invoice_no || null,
        invoice_date: editValues.invoice_date || null,
        due_date: editValues.due_date || null,
        payment_mode: editValues.payment_mode || null,
        customer_name: editValues.customer_name || null,
        customer_address: editValues.customer_address || null,
        customer_dl: editValues.customer_dl || null,
        customer_pan: editValues.customer_pan || null,
        notes: editValues.notes || null,
      })
      const refreshed = await getBillById(bill.id)
      setBill(refreshed)
      setEditModalOpen(false)
      toast.success('Bill updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update bill')
    } finally {
      setSavingEdits(false)
    }
  }

  const openItemEditModal = () => {
    setItemDrafts(((bill?.items || []) as BillItem[]).map((item, index) => ({
      id: item.id,
      sr_no: String(item.sr_no ?? index + 1),
      description: item.description || '',
      manufacturer: item.manufacturer || '',
      pack: item.pack || '',
      batch_no: item.batch_no || '',
      expiry_date: item.expiry_date || '',
      hsn_code: item.hsn_code || '',
      quantity: item.quantity != null ? String(item.quantity) : '',
      free_quantity: item.free_quantity != null ? String(item.free_quantity) : '',
      mrp: item.mrp != null ? String(item.mrp) : '',
      rate: item.rate != null ? String(item.rate) : '',
      discount_pct: item.discount_pct != null ? String(item.discount_pct) : '',
      taxable_amount: item.taxable_amount != null ? String(item.taxable_amount) : '',
      gst_pct: item.gst_pct != null ? String(item.gst_pct) : '',
      gst_value: item.gst_value != null ? String(item.gst_value) : '',
      total_amount: item.total_amount != null ? String(item.total_amount) : '',
    })))
    setItemEditModalOpen(true)
  }

  const updateItemDraft = (id: string, key: string, value: string) => {
    setItemDrafts((prev) => prev.map((item) => item.id === id ? { ...item, [key]: value } : item))
  }

  const handleSaveItems = async () => {
    if (!bill) return

    const payload = itemDrafts.map((item, index) => ({
      id: item.id,
      sr_no: toNumberOrNull(item.sr_no) ?? index + 1,
      description: item.description.trim() || 'Unknown Item',
      manufacturer: item.manufacturer.trim() || null,
      pack: item.pack.trim() || null,
      batch_no: item.batch_no.trim() || null,
      expiry_date: item.expiry_date || null,
      hsn_code: item.hsn_code.trim() || null,
      quantity: toNumberOrNull(item.quantity),
      free_quantity: toNumberOrNull(item.free_quantity),
      mrp: toNumberOrNull(item.mrp),
      rate: toNumberOrNull(item.rate),
      discount_pct: toNumberOrNull(item.discount_pct),
      taxable_amount: toNumberOrNull(item.taxable_amount),
      gst_pct: toNumberOrNull(item.gst_pct),
      gst_value: toNumberOrNull(item.gst_value),
      total_amount: toNumberOrNull(item.total_amount),
    }))

    const totalTaxable = payload.reduce((sum, item) => sum + (item.taxable_amount ?? 0), 0)
    const totalGst = payload.reduce((sum, item) => sum + (item.gst_value ?? 0), 0)
    const itemsTotal = payload.reduce((sum, item) => sum + (item.total_amount ?? 0), 0)
    const netAmount = itemsTotal + (bill.round_off ?? 0)

    setSavingItems(true)
    try {
      await updateExistingBillItems(payload)
      await updateBill(bill.id, {
        total_taxable: totalTaxable,
        total_gst: totalGst,
        net_amount: netAmount,
      })
      const refreshed = await getBillById(bill.id)
      setBill(refreshed)
      setItemEditModalOpen(false)
      toast.success('Bill items updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update bill items')
    } finally {
      setSavingItems(false)
    }
  }

  const handleWhatsAppShare = () => {
    if (!bill) return
    const vendor = bill.vendor as { name: string } | undefined
    const lines = [
      `📋 *Purchase Bill — Uma Medical*`,
      `Vendor: ${vendor?.name || 'N/A'}`,
      `Invoice: #${bill.invoice_no || 'N/A'}`,
      `Date: ${bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMM yyyy') : 'N/A'}`,
      `Amount: ₹${bill.net_amount?.toLocaleString('en-IN') ?? '—'}`,
      `Status: ${bill.payment_status || 'UNPAID'}`,
    ]
    if (billImageUrl) lines.push(`\n${billImageUrl}`)
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer')
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
  const items = (bill.items || []) as BillItem[]
  const balanceDue = bill.balance_due ?? Math.max(0, (bill.net_amount ?? 0) - (bill.amount_paid ?? 0))
  const isPurchase = !bill.transaction_type || bill.transaction_type === 'PURCHASE'

  return (
    <div className="min-h-dvh max-w-screen-xl mx-auto">
      <TopBar
        title="Bill Details"
        showBack
        rightAction={
          <div className="flex items-center gap-2">
            <button
              onClick={openEditModal}
              className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center
                         text-brand-400 hover:bg-brand-500/20 active:scale-95 transition-all"
              aria-label="Edit bill"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="w-9 h-9 rounded-xl bg-danger-500/10 flex items-center justify-center
                         text-danger-400 hover:bg-danger-500/20 active:scale-95 transition-all"
              aria-label="Delete bill"
            >
              <Trash2 size={17} />
            </button>
          </div>
        }
      />

      {/* Freshly scanned banner */}
      {isFresh && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-3 p-3 rounded-2xl bg-success-500/10 border border-success-500/20 flex items-center gap-2"
        >
          <CheckCircle2 size={16} className="text-success-400 shrink-0" />
          <p className="text-success-400 text-sm font-medium">Bill successfully scanned & saved!</p>
        </motion.div>
      )}

      {/* Low confidence warning */}
      {bill.needs_review && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-3 p-3 rounded-2xl bg-warning-500/10 border border-warning-500/20 flex items-start gap-2"
        >
          <AlertTriangle size={16} className="text-warning-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-warning-400 text-sm font-medium">
              AI confidence: {bill.ai_confidence}% — Please verify
            </p>
            <p className="text-warning-300 text-xs mt-0.5">Some fields may need manual correction.</p>
          </div>
        </motion.div>
      )}

      <div className="px-4 pb-8 space-y-4">

        {/* ── Vendor Card ─────────────────────────────────────────────────── */}
        {vendor && (
          <div className="glass-card overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600/20 to-cyan-600/10 px-4 py-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
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

        {/* ── Invoice Meta ─────────────────────────────────────────────────── */}
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
            <div className="flex-1">
              <p className="text-surface-400 text-xs mb-0.5">Payment Mode</p>
              <PaymentModeBadge mode={bill.payment_mode} />
            </div>
          </div>
          {bill.transaction_type && bill.transaction_type !== 'PURCHASE' && (
            <div className="flex items-start gap-3 py-2.5 border-b border-surface-700/30">
              <FileText size={15} className="text-surface-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-surface-400 text-xs mb-0.5">Transaction Type</p>
                <span className="text-xs font-semibold text-cyan-400">
                  {bill.transaction_type.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}
          <InfoRow label="Customer" value={bill.customer_name} icon={User} />
          <InfoRow label="Customer Address" value={bill.customer_address} icon={MapPin} />
          <InfoRow label="Customer DL" value={bill.customer_dl} />
          <InfoRow label="Customer PAN" value={bill.customer_pan} />
          <InfoRow label="Notes" value={bill.notes} />
        </div>

        {/* ── Payment Status Card ──────────────────────────────────────────── */}
        {isPurchase && (
          <div className="glass-card px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider">Payment Status</p>
              <PaymentStatusBadge status={bill.payment_status} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Invoice Total', value: formatCurrency(bill.net_amount), color: 'text-white' },
                { label: 'Amount Paid',   value: formatCurrency(bill.amount_paid ?? 0), color: 'text-success-400' },
                { label: 'Balance Due',   value: formatCurrency(balanceDue), color: balanceDue > 0 ? 'text-danger-400' : 'text-success-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-surface-800/60 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-surface-400 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                  <p className={`text-sm font-bold ${color} leading-tight`}>{value}</p>
                </div>
              ))}
            </div>

            {bill.payment_status !== 'PAID' && (
              <button
                onClick={() => setPaymentModalOpen(true)}
                className="btn-primary w-full py-3 text-sm"
              >
                <IndianRupee size={15} />
                Record Payment
              </button>
            )}
          </div>
        )}

        {/* ── Bill Image ───────────────────────────────────────────────────── */}
        {billImageUrl && (
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700/30 flex items-center justify-between">
              <p className="text-surface-300 text-sm font-medium flex items-center gap-2">
                <FileText size={15} className="text-surface-500" /> Original Bill
              </p>
              <a
                href={billImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 text-xs flex items-center gap-1 hover:text-brand-300"
              >
                Full size <ExternalLink size={11} />
              </a>
            </div>
            <img
              src={billImageUrl}
              alt="Original bill"
              className="w-full object-contain max-h-72"
              loading="lazy"
            />
          </div>
        )}

        {/* ── Line Items ───────────────────────────────────────────────────── */}
        <div className="glass-card overflow-hidden">
          <button
            onClick={() => setItemsExpanded(v => !v)}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-surface-700/30"
          >
            <p className="text-white font-semibold flex items-center gap-2">
              <Package size={16} className="text-brand-400" />
              Items
              <span className="text-surface-500 font-normal text-sm">({items.length})</span>
            </p>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <span className="text-surface-500 text-xs hidden sm:block">
                  Tap each item to expand details
                </span>
              )}
              {itemsExpanded
                ? <ChevronUp size={18} className="text-surface-400" />
                : <ChevronDown size={18} className="text-surface-400" />
              }
            </div>
          </button>

          {items.length > 0 && (
            <div className="px-3 pt-3">
              <button onClick={openItemEditModal} className="btn-secondary w-full py-2.5 text-sm">
                <Pencil size={15} />
                Edit Items
              </button>
            </div>
          )}

          {itemsExpanded && (
            <div className="p-3 space-y-2">
              {items.length === 0 ? (
                <div className="py-10 text-center">
                  <Package size={32} className="text-surface-700 mx-auto mb-2" />
                  <p className="text-surface-400 text-sm">No items recorded</p>
                </div>
              ) : (
                <>
                  {/* Column legend — always visible */}
                  <div className="flex items-center gap-3 px-3 py-1.5">
                    <span className="w-5 shrink-0" />
                    <span className="flex-1 text-surface-500 text-[10px] uppercase tracking-wide">
                      Medicine · Batch · Expiry
                    </span>
                    <span className="text-surface-500 text-[10px] uppercase tracking-wide shrink-0">
                      Qty / Amount
                    </span>
                  </div>

                  {/* Item cards — expandable */}
                  {items.map((item, i) => (
                    <ItemCard key={item.id} item={item} index={i} />
                  ))}

                  {/* Items total footer */}
                  <div className="flex items-center justify-between px-3 py-2.5 mt-1 border-t border-surface-700/30">
                    <span className="text-surface-400 text-xs">
                      {items.length} items ·&nbsp;
                      Total qty: {items.reduce((s, it) => s + (it.quantity ?? 0), 0)}
                    </span>
                    <span className="text-brand-300 text-sm font-bold">
                      {formatCurrency(items.reduce((s, it) => s + (it.total_amount ?? 0), 0))}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Summary Totals ───────────────────────────────────────────────── */}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-2">
            <p className="text-surface-400 text-xs font-semibold uppercase tracking-wider py-2">Bill Summary</p>
          </div>
          <div className="divide-y divide-surface-700/30">
            {bill.total_taxable != null && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-surface-300 text-sm">Taxable Amount</span>
                <span className="text-white text-sm font-medium">{formatCurrency(bill.total_taxable)}</span>
              </div>
            )}
            {bill.total_gst != null && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-surface-300 text-sm">Total GST</span>
                <span className="text-white text-sm font-medium">{formatCurrency(bill.total_gst)}</span>
              </div>
            )}
            {bill.round_off != null && bill.round_off !== 0 && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-surface-300 text-sm">Round Off</span>
                <span className="text-white text-sm font-medium">{formatCurrency(bill.round_off)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-4 bg-surface-800/40">
              <span className="font-display font-bold text-white text-base">Net Amount</span>
              <span className="font-display font-bold text-brand-400 text-xl">{formatCurrency(bill.net_amount)}</span>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleWhatsAppShare} className="btn-secondary py-3 gap-2 text-sm">
            <Share2 size={16} />
            WhatsApp
          </button>
          <a
            href={`/api/export-bill?id=${bill.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary py-3 gap-2 text-sm"
          >
            <Download size={16} />
            Export PDF
          </a>
        </div>
      </div>

      {/* ── Record Payment Bottom Sheet ──────────────────────────────────── */}
      <AnimatePresence>
        {paymentModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setPaymentModalOpen(false)}
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
              {/* Drag handle */}
              <div className="w-10 h-1 bg-surface-600 rounded-full mx-auto" />

              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-white text-lg">Record Payment</h3>
                <PaymentStatusBadge status={bill.payment_status} />
              </div>

              {/* Balance due pill */}
              <div className="flex items-center justify-between bg-danger-500/10 border border-danger-500/20 rounded-xl px-4 py-3">
                <span className="text-surface-300 text-sm">Balance Due</span>
                <span className="text-danger-400 font-bold text-lg">{formatCurrency(balanceDue)}</span>
              </div>

              <div>
                <label className="text-surface-300 text-sm font-medium block mb-2">
                  Amount Paying Now (₹)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder={`Up to ${balanceDue.toFixed(2)}`}
                  className="input-base text-xl font-semibold py-4"
                  autoFocus
                />
              </div>

              {/* Quick amount chips */}
              <div className="flex gap-2 flex-wrap">
                {[balanceDue, Math.floor(balanceDue / 2), 5000, 10000]
                  .filter((v, i, a) => v > 0 && v <= balanceDue && a.indexOf(v) === i)
                  .slice(0, 4)
                  .map(v => (
                    <button
                      key={v}
                      onClick={() => setPaymentAmount(String(v))}
                      className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 rounded-xl text-xs font-medium text-white transition-colors"
                    >
                      ₹{v.toLocaleString('en-IN')}
                    </button>
                  ))
                }
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setPaymentModalOpen(false); setPaymentAmount('') }}
                  className="btn-secondary flex-1 py-3.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={recordingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0}
                  className="btn-primary flex-1 py-3.5 disabled:opacity-50"
                >
                  {recordingPayment ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Bill"
        message="Are you sure you want to permanently delete this bill and all its items? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Bill" size="lg">
        <div className="p-5 space-y-4">
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Vendor</label>
            <select
              value={editValues.vendor_id}
              onChange={(e) => setEditValues((prev) => ({ ...prev, vendor_id: e.target.value }))}
              className="input-base"
            >
              <option value="">No vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Invoice Number</label>
              <input
                value={editValues.invoice_no}
                onChange={(e) => setEditValues((prev) => ({ ...prev, invoice_no: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Payment Mode</label>
              <select
                value={editValues.payment_mode}
                onChange={(e) => setEditValues((prev) => ({ ...prev, payment_mode: e.target.value }))}
                className="input-base"
              >
                <option value="">Not set</option>
                <option value="CASH">Cash</option>
                <option value="CREDIT">Credit</option>
                <option value="CHEQUE">Cheque</option>
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT</option>
              </select>
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Invoice Date</label>
              <input
                type="date"
                value={editValues.invoice_date}
                onChange={(e) => setEditValues((prev) => ({ ...prev, invoice_date: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Due Date</label>
              <input
                type="date"
                value={editValues.due_date}
                onChange={(e) => setEditValues((prev) => ({ ...prev, due_date: e.target.value }))}
                className="input-base"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Customer Name</label>
              <input
                value={editValues.customer_name}
                onChange={(e) => setEditValues((prev) => ({ ...prev, customer_name: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Customer DL</label>
              <input
                value={editValues.customer_dl}
                onChange={(e) => setEditValues((prev) => ({ ...prev, customer_dl: e.target.value }))}
                className="input-base"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Customer Address</label>
              <textarea
                value={editValues.customer_address}
                onChange={(e) => setEditValues((prev) => ({ ...prev, customer_address: e.target.value }))}
                className="input-base min-h-20 resize-none"
              />
            </div>
            <div>
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Customer PAN</label>
              <input
                value={editValues.customer_pan}
                onChange={(e) => setEditValues((prev) => ({ ...prev, customer_pan: e.target.value }))}
                className="input-base"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-surface-300 text-sm font-medium block mb-1.5">Notes</label>
              <textarea
                value={editValues.notes}
                onChange={(e) => setEditValues((prev) => ({ ...prev, notes: e.target.value }))}
                className="input-base min-h-20 resize-none"
                placeholder="Optional notes or corrections"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditModalOpen(false)} className="btn-secondary flex-1 py-3">
              Cancel
            </button>
            <button
              onClick={handleSaveEdits}
              disabled={savingEdits}
              className="btn-primary flex-1 py-3 disabled:opacity-50"
            >
              {savingEdits ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={itemEditModalOpen} onClose={() => setItemEditModalOpen(false)} title="Edit Bill Items" size="lg">
        <div className="p-5 space-y-4">
          <p className="text-surface-400 text-sm">
            Update OCR item rows and the bill totals will be recalculated automatically.
          </p>

          <div className="space-y-3">
            {itemDrafts.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-surface-700/40 bg-surface-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold text-sm">Item {index + 1}</p>
                  <span className="text-surface-500 text-xs font-mono">#{item.sr_no || index + 1}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Description</label>
                    <input value={item.description} onChange={(e) => updateItemDraft(item.id, 'description', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Manufacturer</label>
                    <input value={item.manufacturer} onChange={(e) => updateItemDraft(item.id, 'manufacturer', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Pack</label>
                    <input value={item.pack} onChange={(e) => updateItemDraft(item.id, 'pack', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Batch No</label>
                    <input value={item.batch_no} onChange={(e) => updateItemDraft(item.id, 'batch_no', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Expiry Date</label>
                    <input type="date" value={item.expiry_date} onChange={(e) => updateItemDraft(item.id, 'expiry_date', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">HSN</label>
                    <input value={item.hsn_code} onChange={(e) => updateItemDraft(item.id, 'hsn_code', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">SR No</label>
                    <input type="number" value={item.sr_no} onChange={(e) => updateItemDraft(item.id, 'sr_no', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Qty</label>
                    <input type="number" value={item.quantity} onChange={(e) => updateItemDraft(item.id, 'quantity', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Free Qty</label>
                    <input type="number" value={item.free_quantity} onChange={(e) => updateItemDraft(item.id, 'free_quantity', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">MRP</label>
                    <input type="number" value={item.mrp} onChange={(e) => updateItemDraft(item.id, 'mrp', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Rate</label>
                    <input type="number" value={item.rate} onChange={(e) => updateItemDraft(item.id, 'rate', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Discount %</label>
                    <input type="number" value={item.discount_pct} onChange={(e) => updateItemDraft(item.id, 'discount_pct', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">GST %</label>
                    <input type="number" value={item.gst_pct} onChange={(e) => updateItemDraft(item.id, 'gst_pct', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Taxable Amount</label>
                    <input type="number" value={item.taxable_amount} onChange={(e) => updateItemDraft(item.id, 'taxable_amount', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">GST Amount</label>
                    <input type="number" value={item.gst_value} onChange={(e) => updateItemDraft(item.id, 'gst_value', e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-surface-300 text-xs font-medium block mb-1.5">Total Amount</label>
                    <input type="number" value={item.total_amount} onChange={(e) => updateItemDraft(item.id, 'total_amount', e.target.value)} className="input-base" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setItemEditModalOpen(false)} className="btn-secondary flex-1 py-3">
              Cancel
            </button>
            <button onClick={handleSaveItems} disabled={savingItems} className="btn-primary flex-1 py-3 disabled:opacity-50">
              {savingItems ? 'Saving...' : 'Save Items'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

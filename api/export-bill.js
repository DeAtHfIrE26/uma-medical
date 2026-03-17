import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 30,
}

function json(res, statusCode, body) {
  res.status(statusCode).setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

function formatCurrency(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

function buildHtml(bill) {
  const vendor = bill.vendor || {}
  const items  = bill.items  || []

  const itemRows = items.map((item, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${item.sr_no ?? i + 1}</td>
      <td class="left">
        <strong>${item.description || '—'}</strong>
        ${item.manufacturer ? `<br><small>${item.manufacturer}</small>` : ''}
        ${item.pack ? `<br><small class="pack">${item.pack}</small>` : ''}
      </td>
      <td>${item.hsn_code || '—'}</td>
      <td>${item.batch_no || '—'}</td>
      <td>${item.expiry_date || '—'}</td>
      <td class="right">${formatCurrency(item.mrp)}</td>
      <td class="center">${item.quantity ?? '—'}</td>
      <td class="center">${item.free_quantity ?? '—'}</td>
      <td class="right">${formatCurrency(item.rate)}</td>
      <td class="center">${item.discount_pct != null ? item.discount_pct + '%' : '—'}</td>
      <td class="center">${item.gst_pct != null ? item.gst_pct + '%' : '—'}</td>
      <td class="right bold">${formatCurrency(item.total_amount)}</td>
    </tr>
  `).join('')

  const statusColor = bill.payment_status === 'PAID' ? '#22c55e'
    : bill.payment_status === 'PARTIAL' ? '#f59e0b' : '#ef4444'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Bill - ${bill.invoice_no || bill.id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; background: white; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 2px solid #0f172a; }
  .store-name { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
  .store-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .bill-title { font-size: 13px; font-weight: 700; color: #0f172a; text-align: right; }
  .bill-no { font-size: 22px; font-weight: 800; color: #2563eb; text-align: right; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .meta-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
  .meta-box h4 { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .meta-label { color: #64748b; font-size: 10px; }
  .meta-value { color: #0f172a; font-size: 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #0f172a; color: white; padding: 6px 5px; text-align: center; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  th.left { text-align: left; }
  td { padding: 5px 5px; border-bottom: 1px solid #f1f5f9; }
  tr.even td { background: #f8fafc; }
  td.right { text-align: right; }
  td.center { text-align: center; }
  td.left { text-align: left; }
  td.bold { font-weight: 700; color: #0f172a; }
  small { font-size: 9px; color: #64748b; }
  small.pack { color: #2563eb; }
  .totals { display: flex; justify-content: flex-end; margin-top: 8px; }
  .totals-box { width: 240px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid #f1f5f9; }
  .totals-row.total { background: #0f172a; color: white; padding: 8px 12px; }
  .totals-label { font-size: 10px; color: #64748b; }
  .totals-label.bold { color: white; font-weight: 700; font-size: 11px; }
  .totals-value { font-size: 10px; font-weight: 600; color: #0f172a; }
  .totals-value.big { color: #2563eb; font-weight: 800; font-size: 14px; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 9px; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="store-name">UMA MEDICAL AND PHARMACY</div>
    <div class="store-sub">Pharmaceutical Bill Management System</div>
  </div>
  <div>
    <div class="bill-title">PURCHASE INVOICE</div>
    <div class="bill-no">#${bill.invoice_no || bill.id.slice(0, 8).toUpperCase()}</div>
    <div><span class="status-badge">${bill.payment_status || 'UNPAID'}</span></div>
  </div>
</div>

<div class="meta-grid">
  <div class="meta-box">
    <h4>Supplier / Vendor</h4>
    <div class="meta-row"><span class="meta-label">Name</span><span class="meta-value">${vendor.name || '—'}</span></div>
    ${vendor.gstin ? `<div class="meta-row"><span class="meta-label">GSTIN</span><span class="meta-value">${vendor.gstin}</span></div>` : ''}
    ${vendor.dl_no ? `<div class="meta-row"><span class="meta-label">Drug Lic.</span><span class="meta-value">${vendor.dl_no}</span></div>` : ''}
    ${vendor.phone ? `<div class="meta-row"><span class="meta-label">Phone</span><span class="meta-value">${vendor.phone}</span></div>` : ''}
    ${vendor.address ? `<div class="meta-row"><span class="meta-label">Address</span><span class="meta-value" style="max-width:160px;text-align:right">${vendor.address}</span></div>` : ''}
  </div>
  <div class="meta-box">
    <h4>Invoice Details</h4>
    <div class="meta-row"><span class="meta-label">Invoice No.</span><span class="meta-value">${bill.invoice_no || '—'}</span></div>
    <div class="meta-row"><span class="meta-label">Invoice Date</span><span class="meta-value">${formatDate(bill.invoice_date)}</span></div>
    ${bill.due_date ? `<div class="meta-row"><span class="meta-label">Due Date</span><span class="meta-value">${formatDate(bill.due_date)}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Payment</span><span class="meta-value">${bill.payment_mode || '—'}</span></div>
    <div class="meta-row"><span class="meta-label">Amount Paid</span><span class="meta-value" style="color:#22c55e">${formatCurrency(bill.amount_paid ?? 0)}</span></div>
    ${(bill.balance_due ?? 0) > 0 ? `<div class="meta-row"><span class="meta-label">Balance Due</span><span class="meta-value" style="color:#ef4444">${formatCurrency(bill.balance_due)}</span></div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th><th class="left">Description</th><th>HSN</th><th>Batch</th>
      <th>Expiry</th><th>MRP</th><th>Qty</th><th>Free</th>
      <th>Rate</th><th>Disc%</th><th>GST%</th><th>Amount</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<div class="totals">
  <div class="totals-box">
    ${bill.total_taxable != null ? `<div class="totals-row"><span class="totals-label">Taxable</span><span class="totals-value">${formatCurrency(bill.total_taxable)}</span></div>` : ''}
    ${bill.total_gst != null ? `<div class="totals-row"><span class="totals-label">GST</span><span class="totals-value">${formatCurrency(bill.total_gst)}</span></div>` : ''}
    ${bill.round_off ? `<div class="totals-row"><span class="totals-label">Round Off</span><span class="totals-value">${formatCurrency(bill.round_off)}</span></div>` : ''}
    <div class="totals-row total">
      <span class="totals-label bold">NET AMOUNT</span>
      <span class="totals-value big">${formatCurrency(bill.net_amount)}</span>
    </div>
  </div>
</div>

<div class="footer">
  Generated by Uma Medical Store Management System · ${new Date().toLocaleDateString('en-IN')}
</div>

<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, { error: 'Server configuration error' })
  }

  const billId = req.query.id
  if (!billId) {
    return json(res, 400, { error: 'Bill ID is required' })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: bill, error } = await supabase
    .from('bills')
    .select('*, vendor:vendors(*), items:bill_items(*)')
    .eq('id', billId)
    .single()

  if (error || !bill) {
    return json(res, 404, { error: 'Bill not found' })
  }

  const html = buildHtml(bill)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `inline; filename="bill-${bill.invoice_no || billId.slice(0, 8)}.html"`
  )
  res.status(200).send(html)
}

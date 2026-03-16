// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'viewer'
  created_at: string
}

export interface Vendor {
  id: string
  name: string
  address: string | null
  gstin: string | null
  pan: string | null
  phone: string | null
  dl_no: string | null
  bank_name: string | null
  account_no: string | null
  ifsc_code: string | null
  created_at: string
  bill_count?: number
}

export interface Bill {
  id: string
  user_id: string
  vendor_id: string | null
  invoice_no: string | null
  invoice_date: string | null
  due_date: string | null
  payment_mode: string | null
  customer_name: string | null
  customer_address: string | null
  customer_dl: string | null
  customer_pan: string | null
  net_amount: number | null
  total_taxable: number | null
  total_gst: number | null
  round_off: number | null
  image_url: string | null
  raw_parsed_json: string | null
  notes: string | null
  created_at: string
  vendor?: Vendor
  items?: BillItem[]
}

export interface BillItem {
  id: string
  bill_id: string
  sr_no: number | null
  hsn_code: string | null
  description: string
  manufacturer: string | null
  pack: string | null
  batch_no: string | null
  expiry_date: string | null
  mrp: number | null
  quantity: number | null
  free_quantity: number | null
  rate: number | null
  discount_pct: number | null
  taxable_amount: number | null
  gst_pct: number | null
  gst_value: number | null
  total_amount: number | null
}

// ─── Bill Parsing Types ───────────────────────────────────────────────────────

export interface ParsedBill {
  vendor: {
    name: string
    address?: string
    gstin?: string
    pan?: string
    phone?: string
    dl_no?: string
    bank_name?: string
    account_no?: string
    ifsc_code?: string
  }
  invoice: {
    invoice_no?: string
    invoice_date?: string
    due_date?: string
    payment_mode?: string
  }
  customer: {
    name?: string
    address?: string
    dl_no?: string
    pan?: string
    mobile?: string
  }
  items: ParsedBillItem[]
  totals: {
    net_amount?: number
    total_taxable?: number
    total_gst?: number
    round_off?: number
    credit_note?: number
    other?: number
  }
  extra_fields?: Record<string, string>
}

export interface ParsedBillItem {
  sr_no?: number
  hsn_code?: string
  description: string
  manufacturer?: string
  pack?: string
  batch_no?: string
  expiry_date?: string
  mrp?: number
  quantity?: number
  free_quantity?: number
  rate?: number
  discount_pct?: number
  taxable_amount?: number
  gst_pct?: number
  gst_value?: number
  total_amount?: number
}

// ─── Stats Types ──────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalBills: number
  totalAmount: number
  thisMonthBills: number
  thisMonthAmount: number
  uniqueVendors: number
  recentBills: Bill[]
  topVendors: { name: string; count: number; amount: number }[]
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export type SortOrder = 'asc' | 'desc'
export type BillSortField = 'invoice_date' | 'created_at' | 'net_amount' | 'vendor'

export interface BillFilters {
  search?: string
  vendor_id?: string
  date_from?: string
  date_to?: string
  payment_mode?: string
  sort_by?: BillSortField
  sort_order?: SortOrder
  page?: number
  limit?: number
}

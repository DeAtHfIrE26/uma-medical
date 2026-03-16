import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
})

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'viewer'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      vendors: {
        Row: {
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
        }
      }
      bills: {
        Row: {
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
        }
      }
      bill_items: {
        Row: {
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
      }
    }
  }
}

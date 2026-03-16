-- ============================================================
-- UMA MEDICAL STORE — Complete Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. Profiles Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper for admin-only policies
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id
      AND role = 'admin'
  );
$$;

-- ─── 2. Invite Codes Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invite_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES public.profiles(id),
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  used_by     UUID REFERENCES public.profiles(id),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed first invite code for initial admin setup
INSERT INTO public.invite_codes (code, used)
VALUES ('UMAADMIN1', FALSE)
ON CONFLICT (code) DO NOTHING;

-- ─── 3. Vendors Table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  address     TEXT,
  gstin       TEXT,
  pan         TEXT,
  phone       TEXT,
  dl_no       TEXT,
  bank_name   TEXT,
  account_no  TEXT,
  ifsc_code   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint enables single-query upsert (INSERT … ON CONFLICT DO UPDATE)
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_name_unique;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_name_unique UNIQUE (name);

CREATE INDEX IF NOT EXISTS vendors_name_idx ON public.vendors (LOWER(name));

-- ─── 4. Bills Table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bills (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vendor_id         UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  invoice_no        TEXT,
  invoice_date      DATE,
  due_date          DATE,
  payment_mode      TEXT,
  customer_name     TEXT,
  customer_address  TEXT,
  customer_dl       TEXT,
  customer_pan      TEXT,
  net_amount        NUMERIC(12, 2),
  total_taxable     NUMERIC(12, 2),
  total_gst         NUMERIC(12, 2),
  round_off         NUMERIC(8, 2),
  image_url         TEXT,
  raw_parsed_json   TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bills_user_id_idx ON public.bills (user_id);
CREATE INDEX IF NOT EXISTS bills_vendor_id_idx ON public.bills (vendor_id);
CREATE INDEX IF NOT EXISTS bills_invoice_date_idx ON public.bills (invoice_date DESC);
CREATE INDEX IF NOT EXISTS bills_created_at_idx ON public.bills (created_at DESC);

-- ─── 5. Bill Items Table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bill_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id         UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  sr_no           INTEGER,
  hsn_code        TEXT,
  description     TEXT NOT NULL,
  manufacturer    TEXT,
  pack            TEXT,
  batch_no        TEXT,
  expiry_date     TEXT,
  mrp             NUMERIC(10, 2),
  quantity        NUMERIC(10, 3),
  free_quantity   NUMERIC(10, 3),
  rate            NUMERIC(10, 2),
  discount_pct    NUMERIC(6, 2),
  taxable_amount  NUMERIC(12, 2),
  gst_pct         NUMERIC(5, 2),
  gst_value       NUMERIC(12, 2),
  total_amount    NUMERIC(12, 2)
);

CREATE INDEX IF NOT EXISTS bill_items_bill_id_idx ON public.bill_items (bill_id);

-- ─── 6. Row-Level Security (RLS) ─────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see and update their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Invite codes: only admins can generate codes directly from the app.
-- Validation and consumption are handled by the server-side registration endpoint.
DROP POLICY IF EXISTS "invite_codes_select" ON public.invite_codes;
DROP POLICY IF EXISTS "invite_codes_insert" ON public.invite_codes;
DROP POLICY IF EXISTS "invite_codes_update" ON public.invite_codes;
DROP POLICY IF EXISTS "invite_codes_admin_insert" ON public.invite_codes;
CREATE POLICY "invite_codes_admin_insert" ON public.invite_codes
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- Vendors: all authenticated users can CRUD
DROP POLICY IF EXISTS "vendors_all_authenticated" ON public.vendors;
CREATE POLICY "vendors_all_authenticated" ON public.vendors
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Bills: all authenticated users can read all bills (shared store data)
DROP POLICY IF EXISTS "bills_select_authenticated" ON public.bills;
CREATE POLICY "bills_select_authenticated" ON public.bills
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bills_insert_authenticated" ON public.bills;
CREATE POLICY "bills_insert_authenticated" ON public.bills
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bills_update_authenticated" ON public.bills;
CREATE POLICY "bills_update_authenticated" ON public.bills
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bills_delete_authenticated" ON public.bills;
CREATE POLICY "bills_delete_authenticated" ON public.bills
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Bill items: follow parent bill access
DROP POLICY IF EXISTS "bill_items_select_authenticated" ON public.bill_items;
CREATE POLICY "bill_items_select_authenticated" ON public.bill_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bill_items_insert_authenticated" ON public.bill_items;
CREATE POLICY "bill_items_insert_authenticated" ON public.bill_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bill_items_update_authenticated" ON public.bill_items;
CREATE POLICY "bill_items_update_authenticated" ON public.bill_items
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bill_items_delete_authenticated" ON public.bill_items;
CREATE POLICY "bill_items_delete_authenticated" ON public.bill_items
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ─── 7. Storage Bucket ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bills',
  'bills',
  FALSE,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "bills_storage_select" ON storage.objects;
CREATE POLICY "bills_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'bills' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bills_storage_insert" ON storage.objects;
CREATE POLICY "bills_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bills' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bills_storage_delete" ON storage.objects;
CREATE POLICY "bills_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'bills' AND auth.uid() IS NOT NULL);

-- ─── Done! ───────────────────────────────────────────────────────────────────
-- Your first invite code is: UMAADMIN1
-- Use it to register the first admin account.

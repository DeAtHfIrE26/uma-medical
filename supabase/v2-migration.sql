-- ============================================================
-- UMA MEDICAL STORE — Version 2 Migration
-- Safe to run on an existing V1 database.
-- All statements use IF NOT EXISTS / DO NOTHING / ADD COLUMN IF NOT EXISTS
-- so this script is fully idempotent (can be re-run without harm).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Estimated execution time: < 5 seconds
-- ============================================================

BEGIN;

-- ─── 1. Fuzzy matching extension (safe, no-op if already enabled) ─────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. Bills table — add V2 columns ─────────────────────────────────────────
-- All ADD COLUMN IF NOT EXISTS — completely safe on existing data

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS transaction_type  TEXT NOT NULL DEFAULT 'PURCHASE'
    CHECK (transaction_type IN (
      'PURCHASE', 'PURCHASE_RETURN', 'PAYMENT_OUT',
      'SALE', 'SALE_RETURN', 'PAYMENT_IN', 'EXPENSE'
    )),
  ADD COLUMN IF NOT EXISTS payment_status    TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
  ADD COLUMN IF NOT EXISTS amount_paid       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_review      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_confidence     SMALLINT;

-- Back-fill: all existing bills that have net_amount = amount_paid get PAID status
-- (bills created before V2 are treated as UNPAID by default, which is correct)
-- No back-fill needed — DEFAULT 'UNPAID' handles it.

-- ─── 3. Computed balance_due column ──────────────────────────────────────────
-- Postgres generated column: always correct, zero app logic needed.
-- We add it only if it doesn't exist yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'bills'
      AND column_name  = 'balance_due'
  ) THEN
    ALTER TABLE public.bills
      ADD COLUMN balance_due NUMERIC(12, 2)
        GENERATED ALWAYS AS (GREATEST(0, COALESCE(net_amount, 0) - COALESCE(amount_paid, 0))) STORED;
  END IF;
END;
$$;

-- ─── 4. Indexes for V2 query patterns ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bills_payment_status_idx    ON public.bills (payment_status);
CREATE INDEX IF NOT EXISTS bills_transaction_type_idx  ON public.bills (transaction_type);
CREATE INDEX IF NOT EXISTS bills_needs_review_idx      ON public.bills (needs_review) WHERE needs_review = TRUE;

-- Fuzzy vendor name matching
CREATE INDEX IF NOT EXISTS vendors_name_trgm_idx ON public.vendors USING GIN (name gin_trgm_ops);

-- ─── 5. Inventory table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name      TEXT        NOT NULL,
  display_name   TEXT        NOT NULL,
  hsn_code       TEXT,
  manufacturer   TEXT,
  pack           TEXT,
  current_stock  NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unit           TEXT           NOT NULL DEFAULT 'STRIP',
  reorder_level  NUMERIC(10, 3) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_item_name_unique UNIQUE (item_name)
);

CREATE INDEX IF NOT EXISTS inventory_item_name_idx  ON public.inventory (LOWER(item_name));
CREATE INDEX IF NOT EXISTS inventory_stock_idx      ON public.inventory (current_stock);
CREATE INDEX IF NOT EXISTS inventory_name_trgm_idx  ON public.inventory USING GIN (display_name gin_trgm_ops);

-- ─── 6. Inventory batches table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id  UUID        NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  bill_id       UUID        REFERENCES public.bills(id) ON DELETE SET NULL,
  batch_no      TEXT        NOT NULL,
  expiry_date   DATE,
  quantity      NUMERIC(10, 3) NOT NULL DEFAULT 0,
  mrp           NUMERIC(10, 2),
  purchase_rate NUMERIC(10, 2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS batches_inventory_id_idx ON public.inventory_batches (inventory_id);
CREATE INDEX IF NOT EXISTS batches_expiry_date_idx  ON public.inventory_batches (expiry_date ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS batches_bill_id_idx      ON public.inventory_batches (bill_id);

-- ─── 7. Auto-update inventory.updated_at trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_inventory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_updated_at_trigger ON public.inventory;
CREATE TRIGGER inventory_updated_at_trigger
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated_at();

-- ─── 8. Auto-sync stock from bill_items (the core automation) ─────────────────
-- When a bill item is inserted (from a scan), stock is automatically updated.
-- PURCHASE     → increment stock
-- PURCHASE_RETURN → decrement stock (never below 0)

CREATE OR REPLACE FUNCTION public.sync_inventory_from_bill_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill          public.bills%ROWTYPE;
  v_multiplier    NUMERIC := 1;
  v_inv_id        UUID;
  v_norm_name     TEXT;
BEGIN
  -- Only process if bill has quantity
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Get the parent bill to check transaction type
  SELECT * INTO v_bill FROM public.bills WHERE id = NEW.bill_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Only process PURCHASE and PURCHASE_RETURN
  IF v_bill.transaction_type NOT IN ('PURCHASE', 'PURCHASE_RETURN') THEN
    RETURN NEW;
  END IF;

  IF v_bill.transaction_type = 'PURCHASE_RETURN' THEN
    v_multiplier := -1;
  END IF;

  v_norm_name := LOWER(TRIM(NEW.description));

  -- Upsert into inventory (insert or update stock)
  INSERT INTO public.inventory (item_name, display_name, hsn_code, manufacturer, pack, current_stock, unit)
  VALUES (
    v_norm_name,
    NEW.description,
    NEW.hsn_code,
    NEW.manufacturer,
    NEW.pack,
    GREATEST(0, COALESCE(NEW.quantity, 0) * v_multiplier),
    'STRIP'
  )
  ON CONFLICT (item_name) DO UPDATE
    SET current_stock = GREATEST(0, inventory.current_stock + (COALESCE(NEW.quantity, 0) * v_multiplier)),
        display_name  = EXCLUDED.display_name,
        hsn_code      = COALESCE(EXCLUDED.hsn_code, inventory.hsn_code),
        manufacturer  = COALESCE(EXCLUDED.manufacturer, inventory.manufacturer),
        pack          = COALESCE(EXCLUDED.pack, inventory.pack),
        updated_at    = NOW()
  RETURNING id INTO v_inv_id;

  -- If PURCHASE and has batch info, record the batch for expiry tracking
  IF v_bill.transaction_type = 'PURCHASE'
     AND NEW.batch_no IS NOT NULL
     AND v_inv_id IS NOT NULL
  THEN
    INSERT INTO public.inventory_batches (
      inventory_id, bill_id, batch_no, expiry_date, quantity, mrp, purchase_rate
    )
    VALUES (
      v_inv_id,
      NEW.bill_id,
      NEW.batch_no,
      CASE
        WHEN NEW.expiry_date IS NOT NULL AND NEW.expiry_date ~ '^\d{4}-\d{2}-\d{2}$'
          THEN NEW.expiry_date::DATE
        ELSE NULL
      END,
      COALESCE(NEW.quantity, 0),
      NEW.mrp,
      NEW.rate
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_bill_item_insert_sync_inventory ON public.bill_items;
CREATE TRIGGER on_bill_item_insert_sync_inventory
  AFTER INSERT ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_bill_items();

-- ─── 9. RLS Policies for new tables ──────────────────────────────────────────
ALTER TABLE public.inventory         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_all_authenticated"         ON public.inventory;
DROP POLICY IF EXISTS "inventory_batches_all_authenticated" ON public.inventory_batches;

CREATE POLICY "inventory_all_authenticated" ON public.inventory
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "inventory_batches_all_authenticated" ON public.inventory_batches
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── 10. Helper function: find similar vendor (fuzzy match) ───────────────────
CREATE OR REPLACE FUNCTION public.find_similar_vendor(
  vendor_name TEXT,
  threshold   FLOAT DEFAULT 0.5
)
RETURNS TABLE (id UUID, name TEXT, similarity FLOAT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, similarity(name, vendor_name) AS similarity
  FROM public.vendors
  WHERE similarity(name, vendor_name) >= threshold
  ORDER BY similarity DESC
  LIMIT 3;
$$;

-- ─── 11. Daily P&L view (for History page, no materialization needed) ─────────
CREATE OR REPLACE VIEW public.monthly_pl AS
  SELECT
    DATE_TRUNC('month', invoice_date) AS month,
    transaction_type,
    COUNT(*)                          AS bill_count,
    SUM(net_amount)                   AS total_amount,
    SUM(amount_paid)                  AS total_paid,
    SUM(COALESCE(net_amount, 0) - COALESCE(amount_paid, 0)) AS total_outstanding
  FROM public.bills
  WHERE invoice_date IS NOT NULL
  GROUP BY DATE_TRUNC('month', invoice_date), transaction_type
  ORDER BY month DESC, transaction_type;

-- ─── 12. Storage bucket — increase limit for multi-image support ──────────────
-- Increase from 10MB to 20MB to accommodate multi-page bill uploads
UPDATE storage.buckets
SET file_size_limit = 20971520   -- 20MB
WHERE id = 'bills';

-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Summary of changes:
--   bills table    → +transaction_type, +payment_status, +amount_paid, +needs_review, +ai_confidence, +balance_due
--   inventory      → NEW TABLE (auto-populated by trigger)
--   inventory_batches → NEW TABLE (expiry tracking per batch)
--   Trigger        → sync_inventory_from_bill_items (auto stock management)
--   View           → monthly_pl (P&L reporting)
--   Function       → find_similar_vendor (fuzzy matching)
--   Extension      → pg_trgm (fuzzy text search)
--   Indexes        → 9 new indexes for V2 queries
--   RLS            → enabled + policies on both new tables

COMMIT;

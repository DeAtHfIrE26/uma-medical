# Uma Medical Store — Bill Management System

A mobile-first PWA for managing pharmaceutical bills. Scan/upload bills, AI extracts all data automatically, tracks history by vendor, and works fully offline.

**Stack:** React + Vite + TypeScript + Tailwind CSS + Supabase + Gemini AI + AES-256 Encryption

---

## Setup Instructions (Follow in Order)

### Step 1: Supabase Setup

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Click **New Project** → name it `uma-medical` → choose a strong DB password → select a region close to India (e.g., Southeast Asia)
3. Wait ~2 minutes for the project to provision
4. Go to **SQL Editor** → click **New Query**
5. Copy the entire contents of `supabase/schema.sql` and paste it → click **Run**
6. Go to **Storage** → click **New Bucket**:
   - Name: `bills`
   - Check: **Public bucket** ✓
   - Max file size: `10 MB`
   - Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic`
   - Click Save
7. In Storage → Policies, add these policies for the `bills` bucket:
   - SELECT: `auth.uid() IS NOT NULL`
   - INSERT: `auth.uid() IS NOT NULL`
   - DELETE: `auth.uid() IS NOT NULL`
8. Go to **Project Settings → API**:
   - Copy the **Project URL** (looks like `https://abcdef.supabase.co`)
   - Copy the **anon/public** key (long string starting with `eyJ...`)

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
2. Edit `.env` and fill in your values:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
   VITE_GEMINI_API_KEY=AIzaSyAWohiRHQE-RcuO-yzx3HfVM_NvQaW6jtI
   VITE_ENCRYPTION_SECRET=uma_medical_store_super_secret_key_2024_xyz
   ```

### Step 3: First Admin Registration

1. Open the app → click **Register with invite code**
2. Use the first-time code: **`UMAADMIN1`**
3. Fill in your name, email, and password
4. Check your email for the verification link → click it
5. Log in with your credentials

> After you're logged in, go to **Settings → Generate Invite Code** to create codes for other admins.

### Step 4: Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 5: Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com) → New Project
2. Import this project folder (or push to GitHub first, then import)
3. Framework: **Vite** (auto-detected)
4. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
   - `VITE_ENCRYPTION_SECRET`
5. Click **Deploy**
6. Once deployed, copy the production URL (e.g., `https://uma-medical.vercel.app`)
7. In Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://your-app.vercel.app`
   - Add Redirect URLs: `https://your-app.vercel.app/**`

### Step 6: Install on Mobile (PWA)

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the three-dot menu → **Add to Home screen**
3. Tap **Add** → Done! Opens like a native app

**iOS (Safari):**
1. Open the app URL in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add** → Done!

---

## Features

| Feature | Description |
|---|---|
| **AI Bill Scanning** | Upload photo or use camera. Gemini AI extracts all data automatically |
| **Auto Vendor Detection** | Vendor created/matched automatically from bill |
| **Full Line Items** | All products, batches, expiry, GST, discounts extracted |
| **Vendor History** | All bills grouped by pharmaceutical company |
| **Dashboard** | Monthly stats, top vendors, recent bills |
| **Reports** | 6-month chart, billing timeline |
| **Invite-Only Auth** | No random signups — invite code required |
| **AES-256 Encryption** | Browser-native, zero-cost field encryption |
| **PWA** | Installable on mobile, works offline |
| **Multi-Admin** | Multiple admins can share the store data |

## Bill Parsing

The AI (Gemini 2.5 Flash) auto-extracts:
- Vendor name, address, GSTIN, PAN, phone, bank details
- Invoice number, date, due date, payment mode
- Customer name, address, DL, PAN
- Every line item: description, batch, expiry, MRP, quantity, rate, GST, discount, amount
- Totals: taxable, GST, round off, net amount

Works with **any** pharmaceutical bill format — different vendors, mixed Hindi/Gujarati/English.

Fallback chain: `gemini-2.5-flash-preview` → `gemini-2.0-flash` → `gemini-1.5-flash`

---

## Security

- **Auth**: Supabase JWT tokens, auto-refresh, RLS enforced at DB level
- **Registration**: Invite-code locked — only known admins can register
- **Encryption**: AES-256-GCM via Web Crypto API for sensitive fields
- **Storage**: Bill images stored in Supabase Storage with auth-required access
- **HTTPS**: Enforced by Vercel
- **Security Headers**: X-Frame-Options, CSP, XSS-Protection via vercel.json

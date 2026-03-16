import type { ParsedBill } from '@/types'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// ─── VERIFIED WORKING MODELS (tested live against this API key) ───────────────
// Each model has its OWN quota bucket — rotating gives ~40 RPM combined.
// Ordered: highest RPM first for fastest throughput.
const MODELS = [
  { id: 'gemini-3.1-flash-lite-preview', rpm: 15 },  // Highest quota — try first
  { id: 'gemini-2.5-flash-lite',         rpm: 10 },  // Second highest
  { id: 'gemini-2.5-flash',              rpm: 5  },  // Best quality
  { id: 'gemini-3-flash-preview',        rpm: 5  },  // Separate bucket
  { id: 'gemini-flash-latest',           rpm: 5  },  // Alias fallback
]

// Round-robin index — distributes load across quota buckets between calls
let _modelIndex = 0
function getNextModel() {
  const m = MODELS[_modelIndex % MODELS.length]
  _modelIndex++
  return m
}

// ─── Extraction Prompt ────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an expert OCR system for Indian pharmaceutical invoices.

Extract ALL data from this bill/invoice image. The text may be in English, Hindi, or Gujarati.
Return ONLY valid JSON — no markdown, no explanation, no code fences.

{
  "vendor": {
    "name": "supplier company name",
    "address": "full address",
    "gstin": "GSTIN number",
    "pan": "PAN number",
    "phone": "phone/mobile numbers",
    "dl_no": "drug license number",
    "bank_name": "bank name",
    "account_no": "account number",
    "ifsc_code": "IFSC code"
  },
  "invoice": {
    "invoice_no": "invoice/bill number",
    "invoice_date": "YYYY-MM-DD",
    "due_date": "YYYY-MM-DD",
    "payment_mode": "CASH or CREDIT or CHEQUE"
  },
  "customer": {
    "name": "buyer/customer name",
    "address": "buyer address",
    "dl_no": "buyer drug license",
    "pan": "buyer PAN",
    "mobile": "buyer mobile"
  },
  "items": [
    {
      "sr_no": 1,
      "hsn_code": "HSN code",
      "description": "medicine/product name",
      "manufacturer": "manufacturer name or abbreviation",
      "pack": "pack size e.g. 1X10",
      "batch_no": "batch number",
      "expiry_date": "MM/YY",
      "mrp": 0.00,
      "quantity": 0,
      "free_quantity": 0,
      "rate": 0.00,
      "discount_pct": 0.00,
      "taxable_amount": 0.00,
      "gst_pct": 0.00,
      "gst_value": 0.00,
      "total_amount": 0.00
    }
  ],
  "totals": {
    "net_amount": 0.00,
    "total_taxable": 0.00,
    "total_gst": 0.00,
    "round_off": 0.00,
    "credit_note": 0.00,
    "other": 0.00
  }
}

RULES: Extract every line item. All numeric fields must be numbers not strings. Use null for missing fields.`

// ─── Image to Base64 ─────────────────────────────────────────────────────────

export async function imageToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, data] = result.split(',')
      const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
      resolve({ data, mimeType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Single model call ────────────────────────────────────────────────────────

async function callModel(
  modelId: string,
  imageData: string,
  mimeType: string
): Promise<string> {
  const url = `${API_BASE}/${modelId}:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: EXTRACTION_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageData } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 16,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const err = new Error(body?.error?.message || `HTTP ${response.status}`) as Error & { status: number }
    err.status = response.status
    throw err
  }

  const candidate = body?.candidates?.[0]
  if (!candidate) {
    const reason = body?.promptFeedback?.blockReason
    throw new Error(reason ? `Response blocked: ${reason}` : 'No candidate in response')
  }

  const text = candidate?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty text in response')
  return text
}

// ─── JSON normalisation ───────────────────────────────────────────────────────

function extractJSON(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) return raw.substring(start, end + 1)
  return raw.trim()
}

function num(v: unknown): number | null {
  return v != null && v !== '' ? Number(v) : null
}

function normaliseParsed(raw: string): ParsedBill {
  const parsed = JSON.parse(extractJSON(raw))

  if (Array.isArray(parsed.items)) {
    parsed.items = parsed.items.map((item: Record<string, unknown>) => ({
      ...item,
      sr_no:          num(item.sr_no),
      mrp:            num(item.mrp),
      quantity:       num(item.quantity),
      free_quantity:  num(item.free_quantity),
      rate:           num(item.rate),
      discount_pct:   num(item.discount_pct),
      taxable_amount: num(item.taxable_amount),
      gst_pct:        num(item.gst_pct),
      gst_value:      num(item.gst_value),
      total_amount:   num(item.total_amount),
    }))
  }

  if (parsed.totals) {
    const t = parsed.totals
    parsed.totals = {
      net_amount:    num(t.net_amount),
      total_taxable: num(t.total_taxable),
      total_gst:     num(t.total_gst),
      round_off:     num(t.round_off),
      credit_note:   num(t.credit_note),
      other:         num(t.other),
    }
  }

  if (!parsed.vendor)               parsed.vendor   = { name: 'Unknown Vendor' }
  if (!parsed.vendor?.name)         parsed.vendor.name = 'Unknown Vendor'
  if (!parsed.invoice)              parsed.invoice  = {}
  if (!parsed.customer)             parsed.customer = {}
  if (!Array.isArray(parsed.items)) parsed.items    = []
  if (!parsed.totals)               parsed.totals   = {}

  return parsed as ParsedBill
}

// ─── Main: Parse Bill Image ───────────────────────────────────────────────────
// Algorithm:
//   1. Start with the next model in round-robin rotation.
//   2. On 429: immediately try the next model (different quota bucket).
//   3. If ALL models return 429: wait 12s (minimum quota reset) and retry all.
//   4. On 404/unavailable: skip that model permanently this call.
//   5. Max 2 full passes through all models before giving up.

export async function parseBillImage(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ParsedBill> {
  const { data: imageData, mimeType } = await imageToBase64(file)

  const log = (msg: string) => {
    console.log(`[Gemini] ${msg}`)
    onProgress?.(msg)
  }

  // Build a shuffled working list starting from round-robin position
  const startIdx = _modelIndex % MODELS.length
  const orderedModels = [
    ...MODELS.slice(startIdx),
    ...MODELS.slice(0, startIdx),
  ]

  for (let pass = 0; pass < 2; pass++) {
    let allRateLimited = true

    for (const model of orderedModels) {
      try {
        log(`Trying ${model.id}${pass > 0 ? ' (retry)' : ''}`)
        const raw = await callModel(model.id, imageData, mimeType)
        _modelIndex++ // advance for next call
        log(`Success with ${model.id}`)
        return normaliseParsed(raw)
      } catch (err) {
        const error = err as Error & { status?: number }
        const status = error.status ?? 0
        const msg = error.message ?? ''

        const is429 = status === 429 ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('quota')

        const isUnavailable = status === 404 ||
          status === 400 ||
          msg.includes('not found') ||
          msg.includes('not supported') ||
          msg.includes('MODEL_NOT_FOUND')

        if (isUnavailable) {
          log(`${model.id} not available — skipping`)
          allRateLimited = false // not a rate limit issue
          continue
        }

        if (is429) {
          log(`${model.id} rate limited — trying next model`)
          continue // immediately try next model (different quota)
        }

        // Unknown error — log and try next
        log(`${model.id} error: ${msg}`)
        allRateLimited = false
        continue
      }
    }

    // All models tried — if all were rate limited, wait for quota reset
    if (allRateLimited && pass === 0) {
      log('All models rate limited — waiting 12s for quota reset...')
      await new Promise(r => setTimeout(r, 12000))
    }
  }

  throw new Error(
    'Bill extraction temporarily unavailable. All models are rate-limited ' +
    '(free tier: 5–15 requests/minute per model). Please wait 1 minute and try again.'
  )
}

// ─── Re-parse single field ────────────────────────────────────────────────────

export async function reparseBillField(
  file: File,
  fieldHint: string
): Promise<Partial<ParsedBill>> {
  const { data: imageData, mimeType } = await imageToBase64(file)
  const prompt = `Extract only "${fieldHint}" from this pharmaceutical bill. Return minimal JSON only, no explanation.`

  for (const { id } of MODELS) {
    try {
      const url = `${API_BASE}/${id}:generateContent?key=${GEMINI_API_KEY}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageData } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      })
      if (!res.ok) continue
      const result = await res.json()
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      return JSON.parse(extractJSON(text))
    } catch { continue }
  }
  return {}
}

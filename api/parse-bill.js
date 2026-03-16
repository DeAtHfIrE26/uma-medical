const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const MODELS = [
  { id: 'gemini-2.5-flash-lite', rpm: 10 },
  { id: 'gemini-2.5-flash', rpm: 5 },
  { id: 'gemini-3-flash-preview', rpm: 5 },
  { id: 'gemini-flash-latest', rpm: 5 },
]

const EXTRACTION_PROMPT = `You are an expert OCR system for Indian pharmaceutical invoices.

Extract ALL data from this bill/invoice image. The text may be in English, Hindi, or Gujarati.
Return ONLY valid JSON with no markdown, code fences, or commentary.

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
    "invoice_no": "invoice or bill number",
    "invoice_date": "YYYY-MM-DD",
    "due_date": "YYYY-MM-DD",
    "payment_mode": "CASH or CREDIT or CHEQUE"
  },
  "customer": {
    "name": "buyer or customer name",
    "address": "buyer address",
    "dl_no": "buyer drug license",
    "pan": "buyer PAN",
    "mobile": "buyer mobile"
  },
  "items": [
    {
      "sr_no": 1,
      "hsn_code": "HSN code",
      "description": "medicine or product name",
      "manufacturer": "manufacturer name or abbreviation",
      "pack": "pack size such as 1X10",
      "batch_no": "batch number",
      "expiry_date": "MM/YY",
      "mrp": 0.0,
      "quantity": 0,
      "free_quantity": 0,
      "rate": 0.0,
      "discount_pct": 0.0,
      "taxable_amount": 0.0,
      "gst_pct": 0.0,
      "gst_value": 0.0,
      "total_amount": 0.0
    }
  ],
  "totals": {
    "net_amount": 0.0,
    "total_taxable": 0.0,
    "total_gst": 0.0,
    "round_off": 0.0,
    "credit_note": 0.0,
    "other": 0.0
  }
}

Rules:
- Extract every visible line item.
- All numeric fields must be numbers, not strings.
- Use null for missing scalar values.
- Preserve invoice and vendor identifiers exactly as printed.`

export const config = {
  maxDuration: 60,
}

function json(res, statusCode, body) {
  res.status(statusCode).setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

function extractJSON(raw) {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1)
  }

  return raw.trim()
}

function numberOrNull(value) {
  return value != null && value !== '' ? Number(value) : null
}

function normaliseParsed(raw) {
  const parsed = JSON.parse(extractJSON(raw))

  if (Array.isArray(parsed.items)) {
    parsed.items = parsed.items.map((item) => ({
      ...item,
      sr_no: numberOrNull(item.sr_no),
      mrp: numberOrNull(item.mrp),
      quantity: numberOrNull(item.quantity),
      free_quantity: numberOrNull(item.free_quantity),
      rate: numberOrNull(item.rate),
      discount_pct: numberOrNull(item.discount_pct),
      taxable_amount: numberOrNull(item.taxable_amount),
      gst_pct: numberOrNull(item.gst_pct),
      gst_value: numberOrNull(item.gst_value),
      total_amount: numberOrNull(item.total_amount),
    }))
  }

  if (parsed.totals) {
    const totals = parsed.totals
    parsed.totals = {
      net_amount: numberOrNull(totals.net_amount),
      total_taxable: numberOrNull(totals.total_taxable),
      total_gst: numberOrNull(totals.total_gst),
      round_off: numberOrNull(totals.round_off),
      credit_note: numberOrNull(totals.credit_note),
      other: numberOrNull(totals.other),
    }
  }

  if (!parsed.vendor) parsed.vendor = { name: 'Unknown Vendor' }
  if (!parsed.vendor.name) parsed.vendor.name = 'Unknown Vendor'
  if (!parsed.invoice) parsed.invoice = {}
  if (!parsed.customer) parsed.customer = {}
  if (!Array.isArray(parsed.items)) parsed.items = []
  if (!parsed.totals) parsed.totals = {}

  return parsed
}

async function callModel(apiKey, modelId, prompt, imageData, mimeType) {
  const response = await fetch(`${API_BASE}/${modelId}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
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
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  return text
}

async function parseWithFallback(apiKey, prompt, imageData, mimeType) {
  let sawRateLimit = false

  for (let pass = 0; pass < 2; pass += 1) {
    for (const model of MODELS) {
      try {
        const raw = await callModel(apiKey, model.id, prompt, imageData, mimeType)
        return {
          parsed: normaliseParsed(raw),
          status: `Processed securely with ${model.id}`,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Gemini error'
        const status = typeof error === 'object' && error && 'status' in error ? error.status : 0
        const isRateLimited = status === 429 || message.includes('RESOURCE_EXHAUSTED') || message.includes('quota')
        const isUnavailable = status === 400 || status === 404 || message.includes('not supported') || message.includes('not found')

        if (isRateLimited) {
          sawRateLimit = true
          continue
        }

        if (isUnavailable) {
          continue
        }

        throw new Error(message)
      }
    }

    if (sawRateLimit && pass === 0) {
      await new Promise((resolve) => setTimeout(resolve, 12000))
    }
  }

  throw new Error(
    'Bill extraction is temporarily unavailable because the AI quota is exhausted. Please wait a minute and try again.'
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return json(res, 500, { error: 'Server is missing GEMINI_API_KEY' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { imageData, mimeType, fieldHint } = body
  if (!imageData || !mimeType) {
    return json(res, 400, { error: 'imageData and mimeType are required' })
  }

  const prompt = fieldHint
    ? `Extract only "${fieldHint}" from this pharmaceutical bill. Return minimal JSON only with no explanation.`
    : EXTRACTION_PROMPT

  try {
    const result = await parseWithFallback(apiKey, prompt, imageData, mimeType)
    return json(res, 200, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Secure bill parsing failed'
    return json(res, 502, { error: message })
  }
}

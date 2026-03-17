const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Ordered to match models actually available to the current Gemini API project.
// We prefer stable flash variants that support `generateContent` and image input.
const MODELS = [
  { id: 'gemini-2.0-flash',          rpm: 15 },
  { id: 'gemini-2.0-flash-001',      rpm: 15 },
  { id: 'gemini-2.0-flash-lite',     rpm: 15 },
  { id: 'gemini-2.0-flash-lite-001', rpm: 15 },
  { id: 'gemini-flash-latest',       rpm: 15 },
  { id: 'gemini-flash-lite-latest',  rpm: 15 },
  { id: 'gemini-2.5-flash',          rpm: 10 },
  { id: 'gemini-2.5-flash-lite',     rpm: 10 },
]

const EXTRACTION_PROMPT = `You are an expert OCR system for Indian pharmaceutical invoices.

Extract ALL data from this bill/invoice image (may be multiple pages). The text may be in English, Hindi, or Gujarati.
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
      "expiry_date": "MM/YY or MM/YYYY — preserve exactly as printed",
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
  },
  "_meta": {
    "confidence": 85,
    "low_confidence_fields": ["field names you are uncertain about"]
  }
}

Rules:
- Extract every visible line item from ALL pages.
- All numeric fields must be numbers, not strings.
- Use null for missing scalar values.
- Preserve invoice and vendor identifiers exactly as printed.
- For confidence: 90-100 = very clear bill, 70-89 = readable with minor issues, below 70 = blurry/partial.
- List any fields you could not read clearly in low_confidence_fields.`

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

function cleanJSONString(value) {
  return value
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

function repairCommonJSONIssues(value) {
  let repaired = cleanJSONString(value)

  // Remove trailing commas before object/array endings.
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')

  // Fix adjacent objects inside arrays or lists: `}{` => `},{`
  repaired = repaired.replace(/}\s*{/g, '},{')

  // Fix missing commas between quoted values and next key.
  repaired = repaired.replace(/("\s*)(")([A-Za-z0-9_]+)"\s*:/g, '$1,$2$3":')

  // Fix missing commas between number/null/boolean and next key.
  repaired = repaired.replace(/(\b\d+(?:\.\d+)?|\bnull\b|\btrue\b|\bfalse\b)\s*(")([A-Za-z0-9_]+)"\s*:/g, '$1,$2$3":')

  return repaired
}

function parseLooseJSON(raw) {
  const extracted = extractJSON(raw)

  try {
    return JSON.parse(extracted)
  } catch (firstError) {
    const repaired = repairCommonJSONIssues(extracted)
    try {
      return JSON.parse(repaired)
    } catch (secondError) {
      const error = new Error(
        secondError instanceof Error
          ? secondError.message
          : firstError instanceof Error
            ? firstError.message
            : 'Invalid JSON from model'
      )
      error.original_json = extracted
      error.repaired_json = repaired
      throw error
    }
  }
}

function numberOrNull(value) {
  return value != null && value !== '' ? Number(value) : null
}

/**
 * Normalizes pharmaceutical expiry date strings to YYYY-MM-DD.
 * Handles: MM/YY, MM/YYYY, MMM-YY, MMM YYYY, MM-YY, MM-YYYY
 */
function normalizeExpiryDate(raw) {
  if (!raw || typeof raw !== 'string') return raw

  const s = raw.trim()

  // MM/YY → 20YY-MM-01
  const mmyy = s.match(/^(\d{1,2})\/(\d{2})$/)
  if (mmyy) {
    const month = mmyy[1].padStart(2, '0')
    const year = `20${mmyy[2]}`
    return `${year}-${month}-01`
  }

  // MM/YYYY → YYYY-MM-01
  const mmyyyy = s.match(/^(\d{1,2})\/(\d{4})$/)
  if (mmyyyy) {
    const month = mmyyyy[1].padStart(2, '0')
    return `${mmyyyy[2]}-${month}-01`
  }

  // MM-YY → 20YY-MM-01
  const mmyy2 = s.match(/^(\d{1,2})-(\d{2})$/)
  if (mmyy2) {
    const month = mmyy2[1].padStart(2, '0')
    const year = `20${mmyy2[2]}`
    return `${year}-${month}-01`
  }

  // MM-YYYY → YYYY-MM-01
  const mmyyyy2 = s.match(/^(\d{1,2})-(\d{4})$/)
  if (mmyyyy2) {
    const month = mmyyyy2[1].padStart(2, '0')
    return `${mmyyyy2[2]}-${month}-01`
  }

  // MMM-YY or MMM YY (e.g. "Aug-26", "Aug 26")
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const mmmyy = s.match(/^([A-Za-z]{3})[\s-](\d{2})$/)
  if (mmmyy) {
    const idx = monthNames.indexOf(mmmyy[1].toLowerCase())
    if (idx !== -1) {
      const month = String(idx + 1).padStart(2, '0')
      return `20${mmmyy[2]}-${month}-01`
    }
  }

  // MMM-YYYY or MMM YYYY (e.g. "Aug-2026", "Aug 2026")
  const mmmyyyy = s.match(/^([A-Za-z]{3})[\s-](\d{4})$/)
  if (mmmyyyy) {
    const idx = monthNames.indexOf(mmmyyyy[1].toLowerCase())
    if (idx !== -1) {
      const month = String(idx + 1).padStart(2, '0')
      return `${mmmyyyy[2]}-${month}-01`
    }
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  return s
}

function normaliseParsed(raw) {
  const parsed = parseLooseJSON(raw)

  if (Array.isArray(parsed.items)) {
    parsed.items = parsed.items.map((item) => ({
      ...item,
      sr_no:          numberOrNull(item.sr_no),
      mrp:            numberOrNull(item.mrp),
      quantity:       numberOrNull(item.quantity),
      free_quantity:  numberOrNull(item.free_quantity),
      rate:           numberOrNull(item.rate),
      discount_pct:   numberOrNull(item.discount_pct),
      taxable_amount: numberOrNull(item.taxable_amount),
      gst_pct:        numberOrNull(item.gst_pct),
      gst_value:      numberOrNull(item.gst_value),
      total_amount:   numberOrNull(item.total_amount),
      expiry_date:    normalizeExpiryDate(item.expiry_date),
    }))
  }

  if (parsed.totals) {
    const totals = parsed.totals
    parsed.totals = {
      net_amount:    numberOrNull(totals.net_amount),
      total_taxable: numberOrNull(totals.total_taxable),
      total_gst:     numberOrNull(totals.total_gst),
      round_off:     numberOrNull(totals.round_off),
      credit_note:   numberOrNull(totals.credit_note),
      other:         numberOrNull(totals.other),
    }
  }

  if (!parsed.vendor) parsed.vendor = { name: 'Unknown Vendor' }
  if (!parsed.vendor.name) parsed.vendor.name = 'Unknown Vendor'
  if (!parsed.invoice) parsed.invoice = {}
  if (!parsed.customer) parsed.customer = {}
  if (!Array.isArray(parsed.items)) parsed.items = []
  if (!parsed.totals) parsed.totals = {}
  if (!parsed._meta) parsed._meta = { confidence: 50, low_confidence_fields: [] }
  if (typeof parsed._meta.confidence !== 'number') {
    parsed._meta.confidence = 50
  }

  return parsed
}

async function repairJSONWithModel(apiKey, modelId, rawText) {
  const repairPrompt = `Convert the following malformed OCR JSON into valid strict JSON.

Rules:
- Return JSON only.
- Do not drop any fields if they can be preserved.
- Preserve the original structure: vendor, invoice, customer, items, totals, _meta.
- Fix commas, brackets, quotes, and array/object syntax only.
- If a field is unreadable, keep it as null.

Malformed JSON:
${rawText}`

  return callModel(apiKey, modelId, repairPrompt, [])
}

async function callModel(apiKey, modelId, prompt, imageParts) {
  const response = await fetch(`${API_BASE}/${modelId}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          ...imageParts,
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 16,
        topP: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildKeys() {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_BACKUP,
    ...(process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  ].filter(Boolean)

  return [...new Set(keys)]
}

async function parseWithFallback(apiKey, prompt, imageParts) {
  const errors = []

  // Two full passes through the model list — short pause between passes
  for (let pass = 0; pass < 2; pass += 1) {
    for (const model of MODELS) {
      try {
        const raw = await callModel(apiKey, model.id, prompt, imageParts)
        let parsed

        try {
          parsed = normaliseParsed(raw)
        } catch (parseError) {
          // OCR succeeded but the model emitted malformed JSON.
          // Ask the same model to repair the JSON before failing over.
          const repairRaw = await repairJSONWithModel(apiKey, model.id, extractJSON(raw))
          parsed = normaliseParsed(repairRaw)
        }

        return {
          parsed,
          status: `Extracted with ${model.id}`,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const status  = (typeof error === 'object' && error && 'status' in error) ? error.status : 0
        const lower = message.toLowerCase()
        const isAuthError = lower.includes('api key expired')
          || lower.includes('api_key_invalid')
          || lower.includes('invalid api key')
          || lower.includes('api key not valid')
          || lower.includes('api key is invalid')
        const isRateLimited = status === 429
          || message.includes('RESOURCE_EXHAUSTED')
          || lower.includes('quota exceeded')
          || lower.includes('quota')
          || lower.includes('rate limit')
        const isUnavailable = status === 404
          || lower.includes('not supported')
          || lower.includes('not found')
          || lower.includes('deprecated')

        errors.push(`${model.id}: ${message}`)

        if (isAuthError) {
          const authError = new Error(
            'Gemini API key is invalid or expired. Update `GEMINI_API_KEY` in your local `.env` and deployment environment.'
          )
          authError.status = 401
          throw authError
        }

        if (isRateLimited || isUnavailable) {
          // Brief pause before trying next model
          await sleep(800)
          continue
        }

        // Non-retryable error (network, auth, etc.) — propagate immediately
        throw new Error(message)
      }
    }

    if (pass === 0) {
      // Wait a bit before second pass to let rate limits reset
      await sleep(5000)
    }
  }

  // All models exhausted — surface a clear, actionable message
  console.error('[parse-bill] All models failed:', errors.join(' | '))
  throw new Error(
    'AI bill extraction is temporarily unavailable because the current Gemini project has no available quota for OCR requests. ' +
    'Enable billing or use another Gemini API key/project with generateContent quota.'
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const apiKeys = buildKeys()
  if (apiKeys.length === 0) {
    return json(res, 500, { error: 'Server is missing GEMINI_API_KEY' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

  // Support both single image (legacy) and multi-image array
  const { imageData, mimeType, images, fieldHint } = body

  let imageParts = []

  if (Array.isArray(images) && images.length > 0) {
    // Multi-image: up to 5 pages of a bill
    const validImages = images.slice(0, 5).filter(img => img.data && img.mimeType)
    if (validImages.length === 0) {
      return json(res, 400, { error: 'At least one valid image is required' })
    }
    imageParts = validImages.map(img => ({
      inline_data: { mime_type: img.mimeType, data: img.data },
    }))
  } else if (imageData && mimeType) {
    // Single image: backward-compatible
    imageParts = [{ inline_data: { mime_type: mimeType, data: imageData } }]
  } else {
    return json(res, 400, { error: 'imageData/mimeType or images array are required' })
  }

  const prompt = fieldHint
    ? `Extract only "${fieldHint}" from this pharmaceutical bill. Return minimal JSON only with no explanation.`
    : EXTRACTION_PROMPT

  try {
    let lastError = null

    for (const apiKey of apiKeys) {
      try {
        const result = await parseWithFallback(apiKey, prompt, imageParts)
        return json(res, 200, result)
      } catch (error) {
        lastError = error

        const message = error instanceof Error ? error.message : 'Secure bill parsing failed'
        const status = typeof error === 'object' && error && 'status' in error ? error.status : 0

        // Auth errors should stop immediately; backup keys won't help if they're all invalid
        if (status === 401 || message.includes('invalid or expired')) {
          return json(res, 401, { error: message })
        }
      }
    }

    throw lastError || new Error('Secure bill parsing failed')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Secure bill parsing failed'
    const status = typeof error === 'object' && error && 'status' in error ? error.status : 502
    return json(res, status || 502, { error: message })
  }
}

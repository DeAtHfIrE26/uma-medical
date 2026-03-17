import { apiRequest } from '@/lib/api'
import type { ParsedBill } from '@/types'

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

// ─── Single Bill Parse (backward-compatible) ─────────────────────────────────

export async function parseBillImage(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ParsedBill> {
  return parseMultipleBillImages([file], onProgress)
}

// ─── Multi-Image Bill Parse ───────────────────────────────────────────────────

export async function parseMultipleBillImages(
  files: File[],
  onProgress?: (msg: string) => void
): Promise<ParsedBill> {
  onProgress?.('Preparing images for secure AI extraction...')

  const encoded = await Promise.all(files.map(f => imageToBase64(f)))
  onProgress?.('Sending to Gemini AI for extraction...')

  const response = await apiRequest<{ parsed: ParsedBill; status?: string }>(
    '/api/parse-bill',
    {
      method: 'POST',
      body: JSON.stringify({
        images: encoded.map(e => ({ data: e.data, mimeType: e.mimeType })),
      }),
    }
  )

  if (response.status) {
    onProgress?.(response.status)
  }

  return response.parsed
}

// ─── Re-parse a Specific Field ────────────────────────────────────────────────

export async function reparseBillField(
  file: File,
  fieldHint: string
): Promise<Partial<ParsedBill>> {
  const { data: imageData, mimeType } = await imageToBase64(file)

  const response = await apiRequest<{ parsed: Partial<ParsedBill> }>(
    '/api/parse-bill',
    {
      method: 'POST',
      body: JSON.stringify({ imageData, mimeType, fieldHint }),
    }
  )

  return response.parsed
}

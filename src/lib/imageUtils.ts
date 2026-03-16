/**
 * Compresses an image file before sending to Gemini.
 * Smaller image = faster upload + faster AI processing.
 * Target: max 1200px on longest side, 85% quality JPEG.
 */
export async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const MAX_DIM = 1600   // px on longest side
    const QUALITY = 0.88   // JPEG quality

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const { width, height } = img
      const longestSide = Math.max(width, height)

      // No compression needed if already small
      if (longestSide <= MAX_DIM && file.size <= 800_000) {
        resolve(file)
        return
      }

      const scale = longestSide > MAX_DIM ? MAX_DIM / longestSide : 1
      const targetW = Math.round(width * scale)
      const targetH = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH

      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, targetW, targetH)

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          // Only use compressed if it's actually smaller
          resolve(compressed.size < file.size ? compressed : file)
        },
        'image/jpeg',
        QUALITY
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

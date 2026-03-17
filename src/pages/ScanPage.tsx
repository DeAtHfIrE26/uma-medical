import { TopBar } from '@/components/layout/TopBar'
import { compressImage } from '@/lib/imageUtils'
import { createBillFromParsed, updateBillImage, uploadBillImage } from '@/services/bills'
import { parseMultipleBillImages } from '@/services/gemini'
import { resolveActiveUserId } from '@/stores/auth'
import type { ParsedBill } from '@/types'
import { AnimatePresence, motion } from 'framer-motion'
import {
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    Camera,
    CheckCircle2,
    Image as ImageIcon,
    Images,
    Plus,
    Scan,
    Upload, X,
    Zap
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

type Stage = 'select' | 'preview' | 'parsing' | 'done' | 'error'
type StepStatus = 'pending' | 'active' | 'done' | 'skipped'

interface Step {
  label: string
  status: StepStatus
}

const MAX_FILES = 5

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

function buildSteps(fileCount: number): Step[] {
  return [
    { label: `Compressing ${fileCount > 1 ? `${fileCount} images` : 'image'}`, status: 'pending' },
    { label: 'AI extraction (Gemini)',  status: 'pending' },
    { label: 'Uploading image',         status: 'pending' },
    { label: 'Saving to database',      status: 'pending' },
  ]
}

export function ScanPage() {
  const navigate = useNavigate()
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage]           = useState<Stage>('select')
  const [files, setFiles]           = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [parsed, setParsed]         = useState<ParsedBill | null>(null)
  const [steps, setSteps]           = useState<Step[]>(buildSteps(1))
  const [errorMsg, setErrorMsg]     = useState('')
  const [dragOver, setDragOver]     = useState(false)
  const [elapsedMs, setElapsedMs]   = useState(0)
  const [aiStatus, setAiStatus]     = useState('')

  const setStep = useCallback((index: number, status: StepStatus, label?: string) => {
    setSteps(prev => prev.map((s, i) =>
      i === index ? { label: label ?? s.label, status } : s
    ))
  }, [])

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(f => {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name}: not an image file`)
        return false
      }
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`${f.name}: too large (max 15MB)`)
        return false
      }
      return true
    })

    if (valid.length === 0) return

    setFiles(prev => {
      const combined = [...prev, ...valid].slice(0, MAX_FILES)
      const urls = combined.map(f => URL.createObjectURL(f))
      setPreviewUrls(urls)
      return combined
    })
    setStage('preview')
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const next = prev.filter((_, i) => i !== index)
      setPreviewUrls(next.map(f => URL.createObjectURL(f)))
      if (next.length === 0) setStage('select')
      return next
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) addFiles(dropped)
  }, [addFiles])

  const processBill = async () => {
    if (files.length === 0) return

    let timer: ReturnType<typeof setInterval> | null = null
    const initialSteps = buildSteps(files.length)

    setStage('parsing')
    setSteps(initialSteps)
    setAiStatus('Checking secure session...')
    const startTime = Date.now()

    try {
      const userId = await withTimeout(resolveActiveUserId(), 3000, 'Authentication')
      if (!userId) throw new Error('Not authenticated. Please sign in again.')

      timer = setInterval(() => setElapsedMs(Date.now() - startTime), 200)

      // ── Step 1: Compress all files in parallel ──────────────────────────────
      setAiStatus('')
      setStep(0, 'active')
      const compressed = await withTimeout(
        Promise.all(files.map(f => compressImage(f))),
        30000,
        'Image compression'
      )
      setStep(0, 'done')

      // ── Step 2: AI Extraction (all pages in one call) ───────────────────────
      setStep(1, 'active')
      const parsedBill = await withTimeout(
        parseMultipleBillImages(compressed, (msg) => setAiStatus(msg)),
        120000,
        'AI extraction'
      )
      setStep(1, 'done')
      setParsed(parsedBill)

      // ── Step 3: Image Upload — fire-and-forget ──────────────────────────────
      setStep(2, 'active')
      const uploadAndPatch = (billId: string) => {
        uploadBillImage(compressed[0], userId)
          .then(url => {
            setStep(2, 'done')
            return updateBillImage(billId, url)
          })
          .catch(() => setStep(2, 'skipped'))
      }

      // ── Step 4: DB Save ─────────────────────────────────────────────────────
      const itemCount = parsedBill.items?.length ?? 0
      setStep(3, 'active', `Saving bill + ${itemCount} items`)

      const bill = await withTimeout(
        createBillFromParsed(parsedBill, null, userId),
        15000,
        'Database save'
      )
      setStep(3, 'done')

      uploadAndPatch(bill.id)

      clearInterval(timer)
      setElapsedMs(Date.now() - startTime)
      setStage('done')

      setTimeout(() => {
        navigate(`/bills/${bill.id}`, { state: { freshlyScanned: true } })
      }, 600)

    } catch (err) {
      if (timer) clearInterval(timer)
      const msg = err instanceof Error ? err.message : 'Processing failed'
      setErrorMsg(msg)
      setStage('error')
    } finally {
      if (timer) clearInterval(timer)
    }
  }

  const reset = () => {
    setStage('select')
    setFiles([])
    setPreviewUrls([])
    setParsed(null)
    setSteps(buildSteps(1))
    setErrorMsg('')
    setElapsedMs(0)
    setAiStatus('')
  }

  const confidence = parsed?._meta?.confidence
  const isLowConfidence = typeof confidence === 'number' && confidence < 75

  return (
    <div className="min-h-dvh bg-surface-900 flex flex-col mx-auto w-full max-w-lg">
      <TopBar
        title="Scan Bill"
        subtitle="Photograph or upload a pharmaceutical invoice"
        showBack
      />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
      />

      <div className="flex-1 px-4 pb-8">
        <AnimatePresence mode="wait">

          {/* ── Select ────────────────────────────────────────────────────── */}
          {stage === 'select' && (
            <motion.div key="select"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-3 pt-2"
            >
              {/* PRIMARY action — Camera (most common for pharmacy staff) */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full relative overflow-hidden rounded-3xl active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 60%, #06b6d4 100%)' }}
              >
                <div className="px-6 py-8 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center">
                    <Camera size={38} className="text-white" strokeWidth={1.8} />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-display font-bold text-xl">Take Photo</p>
                    <p className="text-blue-100/80 text-sm mt-1">Point camera at the bill</p>
                  </div>
                  {/* Subtle decorative ring */}
                  <div className="absolute inset-0 rounded-3xl border-2 border-white/10 pointer-events-none" />
                </div>
              </button>

              {/* SECONDARY actions — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="glass-card p-5 flex flex-col items-center gap-3 active:scale-[0.97] transition-transform text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-success-500/12 flex items-center justify-center">
                    <Upload size={22} className="text-success-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Gallery</p>
                    <p className="text-surface-400 text-xs mt-0.5">Up to {MAX_FILES} images</p>
                  </div>
                </button>

                {/* Drag & drop zone — also acts as visual cue on desktop */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`glass-card p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-all text-center
                    ${dragOver ? 'border-brand-400 bg-brand-500/10 scale-[0.97]' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
                    ${dragOver ? 'bg-brand-500/25' : 'bg-brand-500/12'}`}>
                    <Images size={22} className={dragOver ? 'text-brand-300' : 'text-brand-400'} />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">
                      {dragOver ? 'Drop here!' : 'Drop / Paste'}
                    </p>
                    <p className="text-surface-400 text-xs mt-0.5">Drag files here</p>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="glass-card p-4">
                <p className="text-brand-400 text-xs font-semibold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Zap size={11} /> Tips for best results
                </p>
                <ul className="space-y-2">
                  {[
                    { tip: 'Lay the bill flat, capture full page', icon: '📄' },
                    { tip: 'Good lighting — avoid shadows on text', icon: '💡' },
                    { tip: 'Multi-page bill? Select all pages at once', icon: '📑' },
                    { tip: 'Works with any pharma invoice format', icon: '✅' },
                  ].map(({ tip, icon }) => (
                    <li key={tip} className="text-surface-300 text-xs flex items-start gap-2.5">
                      <span className="text-sm leading-none mt-0.5">{icon}</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* ── Preview ───────────────────────────────────────────────────── */}
          {stage === 'preview' && files.length > 0 && (
            <motion.div key="preview"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-3 pt-2"
            >
              {/* Single image — large preview */}
              {files.length === 1 && (
                <div className="relative glass-card overflow-hidden rounded-2xl">
                  <img
                    src={previewUrls[0]}
                    alt="Bill preview"
                    className="w-full object-contain max-h-[55dvh]"
                  />
                  <button
                    onClick={() => removeFile(0)}
                    className="absolute top-3 right-3 w-8 h-8 bg-surface-900/80 backdrop-blur rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Remove image"
                  >
                    <X size={14} className="text-white" />
                  </button>
                  <div className="absolute bottom-3 left-3 bg-surface-900/70 backdrop-blur px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                    <ImageIcon size={12} className="text-surface-300" />
                    <span className="text-white text-xs font-medium">
                      {(files[0].size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              )}

              {/* Multiple images — grid */}
              {files.length > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  {previewUrls.map((url, i) => (
                    <div key={i} className="relative glass-card overflow-hidden rounded-2xl aspect-[3/4]">
                      <img
                        src={url}
                        alt={`Page ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute top-2 right-2 w-7 h-7 bg-surface-900/80 backdrop-blur rounded-full flex items-center justify-center"
                      >
                        <X size={12} className="text-white" />
                      </button>
                      <div className="absolute bottom-2 left-2 bg-surface-900/70 backdrop-blur px-2 py-0.5 rounded-lg">
                        <span className="text-white text-xs">Page {i + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add more pages button */}
              {files.length < MAX_FILES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-3.5 rounded-2xl border-2 border-dashed border-surface-600 hover:border-brand-500/50 flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                >
                  <Plus size={16} className="text-brand-400" />
                  <span className="text-brand-400 text-sm font-medium">
                    Add another page ({files.length}/{MAX_FILES})
                  </span>
                </button>
              )}

              {/* File info strip */}
              <div className="flex items-center gap-2 px-1">
                <ImageIcon size={13} className="text-surface-500 shrink-0" />
                <span className="text-surface-400 text-xs flex-1">
                  {files.length} {files.length === 1 ? 'image' : 'pages'} ready
                </span>
                <span className="text-surface-500 text-xs">
                  {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>

              {/* Primary CTA */}
              <button onClick={processBill} className="btn-primary w-full py-4 text-base">
                <Scan size={20} />
                Extract Bill Data
                {files.length > 1 && (
                  <span className="ml-1 px-2 py-0.5 bg-white/15 rounded-lg text-sm">
                    {files.length} pages
                  </span>
                )}
              </button>

              <button onClick={reset} className="btn-secondary w-full py-3 text-sm">
                <X size={15} /> Cancel
              </button>
            </motion.div>
          )}

          {/* ── Processing ────────────────────────────────────────────────── */}
          {stage === 'parsing' && (
            <motion.div key="parsing"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-6"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-3xl bg-brand-500/10 flex items-center justify-center">
                  <Scan size={36} className="text-brand-400 animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-3xl border-2 border-brand-500/20 animate-ping" />
              </div>

              <div className="text-center">
                <h3 className="font-display font-semibold text-xl text-white mb-1">Processing Bill</h3>
                {elapsedMs > 0 && (
                  <p className="text-surface-500 text-xs">{(elapsedMs / 1000).toFixed(1)}s elapsed</p>
                )}
              </div>

              <div className="glass-card w-full p-4 space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                      ${step.status === 'done'    ? 'bg-success-500' :
                        step.status === 'active'  ? 'bg-brand-500' :
                        step.status === 'skipped' ? 'bg-surface-600' :
                        'bg-surface-700'}`}>
                      {step.status === 'done'    ? <CheckCircle2 size={13} className="text-white" /> :
                       step.status === 'active'  ? <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" /> :
                       step.status === 'skipped' ? <span className="text-surface-400 text-xs">—</span> :
                       <span className="text-surface-500 text-xs">{i + 1}</span>}
                    </div>
                    <span className={`text-sm transition-colors flex-1 ${
                      step.status === 'done'    ? 'text-success-400' :
                      step.status === 'active'  ? 'text-white font-medium' :
                      step.status === 'skipped' ? 'text-surface-500 line-through' :
                      'text-surface-500'
                    }`}>
                      {step.label}
                      {step.status === 'active' && (
                        <span className="ml-1 inline-flex gap-0.5">
                          {[0, 1, 2].map(d => (
                            <span key={d} className="w-1 h-1 bg-brand-400 rounded-full animate-bounce"
                              style={{ animationDelay: `${d * 150}ms` }} />
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-surface-500 text-xs text-center px-4 min-h-[1.5rem]">
                {steps[1].status === 'active' && aiStatus
                  ? aiStatus.includes('rate limited') || aiStatus.includes('waiting')
                    ? `⏳ ${aiStatus}`
                    : aiStatus.includes('Success') || aiStatus.includes('Processed')
                    ? `✅ ${aiStatus}`
                    : `🤖 ${aiStatus}`
                  : steps[3].status === 'active'
                  ? 'Saving extracted data to database...'
                  : 'Powered by Gemini AI'
                }
              </p>
            </motion.div>
          )}

          {/* ── Done ──────────────────────────────────────────────────────── */}
          {stage === 'done' && parsed && (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-5 text-center"
            >
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
                className={`w-24 h-24 rounded-3xl flex items-center justify-center ${
                  isLowConfidence ? 'bg-warning-500/10' : 'bg-success-500/10'
                }`}
              >
                {isLowConfidence
                  ? <AlertTriangle size={44} className="text-warning-400" />
                  : <CheckCircle2 size={44} className="text-success-400" />
                }
              </motion.div>
              <div>
                <h3 className="font-display font-bold text-2xl text-white mb-1">
                  {isLowConfidence ? 'Review Required' : 'Bill Extracted!'}
                </h3>
                <p className="text-surface-400 text-sm">
                  {parsed.items.length} items · {parsed.vendor?.name || 'Unknown vendor'}
                </p>
                {typeof confidence === 'number' && (
                  <p className={`text-xs mt-1 ${isLowConfidence ? 'text-warning-400' : 'text-success-400'}`}>
                    AI confidence: {confidence}%
                    {isLowConfidence && ' — please verify the extracted data'}
                  </p>
                )}
                {elapsedMs > 0 && (
                  <p className="text-brand-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <Zap size={11} /> Done in {(elapsedMs / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
              <p className="text-surface-500 text-xs">Redirecting to bill details...</p>
            </motion.div>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {stage === 'error' && (
            <motion.div key="error"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-6 text-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-danger-500/10 flex items-center justify-center">
                <AlertCircle size={40} className="text-danger-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white mb-2">Extraction Failed</h3>
                <p className="text-surface-400 text-sm leading-relaxed max-w-xs">{errorMsg}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={processBill} className="btn-primary px-6 py-2.5 text-sm">
                  <Scan size={16} /> Retry
                </button>
                <button onClick={reset} className="btn-secondary px-6 py-2.5 text-sm">
                  New Image
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

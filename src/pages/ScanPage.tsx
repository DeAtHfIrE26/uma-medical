import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Upload, X, Scan, AlertCircle,
  CheckCircle2, ArrowRight, Image as ImageIcon, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import { parseBillImage } from '@/services/gemini'
import { uploadBillImage, createBillFromParsed, updateBillImage } from '@/services/bills'
import { compressImage } from '@/lib/imageUtils'
import { resolveActiveUserId } from '@/stores/auth'
import { TopBar } from '@/components/layout/TopBar'
import type { ParsedBill } from '@/types'

type Stage = 'select' | 'preview' | 'parsing' | 'done' | 'error'
type StepStatus = 'pending' | 'active' | 'done' | 'skipped'

interface Step {
  label: string
  status: StepStatus
}

const INITIAL_STEPS: Step[] = [
  { label: 'Compressing image',      status: 'pending' },
  { label: 'AI extraction (Gemini)', status: 'pending' },
  { label: 'Uploading image',        status: 'pending' },
  { label: 'Saving to database',     status: 'pending' },
]

// Hard timeout wrapper — prevents any single async op from hanging forever
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

export function ScanPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('select')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedBill | null>(null)
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [aiStatus, setAiStatus] = useState('')

  const setStep = useCallback((index: number, status: StepStatus, label?: string) => {
    setSteps(prev => prev.map((s, i) =>
      i === index ? { label: label ?? s.label, status } : s
    ))
  }, [])

  const handleFile = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WEBP)')
      return
    }
    if (selectedFile.size > 15 * 1024 * 1024) {
      toast.error('Image too large. Maximum size is 15MB.')
      return
    }
    setFile(selectedFile)
    setPreviewUrl(URL.createObjectURL(selectedFile))
    setStage('preview')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const processBill = async () => {
    if (!file) return

    let timer: ReturnType<typeof setInterval> | null = null

    setStage('parsing')
    setSteps(INITIAL_STEPS.map(s => ({ ...s })))
    setAiStatus('Checking secure session...')
    const startTime = Date.now()

    try {
      const userId = await withTimeout(resolveActiveUserId(), 3000, 'Authentication')
      if (!userId) throw new Error('Not authenticated. Please sign in again.')

      timer = setInterval(() => setElapsedMs(Date.now() - startTime), 200)

      // ── Step 1: Compress ────────────────────────────────────────────────────
      setAiStatus('')
      setStep(0, 'active')
      const compressed = await withTimeout(compressImage(file), 15000, 'Image compression')
      setStep(0, 'done')

      // ── Step 2: AI Extraction ───────────────────────────────────────────────
      setStep(1, 'active')
      const parsedBill = await withTimeout(
        parseBillImage(compressed, (msg) => setAiStatus(msg)),
        120000,
        'AI extraction'
      )
      setStep(1, 'done')
      setParsed(parsedBill)

      // ── Step 3: Image Upload — FULLY fire-and-forget ────────────────────────
      setStep(2, 'active')
      const uploadAndPatch = (billId: string) => {
        uploadBillImage(compressed, userId)
          .then(url => {
            setStep(2, 'done')
            return updateBillImage(billId, url)
          })
          .catch(() => setStep(2, 'skipped'))
      }

      // ── Step 4: DB Save — fires immediately, never waits for upload ─────────
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

      // Navigate after brief success flash
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
    setFile(null)
    setPreviewUrl(null)
    setParsed(null)
    setSteps(INITIAL_STEPS.map(s => ({ ...s })))
    setErrorMsg('')
    setElapsedMs(0)
    setAiStatus('')
  }

  return (
    <div className="min-h-dvh bg-surface-900 flex flex-col">
      <TopBar
        title="Scan Bill"
        subtitle="Upload or photograph a pharmaceutical bill"
        showBack
      />

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      <div className="flex-1 px-4 pb-6">
        <AnimatePresence mode="wait">

          {/* ── Select ──────────────────────────────────────────────────────── */}
          {stage === 'select' && (
            <motion.div key="select"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer
                  ${dragOver ? 'border-brand-400 bg-brand-500/10' : 'border-surface-600 bg-surface-800/30 hover:border-surface-500'}`}
              >
                <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                  <ImageIcon size={28} className="text-brand-400" />
                </div>
                <div className="text-center">
                  <p className="text-white font-medium">Drop bill image here</p>
                  <p className="text-surface-400 text-sm mt-1">or tap to browse gallery</p>
                  <p className="text-surface-500 text-xs mt-1">JPG, PNG, WEBP · Max 15MB</p>
                </div>
              </div>

              <button onClick={() => cameraInputRef.current?.click()}
                className="w-full glass-card p-5 flex items-center gap-4 active:scale-[0.99] transition-transform">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <Camera size={22} className="text-cyan-400" />
                </div>
                <div className="text-left">
                  <p className="text-white font-medium">Take Photo</p>
                  <p className="text-surface-400 text-sm">Use your camera to scan a bill</p>
                </div>
                <ArrowRight size={18} className="text-surface-500 ml-auto" />
              </button>

              <button onClick={() => fileInputRef.current?.click()}
                className="w-full glass-card p-5 flex items-center gap-4 active:scale-[0.99] transition-transform">
                <div className="w-12 h-12 rounded-2xl bg-success-500/10 flex items-center justify-center shrink-0">
                  <Upload size={22} className="text-success-400" />
                </div>
                <div className="text-left">
                  <p className="text-white font-medium">Upload from Gallery</p>
                  <p className="text-surface-400 text-sm">Select an existing photo</p>
                </div>
                <ArrowRight size={18} className="text-surface-500 ml-auto" />
              </button>

              <div className="glass-card p-4">
                <p className="text-brand-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap size={11} /> Tips for best results
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Ensure the full bill is visible in frame',
                    'Good lighting, avoid shadows on text',
                    'Hold camera steady — avoid blur',
                    'Works with any pharmaceutical bill format',
                  ].map(tip => (
                    <li key={tip} className="text-surface-300 text-xs flex items-start gap-2">
                      <CheckCircle2 size={12} className="text-success-400 mt-0.5 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* ── Preview ─────────────────────────────────────────────────────── */}
          {stage === 'preview' && file && (
            <motion.div key="preview"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="glass-card overflow-hidden rounded-2xl">
                <img src={previewUrl!} alt="Bill preview" className="w-full object-contain max-h-[50dvh]" />
              </div>
              <div className="glass-card p-4 flex items-center gap-3">
                <ImageIcon size={16} className="text-surface-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{file.name}</p>
                  <p className="text-surface-400 text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={reset} className="text-surface-400 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>
              <button onClick={processBill} className="btn-primary w-full py-4 text-base">
                <Scan size={20} /> Extract Bill Data
              </button>
              <button onClick={reset} className="btn-secondary w-full py-3">
                Choose Different Image
              </button>
            </motion.div>
          )}

          {/* ── Processing ──────────────────────────────────────────────────── */}
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
                      {step.status === 'done' ? (
                        <CheckCircle2 size={13} className="text-white" />
                      ) : step.status === 'active' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                      ) : step.status === 'skipped' ? (
                        <span className="text-surface-400 text-xs">—</span>
                      ) : (
                        <span className="text-surface-500 text-xs">{i + 1}</span>
                      )}
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
                    : aiStatus.includes('Success')
                    ? `✅ ${aiStatus}`
                    : `🤖 ${aiStatus}`
                  : steps[3].status === 'active'
                  ? 'Saving extracted data to database...'
                  : 'Powered by Gemini AI'
                }
              </p>
            </motion.div>
          )}

          {/* ── Done ────────────────────────────────────────────────────────── */}
          {stage === 'done' && parsed && (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-5 text-center"
            >
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
                className="w-24 h-24 rounded-3xl bg-success-500/10 flex items-center justify-center"
              >
                <CheckCircle2 size={44} className="text-success-400" />
              </motion.div>
              <div>
                <h3 className="font-display font-bold text-2xl text-white mb-1">Bill Extracted!</h3>
                <p className="text-surface-400 text-sm">
                  {parsed.items.length} items · {parsed.vendor?.name || 'Unknown vendor'}
                </p>
                {elapsedMs > 0 && (
                  <p className="text-brand-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <Zap size={11} /> Done in {(elapsedMs / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
              <p className="text-surface-500 text-xs">Redirecting to bill details...</p>
            </motion.div>
          )}

          {/* ── Error ───────────────────────────────────────────────────────── */}
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

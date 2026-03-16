import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { updatePassword } from '@/services/auth'

const schema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  const validation = useMemo(
    () => schema.safeParse({ password, confirmPassword }),
    [password, confirmPassword]
  )

  const fieldErrors = validation.success ? {} : validation.error.flatten().fieldErrors

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validation.success) {
      const firstError = Object.values(fieldErrors).flat()[0]
      if (firstError) toast.error(firstError)
      return
    }

    setLoading(true)
    try {
      await updatePassword(password)
      setCompleted(true)
      toast.success('Password updated successfully')
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-surface-900 flex flex-col justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm mx-auto"
      >
        <Link to="/login" className="inline-flex items-center gap-2 text-surface-400 hover:text-white text-sm mb-8 transition-colors">
          <ArrowLeft size={16} /> Back to login
        </Link>

        {completed ? (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-success-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} className="text-success-400" />
            </div>
            <h1 className="font-display font-bold text-2xl text-white">Password updated</h1>
            <p className="text-surface-400 text-sm">
              Your password has been changed. Redirecting you to sign in.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="font-display font-bold text-2xl text-white mb-2">Set New Password</h1>
              <p className="text-surface-400 text-sm">
                Choose a strong password for your Uma Medical account.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-surface-300 text-sm font-medium mb-1.5">New Password</label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="input-base pl-10"
                    placeholder="Min 8 chars, uppercase + number"
                    autoComplete="new-password"
                  />
                </div>
                {fieldErrors.password?.[0] && (
                  <p className="text-danger-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> {fieldErrors.password[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-surface-300 text-sm font-medium mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="input-base"
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />
                {fieldErrors.confirmPassword?.[0] && (
                  <p className="text-danger-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> {fieldErrors.confirmPassword[0]}
                  </p>
                )}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  )
}

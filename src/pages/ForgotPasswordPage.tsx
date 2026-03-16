import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { resetPassword } from '@/services/auth'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})
type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await resetPassword(data.email)
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset email')
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

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-success-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} className="text-success-400" />
            </div>
            <h1 className="font-display font-bold text-2xl text-white">Check your email</h1>
            <p className="text-surface-400 text-sm leading-relaxed">
              We sent a password reset link to <span className="text-white">{getValues('email')}</span>
            </p>
            <Link to="/login" className="btn-primary w-full mt-4 py-3">Back to Login</Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="font-display font-bold text-2xl text-white mb-2">Reset Password</h1>
              <p className="text-surface-400 text-sm">Enter your email and we'll send a reset link</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-surface-300 text-sm font-medium mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    {...register('email')}
                    type="email"
                    className="input-base pl-10"
                    placeholder="your@email.com"
                  />
                </div>
                {errors.email && (
                  <p className="text-danger-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.email.message}
                  </p>
                )}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  )
}

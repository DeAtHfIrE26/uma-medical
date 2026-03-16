import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, UserPlus, Pill, AlertCircle, KeyRound } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { signUp } from '@/services/auth'

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
  inviteCode: z.string().min(6, 'Enter the invite code'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await signUp(data.email, data.password, data.fullName, data.inviteCode)
      toast.success('Account created! Please check your email to verify.')
      navigate('/login')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-surface-900 flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/8 rounded-full blur-3xl -translate-y-1/2" />
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 py-10 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm mx-auto"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center mb-4 glow-brand">
              <Pill size={28} className="text-white" strokeWidth={1.5} />
            </div>
            <h1 className="font-display font-bold text-2xl text-white">Create Account</h1>
            <p className="text-surface-400 text-sm mt-1">Admin registration · Invite required</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            {/* Full Name */}
            <div>
              <label className="block text-surface-300 text-sm font-medium mb-1.5">Full Name</label>
              <input {...register('fullName')} type="text" className="input-base" placeholder="Your name" />
              {errors.fullName && <p className="text-danger-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.fullName.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-surface-300 text-sm font-medium mb-1.5">Email</label>
              <input {...register('email')} type="email" className="input-base" placeholder="you@example.com" />
              {errors.email && <p className="text-danger-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-surface-300 text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <input {...register('password')} type={showPassword ? 'text' : 'password'} className="input-base pr-12" placeholder="Min 8 chars, uppercase + number" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 p-1">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-danger-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.password.message}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-surface-300 text-sm font-medium mb-1.5">Confirm Password</label>
              <input {...register('confirmPassword')} type={showPassword ? 'text' : 'password'} className="input-base" placeholder="Re-enter password" />
              {errors.confirmPassword && <p className="text-danger-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.confirmPassword.message}</p>}
            </div>

            {/* Invite Code */}
            <div>
              <label className="block text-surface-300 text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <KeyRound size={13} /> Invite Code
              </label>
              <input
                {...register('inviteCode')}
                type="text"
                className="input-base uppercase tracking-widest font-mono"
                placeholder="XXXXXXXX"
                maxLength={10}
              />
              {errors.inviteCode && <p className="text-danger-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.inviteCode.message}</p>}
              <p className="text-surface-500 text-xs mt-1">Get this from an existing admin</p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 mt-1 text-base">
              {loading
                ? <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                : <><UserPlus size={18} /> Create Account</>
              }
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-surface-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-brand-400 font-medium hover:text-brand-300 transition-colors">Sign in</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

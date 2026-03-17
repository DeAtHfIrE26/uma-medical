import { useNavigate, useLocation } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { motion } from 'framer-motion'

const HIDDEN_PATHS = ['/scan', '/login', '/register', '/forgot-password', '/reset-password']

export function ScanFab() {
  const navigate = useNavigate()
  const location = useLocation()

  if (HIDDEN_PATHS.some(p => location.pathname.startsWith(p))) return null

  return (
    <div
      className="lg:hidden fixed z-50"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom) + 8px)',
        right: '16px',
      }}
    >
      <motion.button
        whileTap={{ scale: 0.88 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => navigate('/scan')}
        className="w-14 h-14 bg-brand-500 hover:bg-brand-600 rounded-full
                   flex items-center justify-center transition-colors"
        style={{
          boxShadow: '0 0 0 4px #0f172a, 0 10px 28px rgba(14,165,233,0.45)',
        }}
        aria-label="Scan a bill"
      >
        <Camera size={24} className="text-white" strokeWidth={2} />
      </motion.button>
    </div>
  )
}

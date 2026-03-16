import { useNavigate } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { motion } from 'framer-motion'

export function ScanFab() {
  const navigate = useNavigate()

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => navigate('/scan')}
        className="relative w-14 h-14 bg-brand-500 hover:bg-brand-600 rounded-2xl shadow-lg glow-brand flex items-center justify-center transition-colors"
        style={{ boxShadow: '0 4px 20px rgba(14,165,233,0.4), 0 0 0 4px rgba(14,165,233,0.1)' }}
      >
        <Camera size={22} className="text-white" strokeWidth={2} />
      </motion.button>
    </div>
  )
}

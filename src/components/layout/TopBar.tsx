import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface TopBarProps {
  title: string
  subtitle?: string
  showBack?: boolean
  rightAction?: React.ReactNode
  className?: string
}

export function TopBar({ title, subtitle, showBack = false, rightAction, className = '' }: TopBarProps) {
  const navigate = useNavigate()

  return (
    <div
      className={`sticky top-0 z-30 bg-surface-900/90 backdrop-blur-xl border-b border-surface-700/30
                  flex items-center gap-3 px-4 lg:px-8 pb-3 ${className}`}
      style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}
    >
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800
                     hover:bg-surface-700 active:bg-surface-600 transition-colors shrink-0
                     active:scale-95"
          aria-label="Go back"
        >
          <ChevronLeft size={20} className="text-surface-300" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display font-bold text-xl lg:text-2xl text-white leading-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-surface-400 text-xs mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {rightAction && <div className="shrink-0">{rightAction}</div>}
    </div>
  )
}

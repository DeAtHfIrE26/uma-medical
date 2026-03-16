import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

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
    <div className={`flex items-center gap-3 px-4 pt-safe-top pb-4 pt-5 ${className}`}>
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors shrink-0"
        >
          <ChevronLeft size={20} className="text-surface-300" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display font-bold text-xl text-white leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-surface-400 text-xs mt-0.5 truncate">{subtitle}</p>}
      </div>
      {rightAction && <div className="shrink-0">{rightAction}</div>}
    </div>
  )
}

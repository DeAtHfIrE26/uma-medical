import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-700/50 flex items-center justify-center mb-4">
        <Icon size={28} className="text-surface-500" />
      </div>
      <h3 className="font-display font-semibold text-surface-300 text-base mb-1">{title}</h3>
      {description && (
        <p className="text-surface-500 text-sm leading-relaxed max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

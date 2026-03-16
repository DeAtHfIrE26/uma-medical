interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
  size?: 'sm' | 'md'
  className?: string
}

const variants = {
  default: 'bg-surface-700 text-surface-300',
  success: 'bg-success-500/15 text-success-400 border border-success-500/20',
  warning: 'bg-warning-500/15 text-warning-400 border border-warning-500/20',
  danger: 'bg-danger-500/15 text-danger-400 border border-danger-500/20',
  info: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
  brand: 'bg-brand-500/15 text-brand-400 border border-brand-500/20',
}

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
}

export function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  return (
    <span className={`badge ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  )
}

export function PaymentModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <Badge variant="default">Unknown</Badge>
  const upper = mode.toUpperCase()
  if (upper === 'CREDIT') return <Badge variant="warning">Credit</Badge>
  if (upper === 'CASH') return <Badge variant="success">Cash</Badge>
  if (upper === 'CHEQUE') return <Badge variant="info">Cheque</Badge>
  return <Badge variant="default">{mode}</Badge>
}

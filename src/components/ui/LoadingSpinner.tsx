interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-3',
}

export function LoadingSpinner({ size = 'md', className = '' }: Props) {
  return (
    <div
      className={`${sizes[size]} rounded-full border-brand-500/20 border-t-brand-500 animate-spin ${className}`}
    />
  )
}

export function FullPageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center z-50 gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-brand-500/10 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
      <p className="text-surface-400 text-sm animate-pulse">{message}</p>
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="shimmer h-4 w-3/4 rounded-lg" />
      <div className="shimmer h-3 w-1/2 rounded-lg" />
      <div className="shimmer h-3 w-2/3 rounded-lg" />
    </div>
  )
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

'use client'

/**
 * Skeleton reutilizável para estados de loading de páginas.
 * Reduz perceived latency e evita layout shift.
 */

type SkeletonProps = {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`rounded-md ${className}`}
      style={{
        background: 'linear-gradient(90deg, hsl(220 13% 18%) 0%, hsl(220 13% 22%) 50%, hsl(220 13% 18%) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <style jsx>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Hero header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Main content */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton({ height = 200 }: { height?: number }) {
  return <Skeleton className="rounded-2xl" style={{ height }} />
}

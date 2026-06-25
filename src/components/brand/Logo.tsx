import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/brand'

/**
 * Marca Garciat — glifo "G" efervescente desenhado em SVG inline (sem assets
 * externos). O anel aberto evoca um copo/bolha; os pontos, a carbonatação.
 */
export function GarciatMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={`${BRAND.name} logo`}
      className={className}
    >
      <defs>
        <linearGradient id="garciat-mark" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1FCB87" />
          <stop offset="1" stopColor="#17AE73" />
        </linearGradient>
      </defs>
      {/* Anel aberto formando o "G" */}
      <path
        d="M22.5 9.5a9 9 0 1 0 2.2 8.2H16"
        stroke="url(#garciat-mark)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bolhas de efervescência */}
      <circle cx="25.5" cy="7.5" r="1.6" fill="#E3B45E" />
      <circle cx="28.3" cy="12.2" r="1" fill="#1FCB87" />
    </svg>
  )
}

/**
 * Wordmark completo: glifo + nome do produto. Tamanhos pré-definidos para uso
 * no shell (sm) ou em telas de destaque (md/lg).
 */
export function GarciatWordmark({
  className,
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const mark = size === 'sm' ? 'size-7' : size === 'lg' ? 'size-10' : 'size-8'
  const text = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl'
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <GarciatMark className={mark} />
      <span className={cn('brand-wordmark leading-none', text)}>{BRAND.name}</span>
    </span>
  )
}

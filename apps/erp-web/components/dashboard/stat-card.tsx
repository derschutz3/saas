'use client'

import { memo, useMemo, type CSSProperties } from 'react'

export type KpiData = {
  label: string
  value: string
  sub: string
  delta: { label: string; dir: 'up' | 'down' }
  badge: { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' }
  sparkData: number[]
}

type StatCardProps = {
  data: KpiData
  index: number
}

// Cores hoisted para o escopo de módulo (criado 1x em vez de 1x por render)
const TONE_COLORS = {
  green: { primary: 'hsl(142 71% 45%)', secondary: 'hsl(142 71% 45% / 0.15)' },
  yellow: { primary: 'hsl(38 92% 50%)', secondary: 'hsl(38 92% 50% / 0.15)' },
  red: { primary: 'hsl(0 86% 65%)', secondary: 'hsl(0 86% 65% / 0.15)' },
  blue: { primary: 'hsl(217 91% 67%)', secondary: 'hsl(217 91% 67% / 0.15)' },
} as const

// Style base cacheado por cor — evita recriar o objeto a cada render
const TONE_DELTA_STYLES: Record<'up' | 'down', CSSProperties> = {
  up: { background: 'hsl(142 71% 45% / 0.12)', color: 'hsl(142 71% 55%)' },
  down: { background: 'hsl(0 86% 65% / 0.12)', color: 'hsl(0 86% 70%)' },
}

function StatCardImpl({ data, index }: StatCardProps) {
  const toneColors = TONE_COLORS[data.badge.tone]

  // useMemo com dependência primitiva: o array de sparkline é estável
  const sparkline = useMemo(() => {
    const arr = data.sparkData
    let max = arr[0] ?? 1
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > max) max = arr[i]
    }
    return arr.map((v) => ({ pct: Math.round((v / max) * 100) }))
  }, [data.sparkData])

  const containerStyle = useMemo<CSSProperties>(
    () => ({
      background: 'linear-gradient(145deg, hsl(222 47% 10%) 0%, hsl(222 47% 8%) 100%)',
      border: '1px solid hsl(220 13% 91% / 0.08)',
      boxShadow: '0 2px 0 rgba(255,255,255,0.02), 0 0 0 1px hsl(220 13% 91% / 0.05)',
      transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
      animationDelay: `${index * 100}ms`,
      contentVisibility: 'auto',
      containIntrinsicSize: '260px 220px',
    }),
    [index]
  )

  const glowStyle = useMemo<CSSProperties>(
    () => ({
      background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${toneColors.secondary} 0%, transparent 60%)`,
    }),
    [toneColors.secondary]
  )

  const borderGradientStyle = useMemo<CSSProperties>(
    () => ({
      padding: '1px',
      background: `linear-gradient(135deg, ${toneColors.primary}40, transparent, ${toneColors.primary}20)`,
      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      WebkitMaskComposite: 'xor',
      maskComposite: 'exclude',
    }),
    [toneColors.primary]
  )

  const iconDecoStyle = useMemo<CSSProperties>(
    () => ({ background: `linear-gradient(135deg, ${toneColors.primary}40, ${toneColors.primary}10)` }),
    [toneColors.primary]
  )

  const topLineStyle = useMemo<CSSProperties>(
    () => ({ background: `linear-gradient(90deg, transparent, ${toneColors.primary}80, transparent)` }),
    [toneColors.primary]
  )

  const badgeStyle = useMemo<CSSProperties>(
    () => ({
      background: toneColors.secondary,
      color: toneColors.primary,
      border: `1px solid ${toneColors.primary}30`,
    }),
    [toneColors]
  )

  const indicatorStyle = useMemo<CSSProperties>(
    () => ({
      background: toneColors.secondary,
      border: `1px solid ${toneColors.primary}30`,
    }),
    [toneColors]
  )

  const dotStyle = useMemo<CSSProperties>(
    () => ({
      background: toneColors.primary,
      boxShadow: `0 0 8px ${toneColors.primary}`,
    }),
    [toneColors.primary]
  )

  const shimmerStyle = useMemo<CSSProperties>(
    () => ({
      background: `linear-gradient(135deg, transparent 30%, ${toneColors.primary}08 50%, transparent 70%)`,
      transform: 'translateX(-100%)',
      animation: 'shimmer 3s ease-in-out infinite',
    }),
    [toneColors.primary]
  )

  return (
    <div className="group relative overflow-hidden rounded-3xl p-6 cursor-pointer" style={containerStyle}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={glowStyle} />
      <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={borderGradientStyle} />
      <div className="absolute top-4 right-4 w-14 h-14 rounded-2xl opacity-20 group-hover:opacity-30 transition-all duration-500 transform group-hover:scale-110 group-hover:rotate-6" style={iconDecoStyle} />
      <div className="absolute top-0 left-0 right-0 h-1 opacity-0 group-hover:opacity-100 transition-all duration-500" style={topLineStyle} />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300"
              style={indicatorStyle}
            >
              <div className="w-2 h-2 rounded-full animate-pulse" style={dotStyle} />
            </div>
            <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-200 transition-colors duration-300">
              {data.label}
            </span>
          </div>

          <span
            className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all duration-300 group-hover:scale-105"
            style={badgeStyle}
          >
            {data.badge.label}
          </span>
        </div>

        <div className="mb-2">
          <div
            className="text-4xl font-black tracking-tighter leading-none mb-1 transition-all duration-300 group-hover:translate-x-1"
            style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', color: 'hsl(214 32% 97%)' }}
          >
            {data.value}
          </div>
          <div className="text-xs text-slate-600 group-hover:text-slate-500 transition-colors duration-300">
            {data.sub}
          </div>
        </div>

        <div className="flex items-end justify-between mt-5">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 group-hover:scale-105"
            style={TONE_DELTA_STYLES[data.delta.dir]}
          >
            <span>{data.delta.dir === 'up' ? '↑' : '↓'}</span>
            <span>{data.delta.label}</span>
          </div>

          <div className="flex items-end gap-1 h-12 w-24">
            {sparkline.map((item, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all duration-500 will-change-transform"
                style={{
                  height: `${Math.max(item.pct, 10)}%`,
                  background: `linear-gradient(to top, ${toneColors.primary}80, ${toneColors.primary}30)`,
                  transitionDelay: `${i * 50}ms`,
                  transformOrigin: 'bottom',
                  animation: 'growUp 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  animationDelay: `${i * 80 + index * 100}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-700 pointer-events-none" style={shimmerStyle} />
    </div>
  )
}

// React.memo com comparator customizado — só re-renderiza se a data mudar de fato
export const StatCard = memo(StatCardImpl, (prev, next) => {
  return (
    prev.data.label === next.data.label &&
    prev.data.value === next.data.value &&
    prev.data.sub === next.data.sub &&
    prev.data.badge.label === next.data.badge.label &&
    prev.data.badge.tone === next.data.badge.tone &&
    prev.data.delta.label === next.data.delta.label &&
    prev.data.delta.dir === next.data.delta.dir &&
    prev.data.sparkData === next.data.sparkData &&
    prev.index === next.index
  )
})

StatCard.displayName = 'StatCard'

// Grid em componente separado — evita re-render do grid quando um card individual muda
export function StatCardGrid({ kpis }: { kpis: KpiData[] }) {
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
    >
      {kpis.map((kpi, i) => (
        <StatCard key={`${kpi.label}-${i}`} data={kpi} index={i} />
      ))}
    </div>
  )
}

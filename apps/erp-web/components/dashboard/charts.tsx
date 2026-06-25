'use client'

import { memo, useEffect, useState, useId, type CSSProperties } from 'react'

/* ============================================================
   CHART COMPONENTS — SVG custom, animado, dark/light luxe.
   Sem dependência de libs. Animações via stroke-dasharray /
   requestAnimationFrame.

   Todas as cores usam `hsl(var(--X))` para que o tema dark/light
   se aplique automaticamente.
   ============================================================ */

// Cores via CSS variables — funcionam em dark e light
const C = {
  accent:  'hsl(var(--accent))',
  gold:    'hsl(var(--gold))',
  crimson: 'hsl(var(--crimson))',
  emerald: 'hsl(var(--emerald))',
  line:    'hsl(var(--line))',
  paper:   'hsl(var(--paper))',
  paper3:  'hsl(var(--paper-3))',
}

// Hook simples para animar contagem numérica
function useCountUp(target: number, duration = 1200, decimals = 0) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return Number(value.toFixed(decimals))
}

/* ============================================================
   AREA CHART — receita ao longo do tempo
   ============================================================ */
export const AreaChart = memo(function AreaChart({
  data,
  height = 180,
  gradient = true,
}: {
  data: number[]
  height?: number
  gradient?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 100
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - ((v - min) / range) * (height - 8) - 4
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)},${y.toFixed(2)}` : `L ${x.toFixed(2)},${y.toFixed(2)}`))
    .join(' ')

  const areaPath = `${linePath} L ${w},${height} L 0,${height} Z`

  const lastPoint = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Gráfico de área"
    >
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      <g className="chart-grid">
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1="0" x2={w} y1={height * y} y2={height * y} />
        ))}
      </g>

      {/* Area */}
      {gradient && <path d={areaPath} fill={`url(#grad-${id})`} className="anim-fade-in" />}

      {/* Line */}
      <path
        d={linePath}
        className="chart-line"
        style={{
          strokeDasharray: 1000,
          strokeDashoffset: 1000,
          animation: 'drawLine 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      />

      {/* Last point pulse */}
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3" fill="hsl(var(--accent-2))" className="anim-glow" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="6" fill="none" stroke={C.accent} strokeWidth="1" opacity="0.4" />
    </svg>
  )
})

/* ============================================================
   BAR CHART — comparação
   ============================================================ */
export const BarChart = memo(function BarChart({
  data,
  height = 140,
}: {
  data: { label: string; value: number; color?: 'accent' | 'gold' | 'crimson' | 'emerald' }[]
  height?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const barWidth = 100 / data.length
  const colorMap = {
    accent: C.accent,
    gold: C.gold,
    crimson: C.crimson,
    emerald: C.emerald,
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Gráfico de barras"
      >
        <g className="chart-grid">
          {[0.25, 0.5, 0.75].map((y) => (
            <line key={y} x1="0" x2="100" y1={height * y} y2={height * y} />
          ))}
        </g>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 20)
          const x = i * barWidth + barWidth * 0.18
          const y = height - h - 2
          const w = barWidth * 0.64
          return (
            <g key={i}>
              <rect
                x={x}
                y={height - 2}
                width={w}
                height={0}
                fill={colorMap[d.color ?? 'accent']}
                opacity="0.15"
              >
                <animate
                  attributeName="height"
                  from="0"
                  to={h}
                  dur="0.9s"
                  begin={`${i * 80}ms`}
                  fill="freeze"
                />
                <animate
                  attributeName="y"
                  from={height - 2}
                  to={y}
                  dur="0.9s"
                  begin={`${i * 80}ms`}
                  fill="freeze"
                />
              </rect>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={colorMap[d.color ?? 'accent']}
                rx="0.4"
                data-tip={d.label + ': ' + d.value}
              />
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex" style={{ width: '100%' }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="text-center font-mono text-[9px] text-paper-3 tracking-wider uppercase"
            style={{ width: `${100 / data.length}%` }}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
})

/* ============================================================
   DONUT — distribuição
   ============================================================ */
export const DonutChart = memo(function DonutChart({
  segments,
  size = 180,
  thickness = 14,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: 'accent' | 'gold' | 'crimson' | 'emerald' }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const r = size / 2 - thickness / 2
  const c = 2 * Math.PI * r
  const colorMap = {
    accent: C.accent,
    gold: C.gold,
    crimson: C.crimson,
    emerald: C.emerald,
  }

  let offset = 0
  return (
    <div className="relative flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="anim-fade-in">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={C.line}
          strokeWidth={thickness}
        />
        {segments.map((s, i) => {
          const dash = (s.value / total) * c
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={colorMap[s.color]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{
                transition: 'stroke-dasharray 800ms cubic-bezier(0.22, 1, 0.36, 1)',
                transitionDelay: `${i * 120}ms`,
              }}
            />
          )
          offset += dash
          return el
        })}
        {centerValue && (
          <text
            x="50%"
            y="50%"
            dy="-0.2em"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={C.paper}
            fontFamily="serif"
            fontSize="22"
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x="50%"
            y="50%"
            dy="1.2em"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={C.paper3}
            fontFamily="monospace"
            fontSize="8"
            style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="flex flex-col gap-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span
              className="size-2 rounded-full"
              style={{ background: colorMap[s.color], boxShadow: `0 0 8px ${colorMap[s.color]}` }}
            />
            <span className="font-mono text-[10px] tracking-wider uppercase text-paper-3">{s.label}</span>
            <span className="font-display text-sm text-paper tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

/* ============================================================
   SPARKLINE — mini linha
   ============================================================ */
export const Sparkline = memo(function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'accent',
}: {
  data: number[]
  width?: number
  height?: number
  color?: 'accent' | 'gold' | 'emerald' | 'crimson'
}) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  const stroke = color === 'accent' ? C.accent : color === 'gold' ? C.gold : color === 'emerald' ? C.emerald : C.crimson
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: width * 2,
          strokeDashoffset: width * 2,
          animation: 'drawLine 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      />
    </svg>
  )
})

/* ============================================================
   RADIAL / GAUGE — progresso circular
   ============================================================ */
export const GaugeChart = memo(function GaugeChart({
  value,
  max = 100,
  label,
  size = 120,
  thickness = 10,
}: {
  value: number
  max?: number
  label?: string
  size?: number
  thickness?: number
}) {
  const r = size / 2 - thickness / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  const display = useCountUp(value, 1400)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={C.line}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={C.accent}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl text-paper tabular-nums">{display}</span>
        {label && <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-paper-3 mt-0.5">{label}</span>}
      </div>
    </div>
  )
})

/* ============================================================
   HEATMAP — vendas por dia da semana x hora
   ============================================================ */
export const Heatmap = memo(function Heatmap({
  rows,
  cols,
  data,
}: {
  rows: string[]
  cols: string[]
  data: number[][]
}) {
  const max = Math.max(...data.flat(), 1)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1 pl-12">
        {cols.map((c) => (
          <div key={c} className="flex-1 text-center font-mono text-[8px] text-paper-3 tracking-wider uppercase">{c}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r} className="flex gap-1 items-center">
          <div className="w-12 font-mono text-[9px] text-paper-3 tracking-wider uppercase pr-1 text-right">{r}</div>
          {data[i].map((v, j) => {
            const intensity = v / max
            const alpha = 0.1 + intensity * 0.85
            return (
              <div
                key={`${i}-${j}`}
                className="flex-1 aspect-[1.6] rounded-sm cursor-pointer transition-transform duration-200 hover:scale-110"
                style={{
                  backgroundColor: C.accent,
                  opacity: alpha,
                  boxShadow: intensity > 0.7 ? `0 0 8px ${C.accent}` : 'none',
                }}
                data-tip={`${r} ${cols[j]}: ${v}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
})

/* ============================================================
   STACKED BAR HORIZONTAL
   ============================================================ */
export const StackedBar = memo(function StackedBar({
  data,
  total,
}: {
  data: { label: string; value: number; color: 'accent' | 'gold' | 'emerald' | 'crimson' }[]
  total: number
}) {
  const colorMap = {
    accent: C.accent,
    gold: C.gold,
    emerald: C.emerald,
    crimson: C.crimson,
  }
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = (d.value / total) * 100
        return (
          <div key={i}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="font-mono text-[10px] tracking-wider uppercase text-paper-3">{d.label}</span>
              <span className="font-display text-sm text-paper tabular-nums">{d.value}</span>
            </div>
            <div className="h-2 rounded-full bg-bg-3 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: colorMap[d.color],
                  boxShadow: `0 0 8px ${colorMap[d.color]}`,
                  transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
                  transitionDelay: `${i * 100}ms`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
})

/* ============================================================
   ANIMATED NUMBER — número que conta
   ============================================================ */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
}) {
  const v = useCountUp(value, 1400, decimals)
  return (
    <span className={`font-display tabular-nums ${className}`}>
      {prefix}
      {v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
})
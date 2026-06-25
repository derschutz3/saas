import { useId } from 'react'
import { BRAND_COLORS } from '@/lib/brand'

/**
 * Gráficos em SVG inline, sem dependências externas. Compartilham a identidade
 * Garciat (esmeralda + âmbar) e degradam graciosamente com dados vazios.
 */

type AreaChartProps = {
  data: number[]
  height?: number
  color?: string
  className?: string
}

/** Gráfico de área/linha responsivo (preenche a largura via viewBox). */
export function AreaChart({ data, height = 160, color = BRAND_COLORS.primary, className }: AreaChartProps) {
  const gid = useId()
  const width = 640
  const pad = 8
  if (data.length === 0) {
    return (
      <div className="grid place-items-center text-xs text-app-muted" style={{ height }}>
        Sem dados no período
      </div>
    )
  }

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
  const x = (i: number) => pad + i * stepX

  const linePts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const areaPath = `M ${x(0)},${height - pad} L ${data.map((v, i) => `${x(i)},${y(v)}`).join(' L ')} L ${x(data.length - 1)},${height - pad} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height }}
      role="img"
      aria-label="Evolução no período"
    >
      <defs>
        <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#area-${gid})`} />
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export type DonutSegment = { label: string; value: number; color: string }

type DonutChartProps = {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}

/** Donut de participação com legenda. */
export function DonutChart({
  segments,
  size = 180,
  thickness = 18,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0
    const dash = frac * circumference
    const arc = { seg, dash, gap: circumference - dash, offset }
    offset += dash
    return arc
  })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel ?? 'Distribuição'}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={BRAND_COLORS.s2} strokeWidth={thickness} />
        {total > 0 &&
          arcs.map((a, i) => (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={a.seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              transform={`rotate(-90 ${c} ${c})`}
              strokeLinecap="butt"
            />
          ))}
        {(centerValue || centerLabel) && (
          <>
            <text x={c} y={c - 2} textAnchor="middle" className="fill-app-text font-display" style={{ fontSize: 22, fontWeight: 700 }}>
              {centerValue}
            </text>
            <text x={c} y={c + 18} textAnchor="middle" className="fill-app-muted" style={{ fontSize: 11 }}>
              {centerLabel}
            </text>
          </>
        )}
      </svg>
      <ul className="w-full space-y-2">
        {segments.map((seg) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0
          return (
            <li key={seg.label} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: seg.color }} />
              <span className="min-w-0 flex-1 truncate text-app-text">{seg.label}</span>
              <span className="font-mono text-xs text-app-muted">{pct.toFixed(1)}%</span>
            </li>
          )
        })}
        {segments.length === 0 && <li className="text-xs text-app-muted">Sem dados no período</li>}
      </ul>
    </div>
  )
}

type BarRow = { label: string; value: number; hint?: string }

/** Lista de barras horizontais (top produtos/clientes). */
export function BarList({ rows, color = BRAND_COLORS.primary }: { rows: BarRow[]; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  if (rows.length === 0) {
    return <div className="py-6 text-sm text-app-muted">Sem dados no período</div>
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-app-text">{r.label}</span>
            {r.hint && <span className="font-mono text-xs text-app-muted">{r.hint}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-app-s2">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

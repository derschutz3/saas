'use client'

import { memo, useMemo } from 'react'
import { TrendingUp, TrendingDown, Activity, Users, Building2, DollarSign, ShoppingCart, Zap } from 'lucide-react'

type Series = { label: string; values: number[] }

const SERIES: Series[] = [
  { label: 'Tenants ativos', values: [98, 102, 108, 112, 118, 124, 130, 134, 138, 142, 145, 142] },
  { label: 'MRR (k R$)', values: [122, 128, 134, 142, 148, 156, 162, 170, 176, 180, 182, 184] },
  { label: 'Pedidos/dia (k)', values: [8.2, 8.5, 8.8, 9.1, 9.4, 9.6, 10.1, 10.4, 10.8, 11.2, 11.6, 12.4] },
  { label: 'Usuários ativos', values: [2100, 2280, 2450, 2680, 2820, 3010, 3180, 3320, 3480, 3620, 3740, 3847] },
]

const TOP_TENANTS = [
  { name: 'Atacado Sul', mrr: 4990, growth: 12.4 },
  { name: 'Distribuidora Norte', mrr: 1490, growth: 8.1 },
  { name: 'Hortifruti Premium', mrr: 1490, growth: 15.2 },
  { name: 'Farmácia Vida', mrr: 1490, growth: 6.8 },
  { name: 'Academia Forte', mrr: 1490, growth: 4.2 },
]

export default function MetricsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Métricas globais</h1>
          <p className="text-sm text-white/50 mt-1">Performance consolidada de toda a plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-9 px-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-200 focus:border-blue-500/50 focus:outline-none">
            <option>Últimos 12 meses</option>
            <option>Últimos 30 dias</option>
            <option>Últimos 7 dias</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {SERIES.map((s) => (
          <ChartCard key={s.label} series={s} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel-solid p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-100">Top tenants por MRR</h2>
            <p className="text-xs text-slate-500 mt-0.5">5 maiores clientes do mês</p>
          </div>
          <div className="space-y-2.5">
            {TOP_TENANTS.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3">
                <div className="flex size-7 items-center justify-center rounded-lg bg-slate-800/60 text-[10px] font-bold text-slate-300">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-200">{t.name}</span>
                    <span className="text-xs font-bold text-slate-100 tabular-nums">R$ {t.mrr.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                        style={{ width: `${(t.mrr / 4990) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono tabular-nums shrink-0">+{t.growth}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-solid p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-100">Funil de conversão</h2>
            <p className="text-xs text-slate-500 mt-0.5">Visitante → Trial → Pago</p>
          </div>
          <div className="space-y-3">
            <FunnelStep label="Visitantes" value={24820} pct={100} color="hsl(217 91% 67%)" />
            <FunnelStep label="Cadastros" value={1842} pct={7.4} color="hsl(195 80% 60%)" />
            <FunnelStep label="Trials iniciados" value={684} pct={2.7} color="hsl(180 70% 55%)" />
            <FunnelStep label="Conversões pagas" value={142} pct={0.57} color="hsl(142 71% 45%)" />
          </div>
        </div>
      </div>
    </div>
  )
}

const ChartCard = memo(function ChartCard({ series }: { series: Series }) {
  const points = useMemo(() => {
    const arr = series.values
    const max = Math.max(...arr)
    const min = Math.min(...arr)
    const range = max - min || 1
    const w = 100
    const h = 40
    return arr.map((v, i) => ({
      x: (i / (arr.length - 1)) * w,
      y: h - ((v - min) / range) * h,
      pct: ((v - min) / range) * 100,
    }))
  }, [series])

  const pathD = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }, [points])

  const areaD = useMemo(() => {
    return `${pathD} L 100 40 L 0 40 Z`
  }, [pathD])

  const current = series.values[series.values.length - 1] ?? 0
  const first = series.values[0] ?? 0
  const delta = first > 0 ? ((current - first) / first) * 100 : 0
  const isUp = delta >= 0

  return (
    <div className="panel-solid p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{series.label}</h2>
          <p className="text-2xl font-black text-slate-100 tabular-nums mt-1">
            {typeof current === 'number' ? current.toLocaleString('pt-BR') : current}
          </p>
        </div>
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
            isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {isUp ? '+' : ''}{delta.toFixed(1)}%
        </div>
      </div>

      <div className="h-24 w-full mt-2">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id={`grad-${series.label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217 91% 67%)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="hsl(217 91% 67%)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#grad-${series.label})`} />
          <path d={pathD} fill="none" stroke="hsl(217 91% 67%)" strokeWidth="1.2" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="0.8" fill="hsl(217 91% 67%)" />
          ))}
        </svg>
      </div>
    </div>
  )
})

function FunnelStep({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="text-slate-300">{label}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-slate-500 tabular-nums">{pct.toFixed(2)}%</span>
          <span className="font-bold text-slate-100 tabular-nums">{value.toLocaleString('pt-BR')}</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct * 4, 4)}%`, background: color }}
        />
      </div>
    </div>
  )
}

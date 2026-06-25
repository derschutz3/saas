'use client'

import { memo, useState } from 'react'
import {
  Download, Calendar, TrendingUp, TrendingDown,
  DollarSign, ShoppingBag, Receipt, Users,
  Sparkles, ArrowUpRight, ArrowDownRight,
  ChevronDown,
} from 'lucide-react'
import {
  AreaChart, DonutChart, BarChart, Sparkline, Heatmap, StackedBar, GaugeChart, AnimatedNumber,
} from '@/components/dashboard/charts'

const TODAY = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

/* === DATA MOCK === */
const REVENUE_DAILY = [42, 58, 64, 72, 68, 88, 124, 156, 188, 212, 248, 296, 318, 286, 252, 198, 168, 142, 124, 98, 76, 64, 52, 48]
const REVENUE_30D = [82, 96, 88, 104, 112, 108, 118, 124, 132, 128, 138, 144, 152, 148, 158, 164, 172, 168, 184, 192, 188, 204, 212, 220, 232, 248, 256, 264, 280, 296]

const KPI_REPORTS = [
  { label: 'Receita total',     value: 184620, prefix: 'R$ ', decimals: 0, sub: '+14,2% vs período',   dir: 'up' as const,   tone: 'accent'  as const, spark: REVENUE_30D.slice(-12) },
  { label: 'Pedidos',           value: 1248,  prefix: '',    decimals: 0, sub: '+8,3% vs período',    dir: 'up' as const,   tone: 'gold'    as const, spark: [840, 892, 968, 1024, 1086, 1142, 1188, 1248] },
  { label: 'Ticket médio',      value: 147.95, prefix: 'R$ ', decimals: 2, sub: '+5,5% vs período',   dir: 'up' as const,   tone: 'emerald' as const, spark: [128, 132, 136, 140, 142, 144, 146, 148] },
  { label: 'Clientes únicos',   value: 384,   prefix: '',    decimals: 0, sub: '+12,1% vs período',   dir: 'up' as const,   tone: 'gold'    as const, spark: [240, 264, 286, 304, 322, 348, 368, 384] },
]

const CHANNELS = [
  { label: 'Balcão',         value: 42, color: 'accent'  as const },
  { label: 'iFood',          value: 28, color: 'crimson' as const },
  { label: 'WhatsApp',       value: 18, color: 'emerald' as const },
  { label: 'Rappi',          value: 8,  color: 'gold'    as const },
  { label: 'App Próprio',    value: 4,  color: 'accent'  as const },
]

const CATEGORIES = [
  { label: 'Bebidas',    value: 28420, color: 'accent'  as const },
  { label: 'Mercearia',  value: 18680, color: 'gold'    as const },
  { label: 'Frios',      value: 9840,  color: 'emerald' as const },
  { label: 'Limpeza',    value: 7480,  color: 'crimson' as const },
  { label: 'Hortifruti', value: 5240,  color: 'gold'    as const },
  { label: 'Padaria',    value: 3820,  color: 'accent'  as const },
]
const TOTAL_CAT = CATEGORIES.reduce((s, c) => s + c.value, 0)

const TOP_PRODUCTS = [
  { name: 'Heineken 350ml',     qty: 1848, rev: 12936, trend: 'up' as const },
  { name: 'Coca-Cola 2L',       qty: 1424, rev: 9968,  trend: 'up' as const },
  { name: 'Arroz Tio João 5kg', qty:  892, rev: 12488, trend: 'up' as const },
  { name: 'Pão Francês (un)',   qty: 4280, rev: 8560,  trend: 'down' as const },
  { name: 'Café Pilão 500g',    qty:  632, rev: 5688,  trend: 'up' as const },
  { name: 'Detergente Ypê',     qty:  512, rev: 3584,  trend: 'down' as const },
]

const TOP_CUSTOMERS = [
  { name: 'Restaurante Sabor',   orders: 86, rev: 18420, segment: 'VIP' as const },
  { name: 'Mercado Boa Vista',   orders: 64, rev: 12840, segment: 'VIP' as const },
  { name: 'Bar do Zé',           orders: 142, rev: 9840, segment: 'PRO' as const },
  { name: 'Hortifruti Premium',  orders: 48, rev: 7480,  segment: 'PRO' as const },
  { name: 'Empório Digital',     orders: 32, rev: 5240,  segment: 'STD' as const },
]

const HEAT_ROWS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const HEAT_COLS = ['8h', '10h', '12h', '14h', '16h', '18h', '20h']
const HEAT_DATA = [
  [2, 4, 8, 6, 5, 9, 12],
  [3, 5, 9, 7, 6, 11, 14],
  [4, 6, 11, 8, 7, 13, 16],
  [5, 8, 14, 11, 9, 16, 19],
  [6, 9, 16, 13, 11, 18, 22],
  [8, 12, 18, 15, 14, 22, 24],
  [5, 7, 12, 10, 9, 16, 18],
]

const SEGMENT_TONE: Record<'VIP' | 'PRO' | 'STD', string> = {
  VIP: 'pill-gold',
  PRO: 'pill-accent',
  STD: 'pill-muted',
}

/* === COMPONENTES === */

const ReportsHero = memo(function ReportsHero() {
  return (
    <section className="card-ink p-8 anim-fade-up relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="status-dot status-dot-green anim-pulse" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
            Relatórios · {TODAY}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
          SYS.ANALYTICS · v4.1
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8 items-end">
        <div>
          <span className="pill pill-accent w-fit">
            <Sparkles className="size-3" /> Inteligência operacional
          </span>
          <h1 className="mt-5 serif-h1 text-[48px] lg:text-[64px] text-paper">
            Inteligência<br />
            <span className="italic-accent text-gradient-accent">de verdade.</span>
          </h1>
          <p className="mt-4 max-w-md font-sans text-[14px] leading-relaxed text-paper-2">
            Receitas, pedidos, clientes e canais — tudo em uma única narrativa visual.
            <span className="font-display text-accent"> +14,2% </span>
            de crescimento no período.
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-primary">
            <Download className="size-4" /> Exportar CSV
          </button>
          <button className="btn-ghost">
            <Calendar className="size-4" /> Período
          </button>
        </div>
      </div>

      <span
        aria-hidden
        className="absolute -bottom-16 -right-4 font-display text-[240px] leading-none text-paper/[0.025] select-none pointer-events-none"
      >
        REL
      </span>
    </section>
  )
})

const ReportsKpi = memo(function ReportsKpi({ k, idx }: { k: typeof KPI_REPORTS[number]; idx: number }) {
  const toneClass = {
    accent: 'text-accent', gold: 'text-gold', crimson: 'text-crimson', emerald: 'text-emerald',
  }[k.tone]
  return (
    <article className="card p-6 card-hover anim-fade-up" style={{ animationDelay: `${80 + idx * 60}ms` }}>
      <header className="flex items-center justify-between">
        <span className="label">{k.label}</span>
        <span className={`size-1.5 rounded-full ${toneClass.replace('text', 'bg')} anim-pulse`} />
      </header>
      <div className="mt-4 font-display text-[40px] leading-none tracking-tight text-paper tabular-nums">
        <AnimatedNumber value={k.value} prefix={k.prefix} decimals={k.decimals} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ArrowUpRight className={`size-3.5 ${toneClass}`} strokeWidth={2} />
        <span className={`font-mono text-[11px] font-semibold ${toneClass}`}>{k.sub}</span>
      </div>
      <div className="mt-4">
        <Sparkline data={k.spark} width={240} height={32} color={k.tone} />
      </div>
    </article>
  )
})

const RevenueTrend = memo(function RevenueTrend() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const data = period === '7d' ? REVENUE_DAILY : REVENUE_30D
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '320ms' }}>
      <header className="flex items-start justify-between mb-6">
        <div>
          <span className="label">Evolução temporal</span>
          <h2 className="mt-1 serif-h2 text-[28px] text-paper">
            Receita por <span className="italic-accent text-accent">período.</span>
          </h2>
        </div>
        <div className="flex gap-1 rounded-full bg-bg p-1 border border-line">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 h-7 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all duration-200 ${
                period === p ? 'bg-accent text-bg' : 'text-paper-3 hover:text-paper'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <span className="label">Total</span>
          <div className="mt-1 font-display text-2xl text-paper">R$ <AnimatedNumber value={184620} /></div>
          <span className="font-mono text-[10px] text-emerald mt-1 inline-flex items-center gap-1">
            <ArrowUpRight className="size-3" /> +14,2%
          </span>
        </div>
        <div>
          <span className="label">Média diária</span>
          <div className="mt-1 font-display text-2xl text-paper">R$ <AnimatedNumber value={6154} /></div>
          <span className="font-mono text-[10px] text-emerald mt-1 inline-flex items-center gap-1">
            <ArrowUpRight className="size-3" /> +8,6%
          </span>
        </div>
        <div>
          <span className="label">Pico</span>
          <div className="mt-1 font-display text-2xl text-paper">R$ <AnimatedNumber value={12840} /></div>
          <span className="font-mono text-[10px] text-paper-3 mt-1 inline-flex items-center gap-1">
            sexta · 14h
          </span>
        </div>
      </div>

      <AreaChart data={data} height={170} />
    </article>
  )
})

const ChannelsDonut = memo(function ChannelsDonut() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '400ms' }}>
      <header className="mb-5">
        <span className="label">Origem dos pedidos</span>
        <h2 className="mt-1 serif-h2 text-[24px] text-paper">
          Canais de <span className="italic-accent text-accent">venda.</span>
        </h2>
      </header>
      <DonutChart
        segments={CHANNELS}
        size={170}
        thickness={16}
        centerLabel="Pedidos"
        centerValue="100%"
      />
    </article>
  )
})

const TopProducts = memo(function TopProducts() {
  const max = Math.max(...TOP_PRODUCTS.map((p) => p.rev))
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '480ms' }}>
      <header className="flex items-center justify-between mb-5">
        <div>
          <span className="label">Top 6 do período</span>
          <h2 className="mt-1 serif-h2 text-[24px] text-paper">
            Produtos <span className="italic-accent text-accent">líderes.</span>
          </h2>
        </div>
        <span className="pill pill-accent">Receita</span>
      </header>

      <div className="space-y-3">
        {TOP_PRODUCTS.map((p, i) => {
          const pct = (p.rev / max) * 100
          return (
            <div
              key={p.name}
              className="anim-slide-r"
              style={{ animationDelay: `${540 + i * 60}ms` }}
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="font-sans text-[13px] font-semibold text-paper truncate flex-1 mr-3">
                  {p.name}
                </span>
                <span className="font-display text-sm text-paper tabular-nums">
                  R$ {p.rev.toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-bg-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${pct}%`,
                      boxShadow: '0 0 8px hsl(225 100% 68%)',
                      transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
                      transitionDelay: `${600 + i * 80}ms`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] text-paper-3 tracking-wider uppercase tabular-nums w-12 text-right">
                  {p.qty}un
                </span>
                {p.trend === 'up' ? (
                  <TrendingUp className="size-3 text-emerald" strokeWidth={2} />
                ) : (
                  <TrendingDown className="size-3 text-crimson" strokeWidth={2} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
})

const CategoriesStack = memo(function CategoriesStack() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '560ms' }}>
      <header className="mb-5">
        <span className="label">Mix por categoria</span>
        <h2 className="mt-1 serif-h2 text-[24px] text-paper">
          Participação no <span className="italic-accent text-accent">faturamento.</span>
        </h2>
      </header>
      <StackedBar data={CATEGORIES} total={TOTAL_CAT} />
    </article>
  )
})

const HeatmapCard = memo(function HeatmapCard() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '640ms' }}>
      <header className="flex items-baseline justify-between mb-5">
        <div>
          <span className="label">Comportamento semanal</span>
          <h2 className="mt-1 serif-h2 text-[24px] text-paper">
            Mapa de <span className="italic-accent text-accent">calor.</span>
          </h2>
        </div>
        <span className="pill pill-accent">Pedidos</span>
      </header>
      <Heatmap rows={HEAT_ROWS} cols={HEAT_COLS} data={HEAT_DATA} />
    </article>
  )
})

const TopCustomers = memo(function TopCustomers() {
  return (
    <article className="card overflow-hidden anim-fade-up" style={{ animationDelay: '720ms' }}>
      <header className="flex items-center justify-between px-6 py-5 border-b border-line">
        <div>
          <span className="label">Por receita</span>
          <h2 className="mt-1 serif-h2 text-[24px] text-paper">
            Top <span className="italic-accent text-accent">clientes.</span>
          </h2>
        </div>
        <span className="pill pill-gold">5 de 384</span>
      </header>

      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">#</th>
            <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Cliente</th>
            <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Pedidos</th>
            <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Receita</th>
            <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Segmento</th>
          </tr>
        </thead>
        <tbody>
          {TOP_CUSTOMERS.map((c, i) => (
            <tr
              key={c.name}
              className="border-b border-line last:border-b-0 hover:bg-bg-3 transition-colors anim-fade-up"
              style={{ animationDelay: `${780 + i * 60}ms` }}
            >
              <td className="px-6 py-3.5 font-display text-base text-paper-3 tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </td>
              <td className="px-6 py-3.5 font-sans text-[13px] font-semibold tracking-wide uppercase text-paper">
                {c.name}
              </td>
              <td className="px-6 py-3.5 font-mono text-[13px] text-paper-2 tabular-nums">{c.orders}</td>
              <td className="px-6 py-3.5 font-mono text-[13px] font-semibold text-paper tabular-nums">
                R$ {c.rev.toLocaleString('pt-BR')}
              </td>
              <td className="px-6 py-3.5">
                <span className={`pill ${SEGMENT_TONE[c.segment]}`}>{c.segment}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
})

/* === EXPORT === */
export function ReportsOverview() {
  return (
    <section className="space-y-6 mb-8">
      <ReportsHero />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_REPORTS.map((k, i) => <ReportsKpi key={k.label} k={k} idx={i} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <RevenueTrend />
        <ChannelsDonut />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProducts />
        <CategoriesStack />
      </div>

      <HeatmapCard />

      <TopCustomers />
    </section>
  )
}
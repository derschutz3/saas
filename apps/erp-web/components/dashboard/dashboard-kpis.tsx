'use client'

import { memo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Zap, Layers,
  TrendingUp, Package, Users, Wallet, Activity,
  ChevronRight, Sparkles, Circle,
} from 'lucide-react'
import { AreaChart, BarChart, DonutChart, Sparkline, GaugeChart, Heatmap, StackedBar, AnimatedNumber } from './charts'

const TODAY = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

/* === DATA === */
const REVENUE_24H = [42, 58, 64, 72, 68, 88, 124, 156, 188, 212, 248, 296, 318, 286, 252, 198, 168, 142, 124, 98, 76, 64, 52, 48]
const REVENUE_7D  = [2840, 3120, 2960, 3580, 4120, 4680, 4920]
const REVENUE_30D = [42, 48, 44, 56, 62, 58, 64, 72, 68, 78, 84, 92, 88, 96, 104, 112, 108, 118, 124, 132, 128, 138, 144, 152, 148, 158, 164, 172, 168, 184]

const KPIS = [
  { label: 'Receita hoje', value: 18420, prefix: 'R$ ', decimals: 0, sub: '+14,2% vs ontem', dir: 'up' as const, icon: Wallet, spark: REVENUE_24H.slice(-12), tone: 'accent' as const },
  { label: 'Pedidos ativos', value: 126, prefix: '', decimals: 0, sub: '28 em separação', dir: 'up' as const, icon: TrendingUp, spark: [12, 14, 18, 16, 22, 28, 26, 32], tone: 'gold' as const },
  { label: 'Estoque crítico', value: 7, prefix: '', decimals: 0, sub: 'Abaixo do mínimo', dir: 'down' as const, icon: Package, spark: [3, 4, 5, 4, 6, 5, 7], tone: 'crimson' as const },
  { label: 'Ticket médio', value: 42.8, prefix: 'R$ ', decimals: 2, sub: '+6,1% vs média', dir: 'up' as const, icon: Activity, spark: [32, 36, 38, 40, 42, 41, 43, 42.8], tone: 'emerald' as const },
]

const ALERTS = [
  { tone: 'crimson' as const, title: '7 itens em ruptura', desc: 'Heineken 350ml, Brahma 350ml, Coca-Cola 2L e outros. Reposição urgente.', time: 'agora' },
  { tone: 'gold' as const, title: 'Fila acima do normal', desc: 'SLA caindo para 18min. Aumente a equipe de separação.', time: '4 min' },
  { tone: 'emerald' as const, title: 'Receita acelerando', desc: '+14% acima do baseline das últimas 4 semanas.', time: '12 min' },
  { tone: 'accent' as const, title: 'NF-e autorizada', desc: 'Lote de 142 documentos processados em 3,2s.', time: '22 min' },
]

const ORDERS = [
  { id: '#4821', time: '14:32', client: 'Bar do Zé',          total: 218.40, status: 'separacao', label: 'SEPARAÇÃO' },
  { id: '#4820', time: '14:18', client: 'Restaurante Sabor',  total: 445.90, status: 'fiscal',    label: 'FISCAL' },
  { id: '#4819', time: '13:55', client: 'Empório Digital',    total:  89.00, status: 'faturado',  label: 'FATURADO' },
  { id: '#4818', time: '13:42', client: 'Mercado Boa Vista',  total: 312.00, status: 'separacao', label: 'SEPARAÇÃO' },
  { id: '#4817', time: '13:21', client: 'Hortifruti Premium', total: 156.50, status: 'pago',      label: 'PAGO' },
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

const CATEGORY_SALES = [
  { label: 'Bebidas', value: 8420, color: 'accent' as const },
  { label: 'Mercearia', value: 6180, color: 'gold' as const },
  { label: 'Limpeza', value: 2980, color: 'emerald' as const },
  { label: 'Frios', value: 1840, color: 'crimson' as const },
]
const TOTAL_CAT = CATEGORY_SALES.reduce((s, c) => s + c.value, 0)

/* ============================================================
   HERO — Comando central
   ============================================================ */
const HeroCard = memo(function HeroCard() {
  return (
    <section className="card-ink relative overflow-hidden anim-fade-up">
      {/* Top status */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <span className="status-dot status-dot-green anim-pulse" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
            Operação ao vivo · {TODAY}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
          SYS.DASHBOARD · v4.1
        </span>
      </div>

      {/* Conteúdo principal */}
      <div className="relative grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8 p-8 lg:p-10">
        {/* Texto + gráfico */}
        <div className="flex flex-col">
          <span className="pill pill-accent w-fit">
            <Sparkles className="size-3" /> Edição ao vivo
          </span>

          <h1 className="mt-5 serif-h1 text-[48px] lg:text-[68px] text-paper">
            Comando<br />
            <span className="italic-accent text-gradient-accent">central.</span>
          </h1>

          <p className="mt-4 max-w-md font-sans text-[14px] leading-relaxed text-paper-2">
            Sua operação inteira em uma única tela. Latência de sync abaixo de <span className="font-display text-accent">12ms</span>,
            fila de pedidos sob controle, ruptura antecipada em 48h.
          </p>

          {/* Mini gráfico embaixo */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <span className="label">Receita · últimas 24h</span>
              <span className="font-display text-sm text-paper-2">
                <AnimatedNumber value={18420} prefix="R$ " /> <span className="text-emerald text-[12px]">+14,2%</span>
              </span>
            </div>
            <AreaChart data={REVENUE_24H} height={120} />
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-paper-3 tracking-wider uppercase">
              <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>agora</span>
            </div>
          </div>
        </div>

        {/* Painel lateral — KPIs circulares */}
        <div className="flex flex-col gap-4">
          <div className="card-elevated p-5 flex items-center gap-5">
            <GaugeChart value={94} max={100} label="Meta" />
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">Meta diária</div>
              <div className="mt-1 font-display text-3xl text-paper">
                <AnimatedNumber value={94} suffix="%" />
              </div>
              <div className="mt-1 font-sans text-[11px] text-paper-3">R$ 18.420 de R$ 19.500</div>
            </div>
          </div>

          <div className="card-elevated p-5 flex items-center gap-5">
            <GaugeChart value={62} max={100} label="SLA" />
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">SLA de separação</div>
              <div className="mt-1 font-display text-3xl text-paper">
                <AnimatedNumber value={62} suffix="%" />
              </div>
              <div className="mt-1 font-sans text-[11px] text-paper-3">Tempo médio: 22min</div>
            </div>
          </div>

          <div className="card-elevated p-5 flex items-center gap-5">
            <GaugeChart value={86} max={100} label="Acurácia" />
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">Acurácia estoque</div>
              <div className="mt-1 font-display text-3xl text-paper">
                <AnimatedNumber value={86} suffix="%" />
              </div>
              <div className="mt-1 font-sans text-[11px] text-paper-3">Última contagem: ontem</div>
            </div>
          </div>
        </div>
      </div>

      {/* Marca d'água */}
      <span
        aria-hidden
        className="absolute -bottom-20 -right-6 font-display text-[280px] leading-none text-paper/[0.025] select-none pointer-events-none"
      >
        01
      </span>
    </section>
  )
})

/* ============================================================
   KPI GRID — 4 cards animados com sparklines
   ============================================================ */
const KpiCard = memo(function KpiCard({
  label, value, prefix, decimals, sub, dir, Icon, spark, tone, style,
}: {
  label: string
  value: number
  prefix?: string
  decimals?: number
  sub: string
  dir: 'up' | 'down'
  Icon: typeof Wallet
  spark: number[]
  tone: 'accent' | 'gold' | 'crimson' | 'emerald'
  style?: CSSProperties
}) {
  const toneClass = {
    accent: 'text-accent',
    gold: 'text-gold',
    crimson: 'text-crimson',
    emerald: 'text-emerald',
  }[tone]
  return (
    <article className="card p-6 card-hover anim-fade-up" style={style}>
      <header className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">{label}</span>
        <Icon className={`size-4 ${toneClass}`} strokeWidth={1.6} />
      </header>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-[40px] leading-none tracking-tight text-paper tabular-nums">
          <AnimatedNumber value={value} prefix={prefix} decimals={decimals} />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {dir === 'up' ? (
          <ArrowUpRight className={`size-3.5 ${toneClass}`} strokeWidth={2} />
        ) : (
          <ArrowDownRight className={`size-3.5 ${toneClass}`} strokeWidth={2} />
        )}
        <span className={`font-mono text-[11px] font-semibold ${toneClass}`}>
          {sub.split(' ')[0]}
        </span>
        <span className="font-sans text-[12px] text-paper-3">{sub.split(' ').slice(1).join(' ')}</span>
      </div>
      <div className="mt-4 -mb-1">
        <Sparkline data={spark} width={240} height={36} color={tone} />
      </div>
    </article>
  )
})

/* ============================================================
   ALERTAS
   ============================================================ */
const AlertsList = memo(function AlertsList() {
  return (
    <article className="card overflow-hidden anim-fade-up" style={{ animationDelay: '160ms' }}>
      <header className="flex items-center justify-between px-6 py-5 border-b border-line">
        <div>
          <span className="label">Operação · ao vivo</span>
          <h2 className="mt-1 serif-h2 text-[28px] text-paper">
            Alertas <span className="italic-accent text-accent">agora.</span>
          </h2>
        </div>
        <Zap className="size-5 text-gold anim-pulse" strokeWidth={1.6} />
      </header>

      <div className="px-2 py-2">
        {ALERTS.map((a, i) => {
          const toneClass = a.tone === 'crimson' ? 'status-dot-red' : a.tone === 'gold' ? 'status-dot-yellow' : a.tone === 'emerald' ? 'status-dot-green' : 'status-dot-blue'
          const pillClass = a.tone === 'crimson' ? 'pill-crimson' : a.tone === 'gold' ? 'pill-gold' : a.tone === 'emerald' ? 'pill-emerald' : 'pill-accent'
          return (
            <div
              key={i}
              className="group flex items-start gap-4 px-4 py-4 rounded-md cursor-pointer transition-all duration-200 hover:bg-bg-3 anim-slide-r"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className={`status-dot mt-2 size-1.5 shrink-0 ${toneClass}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-[13px] font-semibold tracking-wide uppercase text-paper">
                    {a.title}
                  </span>
                  <span className={`pill ${pillClass}`}>{a.time}</span>
                </div>
                <div className="font-sans text-[12px] text-paper-3 mt-1 leading-relaxed">{a.desc}</div>
              </div>
              <ChevronRight className="size-4 text-paper-3 opacity-0 group-hover:opacity-100 transition-opacity mt-2" />
            </div>
          )
        })}
      </div>
    </article>
  )
})

/* ============================================================
   PEDIDOS RECENTES
   ============================================================ */
const OrdersTable = memo(function OrdersTable() {
  return (
    <article className="card overflow-hidden anim-fade-up" style={{ animationDelay: '240ms' }}>
      <header className="flex items-center justify-between px-6 py-5 border-b border-line">
        <div>
          <span className="label">Movimento · últimos 30min</span>
          <h2 className="mt-1 serif-h2 text-[28px] text-paper">
            Pedidos <span className="italic-accent text-accent">recentes.</span>
          </h2>
        </div>
        <Layers className="size-5 text-accent" strokeWidth={1.6} />
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">ID</th>
              <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Hora</th>
              <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Cliente</th>
              <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((o, i) => {
              const pillCls = o.status === 'pago' || o.status === 'faturado' ? 'pill-emerald' : o.status === 'fiscal' ? 'pill-accent' : 'pill-gold'
              return (
                <tr
                  key={o.id}
                  className="border-b border-line last:border-b-0 hover:bg-bg-3 transition-colors anim-fade-up"
                  style={{ animationDelay: `${300 + i * 60}ms` }}
                >
                  <td className="px-6 py-3.5 font-mono text-[12px] text-paper-2">{o.id}</td>
                  <td className="px-6 py-3.5 font-mono text-[12px] text-paper-3">{o.time}</td>
                  <td className="px-6 py-3.5 font-sans text-[13px] font-semibold tracking-wide uppercase text-paper">{o.client}</td>
                  <td className="px-6 py-3.5">
                    <span className={`pill ${pillCls}`}>{o.label}</span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-[13px] font-semibold text-paper text-right tabular-nums">
                    {o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-line">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
          5 de 126 pedidos hoje
        </span>
        <Link href="/app/orders" className="btn-link">Ver todos os pedidos</Link>
      </footer>
    </article>
  )
})

/* ============================================================
   GRÁFICOS AVANÇADOS — Receita + Categorias + Heatmap
   ============================================================ */
const RevenueChart = memo(function RevenueChart() {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d')
  const data = period === '24h' ? REVENUE_24H : period === '7d' ? REVENUE_7D : REVENUE_30D

  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '320ms' }}>
      <header className="flex items-start justify-between mb-6">
        <div>
          <span className="label">Performance financeira</span>
          <h2 className="mt-1 serif-h2 text-[28px] text-paper">
            Receita por <span className="italic-accent text-accent">período.</span>
          </h2>
        </div>
        <div className="flex gap-1 rounded-full bg-bg p-1 border border-line">
          {(['24h', '7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 h-7 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all duration-200 ${
                period === p
                  ? 'bg-accent text-bg'
                  : 'text-paper-3 hover:text-paper'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <span className="label">Receita total</span>
          <div className="mt-1 font-display text-2xl text-paper">
            R$ <AnimatedNumber value={period === '24h' ? 18420 : period === '7d' ? 26220 : 184680} />
          </div>
          <span className="font-mono text-[10px] text-emerald mt-1 inline-flex items-center gap-1">
            <ArrowUpRight className="size-3" /> +14,2%
          </span>
        </div>
        <div>
          <span className="label">Pedidos</span>
          <div className="mt-1 font-display text-2xl text-paper">
            <AnimatedNumber value={period === '24h' ? 126 : period === '7d' ? 894 : 3842} />
          </div>
          <span className="font-mono text-[10px] text-emerald mt-1 inline-flex items-center gap-1">
            <ArrowUpRight className="size-3" /> +8,3%
          </span>
        </div>
        <div>
          <span className="label">Margem</span>
          <div className="mt-1 font-display text-2xl text-paper">
            <AnimatedNumber value={32.4} decimals={1} suffix="%" />
          </div>
          <span className="font-mono text-[10px] text-gold mt-1 inline-flex items-center gap-1">
            <ArrowDownRight className="size-3" /> -1,2%
          </span>
        </div>
      </div>

      <AreaChart data={data} height={160} />
    </article>
  )
})

const CategoryDonut = memo(function CategoryDonut() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '400ms' }}>
      <header className="mb-6">
        <span className="label">Hoje · por categoria</span>
        <h2 className="mt-1 serif-h2 text-[28px] text-paper">
          Vendas <span className="italic-accent text-accent">por mix.</span>
        </h2>
      </header>

      <DonutChart
        segments={CATEGORY_SALES.map((c) => ({ label: c.label, value: c.value, color: c.color }))}
        size={170}
        thickness={16}
        centerLabel="Total"
        centerValue="19,4k"
      />

      <div className="mt-6 pt-4 border-t border-line">
        <span className="label">Participação</span>
        <div className="mt-3">
          <StackedBar data={CATEGORY_SALES} total={TOTAL_CAT} />
        </div>
      </div>
    </article>
  )
})

const HeatmapCard = memo(function HeatmapCard() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '480ms' }}>
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <span className="label">Padrão semanal de vendas</span>
          <h2 className="mt-1 serif-h2 text-[24px] text-paper">
            Mapa de <span className="italic-accent text-accent">calor.</span>
          </h2>
        </div>
        <span className="pill pill-accent">Últimos 30 dias</span>
      </header>
      <Heatmap rows={HEAT_ROWS} cols={HEAT_COLS} data={HEAT_DATA} />
    </article>
  )
})

const ChannelsChart = memo(function ChannelsChart() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '560ms' }}>
      <header className="mb-6">
        <span className="label">Comparativo · por canal</span>
        <h2 className="mt-1 serif-h2 text-[24px] text-paper">
          Canais de <span className="italic-accent text-accent">venda.</span>
        </h2>
      </header>
      <BarChart
        data={[
          { label: 'Balcão', value: 84, color: 'accent' },
          { label: 'iFood', value: 72, color: 'gold' },
          { label: 'WhatsApp', value: 58, color: 'emerald' },
          { label: 'Rappi', value: 42, color: 'crimson' },
          { label: '99Food', value: 38, color: 'accent' },
          { label: 'Site', value: 26, color: 'gold' },
        ]}
        height={140}
      />
    </article>
  )
})

/* ============================================================
   EXPORT
   ============================================================ */
export function DashboardKpis() {
  return (
    <div className="space-y-6">
      <HeroCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k, i) => (
          <KpiCard
            key={k.label}
            {...k}
            Icon={k.icon}
            style={{ animationDelay: `${80 + i * 60}ms` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <CategoryDonut />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <OrdersTable />
        <AlertsList />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HeatmapCard />
        <ChannelsChart />
      </div>
    </div>
  )
}
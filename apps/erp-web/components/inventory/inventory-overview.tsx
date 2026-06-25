'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import {
  Package, TrendingDown, TrendingUp, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Box, Layers,
  ChevronRight, Sparkles,
  FileSpreadsheet, FileUp, Plus, BarChart3,
} from 'lucide-react'
import {
  AreaChart, DonutChart, Sparkline, StackedBar, GaugeChart, BarChart, AnimatedNumber,
} from '@/components/dashboard/charts'

const TODAY = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

/* === DATA MOCK (substituir por dados reais) === */
const STOCK_HISTORY = [42, 45, 48, 52, 49, 55, 61, 58, 64, 72, 68, 75, 82, 79, 86, 92, 88, 96, 102, 98, 104, 112, 108, 116]
const CATEGORIES = [
  { label: 'Bebidas',    value: 8420, color: 'accent' as const, items: 86, valueCents: 842000 },
  { label: 'Mercearia',  value: 6180, color: 'gold' as const,   items: 142, valueCents: 618000 },
  { label: 'Limpeza',    value: 2980, color: 'emerald' as const, items: 64, valueCents: 298000 },
  { label: 'Frios',      value: 1840, color: 'crimson' as const, items: 38, valueCents: 184000 },
  { label: 'Hortifruti', value: 1240, color: 'accent' as const,  items: 28, valueCents: 124000 },
  { label: 'Padaria',    value:  820, color: 'gold' as const,    items: 14, valueCents: 82000 },
]
const TOTAL_ITEMS = CATEGORIES.reduce((s, c) => s + c.items, 0)
const TOTAL_VALUE = CATEGORIES.reduce((s, c) => s + c.valueCents, 0) / 100

const KPI_CARDS = [
  { label: 'Itens totais',  value: 372, prefix: '', suffix: '', decimals: 0, sub: '+8 esta semana',   dir: 'up'   as const, tone: 'accent'  as const, spark: [340, 348, 352, 358, 362, 366, 372] },
  { label: 'Valor em estoque', value: 2148000 / 100, prefix: 'R$ ', suffix: '', decimals: 0, sub: '+12,4% vs mês', dir: 'up'   as const, tone: 'gold'    as const, spark: [180, 186, 192, 198, 204, 210, 214.8] },
  { label: 'Itens críticos',  value: 7, prefix: '', suffix: '', decimals: 0, sub: 'Ruptura iminente', dir: 'down' as const, tone: 'crimson' as const, spark: [3, 4, 5, 4, 6, 5, 7] },
  { label: 'Giro de estoque', value: 4.2, prefix: '', suffix: 'x', decimals: 1, sub: '+0,3 vs média',   dir: 'up'   as const, tone: 'emerald' as const, spark: [3.8, 3.9, 4.0, 4.1, 4.0, 4.1, 4.2] },
]

const CRITICAL = [
  { sku: 'BEB-001', name: 'Heineken 350ml',      cat: 'Bebidas',   stock: 8,  min: 50, unit: 'UN' },
  { sku: 'BEB-002', name: 'Brahma 350ml',         cat: 'Bebidas',   stock: 12, min: 60, unit: 'UN' },
  { sku: 'BEB-008', name: 'Coca-Cola 2L',          cat: 'Bebidas',   stock: 4,  min: 30, unit: 'UN' },
  { sku: 'MER-014', name: 'Arroz Tio João 5kg',    cat: 'Mercearia', stock: 18, min: 25, unit: 'UN' },
  { sku: 'MER-022', name: 'Feijão Carioca 1kg',    cat: 'Mercearia', stock: 22, min: 40, unit: 'UN' },
  { sku: 'LIM-005', name: 'Detergente Ypê 500ml',  cat: 'Limpeza',   stock: 6,  min: 24, unit: 'UN' },
  { sku: 'FRI-003', name: 'Mussarela Fatiada 500g', cat: 'Frios',     stock: 3,  min: 15, unit: 'KG' },
]

const TOP_MOVING = [
  { sku: 'BEB-001', name: 'Heineken 350ml',     moved: 1248, trend: 'up'   as const },
  { sku: 'MER-001', name: 'Açúcar Cristal 5kg', moved:  896, trend: 'up'   as const },
  { sku: 'BEB-002', name: 'Brahma 350ml',        moved:  742, trend: 'up'   as const },
  { sku: 'PAD-001', name: 'Pão Francês (un)',    moved: 2180, trend: 'down' as const },
  { sku: 'MER-008', name: 'Café Pilão 500g',     moved:  632, trend: 'up'   as const },
]

const STOCK_BY_DAY = [
  { label: 'Seg', value: 384, color: 'accent' as const },
  { label: 'Ter', value: 412, color: 'accent' as const },
  { label: 'Qua', value: 396, color: 'accent' as const },
  { label: 'Qui', value: 448, color: 'accent' as const },
  { label: 'Sex', value: 524, color: 'gold' as const },
  { label: 'Sáb', value: 612, color: 'gold' as const },
  { label: 'Dom', value: 408, color: 'accent' as const },
]

/* === SUB-COMPONENTES === */

const StockKpi = memo(function StockKpi({ k, idx }: { k: typeof KPI_CARDS[number]; idx: number }) {
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
        <AnimatedNumber value={k.value} prefix={k.prefix} suffix={k.suffix} decimals={k.decimals} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        {k.dir === 'up' ? (
          <ArrowUpRight className={`size-3.5 ${toneClass}`} strokeWidth={2} />
        ) : (
          <ArrowDownRight className={`size-3.5 ${toneClass}`} strokeWidth={2} />
        )}
        <span className={`font-mono text-[11px] font-semibold ${toneClass}`}>{k.sub}</span>
      </div>
      <div className="mt-4">
        <Sparkline data={k.spark} width={240} height={32} color={k.tone} />
      </div>
    </article>
  )
})

const CategoryDonut = memo(function CategoryDonut() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '320ms' }}>
      <header className="mb-5">
        <span className="label">Distribuição por categoria</span>
        <h2 className="mt-1 serif-h2 text-[28px] text-paper">
          Mix de <span className="italic-accent text-accent">estoque.</span>
        </h2>
      </header>
      <DonutChart
        segments={CATEGORIES.map((c) => ({ label: c.label, value: c.items, color: c.color }))}
        size={170}
        thickness={16}
        centerLabel="SKUs"
        centerValue={String(TOTAL_ITEMS)}
      />
      <div className="mt-6 pt-4 border-t border-line">
        <span className="label">Valor por categoria</span>
        <div className="mt-3">
          <StackedBar
            data={CATEGORIES.slice(0, 4).map((c) => ({
              label: c.label, value: c.valueCents / 100, color: c.color,
            }))}
            total={TOTAL_VALUE}
          />
        </div>
      </div>
    </article>
  )
})

const EvolutionChart = memo(function EvolutionChart() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '400ms' }}>
      <header className="flex items-start justify-between mb-5">
        <div>
          <span className="label">Evolução do estoque</span>
          <h2 className="mt-1 serif-h2 text-[28px] text-paper">
            Quantidade em <span className="italic-accent text-accent">unidades.</span>
          </h2>
        </div>
        <div className="flex gap-1 rounded-full bg-bg p-1 border border-line">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 h-7 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all ${
                period === p ? 'bg-accent text-bg' : 'text-paper-3 hover:text-paper'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <span className="label">Hoje</span>
          <div className="mt-1 font-display text-2xl text-paper">12.480</div>
          <span className="font-mono text-[10px] text-emerald mt-1 inline-flex items-center gap-1">
            <ArrowUpRight className="size-3" /> +6,2%
          </span>
        </div>
        <div>
          <span className="label">Entradas</span>
          <div className="mt-1 font-display text-2xl text-paper">3.842</div>
          <span className="font-mono text-[10px] text-accent mt-1 inline-flex items-center gap-1">
            <ArrowUpRight className="size-3" /> 412 NF-e
          </span>
        </div>
        <div>
          <span className="label">Saídas</span>
          <div className="mt-1 font-display text-2xl text-paper">2.968</div>
          <span className="font-mono text-[10px] text-gold mt-1 inline-flex items-center gap-1">
            <ArrowDownRight className="size-3" /> 318 pedidos
          </span>
        </div>
      </div>

      <AreaChart data={STOCK_HISTORY} height={150} />
    </article>
  )
})

const CriticalItems = memo(function CriticalItems() {
  return (
    <article className="card overflow-hidden anim-fade-up" style={{ animationDelay: '480ms' }}>
      <header className="flex items-center justify-between px-6 py-5 border-b border-line">
        <div>
          <span className="label flex items-center gap-2">
            <AlertTriangle className="size-3 text-crimson" />
            Abaixo do mínimo
          </span>
          <h2 className="mt-1 serif-h2 text-[24px] text-paper">
            Itens <span className="italic-accent text-crimson">críticos.</span>
          </h2>
        </div>
        <span className="pill pill-crimson">{CRITICAL.length} alertas</span>
      </header>

      <div className="divide-y divide-line">
        {CRITICAL.map((item, i) => {
          const pct = Math.min(100, (item.stock / item.min) * 100)
          const isCritical = pct < 20
          return (
            <div
              key={item.sku}
              className="flex items-center gap-4 px-6 py-3.5 hover:bg-bg-3 transition-colors anim-fade-up"
              style={{ animationDelay: `${540 + i * 50}ms` }}
            >
              <div className={`flex size-8 items-center justify-center ${isCritical ? 'bg-crimson/15 text-crimson' : 'bg-gold/15 text-gold'} shrink-0`}>
                <Package className="size-4" strokeWidth={1.6} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-sans text-[13px] font-semibold text-paper truncate">{item.name}</div>
                <div className="font-mono text-[10px] text-paper-3 mt-0.5 flex items-center gap-2">
                  <span>{item.sku}</span>
                  <span>·</span>
                  <span>{item.cat}</span>
                </div>
              </div>
              <div className="w-32">
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`font-display text-base ${isCritical ? 'text-crimson' : 'text-gold'} tabular-nums`}>
                    {item.stock}
                  </span>
                  <span className="font-mono text-[9px] text-paper-3 uppercase tracking-wider">/ mín. {item.min}</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isCritical ? 'bg-crimson' : 'bg-gold'}`}
                    style={{
                      width: `${pct}%`,
                      boxShadow: isCritical ? '0 0 8px hsl(350 75% 60%)' : '0 0 8px hsl(38 65% 60%)',
                      transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
                      transitionDelay: `${i * 60}ms`,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
})

const TopMoving = memo(function TopMoving() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '560ms' }}>
      <header className="mb-5">
        <span className="label">Últimos 7 dias</span>
        <h2 className="mt-1 serif-h2 text-[24px] text-paper">
          Top <span className="italic-accent text-accent">giro.</span>
        </h2>
      </header>
      <div className="space-y-3">
        {TOP_MOVING.map((item, i) => (
          <div
            key={item.sku}
            className="flex items-center gap-3 p-3 rounded-md hover:bg-bg-3 transition-colors cursor-pointer anim-slide-r"
            style={{ animationDelay: `${600 + i * 60}ms` }}
          >
            <span className="font-display text-2xl text-paper-3 tabular-nums w-8">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-sans text-[13px] font-semibold text-paper truncate">{item.name}</div>
              <div className="font-mono text-[10px] text-paper-3 mt-0.5">{item.sku}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-lg text-paper tabular-nums">{item.moved.toLocaleString('pt-BR')}</div>
              <div className="flex items-center gap-1 mt-0.5 justify-end">
                {item.trend === 'up' ? (
                  <TrendingUp className="size-3 text-emerald" strokeWidth={2} />
                ) : (
                  <TrendingDown className="size-3 text-crimson" strokeWidth={2} />
                )}
                <span className={`font-mono text-[10px] font-semibold ${item.trend === 'up' ? 'text-emerald' : 'text-crimson'}`}>
                  {item.trend === 'up' ? '+' : '-'}
                  {Math.floor(Math.random() * 8) + 2}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
})

const StockByDayChart = memo(function StockByDayChart() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '640ms' }}>
      <header className="mb-5">
        <span className="label">Padrão semanal</span>
        <h2 className="mt-1 serif-h2 text-[24px] text-paper">
          Movimentos por <span className="italic-accent text-accent">dia.</span>
        </h2>
      </header>
      <BarChart data={STOCK_BY_DAY} height={140} />
    </article>
  )
})

const HealthGauge = memo(function HealthGauge() {
  return (
    <article className="card p-6 anim-fade-up" style={{ animationDelay: '720ms' }}>
      <header className="mb-4">
        <span className="label">Saúde do estoque</span>
        <h2 className="mt-1 serif-h2 text-[24px] text-paper">
          <span className="italic-accent text-accent">Acúria.</span>
        </h2>
      </header>
      <div className="flex items-center gap-6">
        <GaugeChart value={86} max={100} label="Acurácia" />
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="label">Sincronizado</span>
              <span className="font-display text-sm text-paper">86%</span>
            </div>
            <div className="h-2 rounded-full bg-bg-3 overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: '86%', boxShadow: '0 0 8px hsl(225 100% 68%)', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="label">Conferido hoje</span>
              <span className="font-display text-sm text-paper">142 itens</span>
            </div>
            <div className="h-2 rounded-full bg-bg-3 overflow-hidden">
              <div className="h-full rounded-full bg-emerald" style={{ width: '64%', boxShadow: '0 0 8px hsl(158 64% 52%)', transition: 'width 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }} />
            </div>
          </div>
        </div>
      </div>
    </article>
  )
})

/* === EXPORT PRINCIPAL === */
type InventoryOverviewProps = {
  onImportSpreadsheet?: () => void
  onImportNfe?: () => void
  onNewProduct?: () => void
}

export function InventoryOverview({
  onImportSpreadsheet,
  onImportNfe,
  onNewProduct,
}: InventoryOverviewProps = {}) {
  return (
    <section className="space-y-6 mb-8">
      {/* Hero header */}
      <header className="card-ink p-8 anim-fade-up relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="status-dot status-dot-blue anim-pulse" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
              Estoque · {TODAY}
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
            SYS.INVENTORY · v4.1
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-end">
          <div>
            <span className="pill pill-accent w-fit">
              <Sparkles className="size-3" /> Visão executiva
            </span>
            <h1 className="mt-5 serif-h1 text-[48px] lg:text-[60px] text-paper">
              Estoque em<br />
              <span className="italic-accent text-gradient-accent">movimento.</span>
            </h1>
            <p className="mt-4 max-w-md font-sans text-[14px] leading-relaxed text-paper-2">
              <span className="font-display text-accent">{TOTAL_ITEMS}</span> SKUs ativos,
              <span className="font-display text-gold"> R$ {TOTAL_VALUE.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span> em valor de estoque.
              Acurácia de <span className="font-display text-emerald">86%</span>, abaixo do mínimo em 7 itens.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2"
              onClick={onImportSpreadsheet}
              title="Importar produtos a partir de uma planilha (CSV/TSV exportado do Excel)"
              data-testid="overview-import-spreadsheet"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Importar planilha
            </button>
            <button
              type="button"
              className="btn-ghost h-10 px-4 text-sm font-semibold flex items-center gap-2"
              onClick={onImportNfe}
              title="Importar produtos a partir do XML da NFe ou texto da DANFE"
              data-testid="overview-import-nfe"
            >
              <FileUp className="h-4 w-4" />
              Importar NFe
            </button>
            <button
              type="button"
              className="btn-ghost h-10 px-4 text-sm font-semibold flex items-center gap-2"
              onClick={onNewProduct}
              title="Criar 1 produto manualmente"
              data-testid="overview-new-product"
            >
              <Plus className="h-4 w-4" />
              Novo produto
            </button>
            <Link
              href="/app/reports"
              className="btn-ghost h-10 px-4 text-sm font-semibold flex items-center gap-2"
              title="Ver relatórios detalhados"
              data-testid="overview-reports"
            >
              <BarChart3 className="h-4 w-4" />
              Ver relatórios
            </Link>
          </div>
        </div>

        <span
          aria-hidden
          className="absolute -bottom-16 -right-4 font-display text-[220px] leading-none text-paper/[0.025] select-none pointer-events-none"
        >
          INV
        </span>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((k, i) => <StockKpi key={k.label} k={k} idx={i} />)}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EvolutionChart />
        </div>
        <CategoryDonut />
      </div>

      {/* Critical + Top + Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
        <CriticalItems />
        <TopMoving />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StockByDayChart />
        <HealthGauge />
      </div>
    </section>
  )
}
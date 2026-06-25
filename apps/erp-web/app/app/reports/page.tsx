'use client'

/**
 * Página de Relatórios de Vendas.
 *
 * UX:
 * - Header com seletor de período (atalhos + customizado)
 * - 4 KPIs grandes (Receita, Pedidos, Ticket Médio, Clientes) com deltas
 * - Gráfico de série temporal (line chart com Recharts)
 * - Gráfico de canais (donut/pie chart)
 * - Gráfico de top produtos (bar chart horizontal)
 * - Tabela de top clientes com ordenação
 * - Botão de exportar CSV
 */
import { useCallback, useMemo, useState } from 'react'
import { ReportsOverview } from '@/components/reports/reports-overview'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import {
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Users,
  Receipt,
  DollarSign,
  ChevronDown,
  CalendarRange,
  RefreshCw,
  AlertCircle,
  Store,
  Crown,
} from 'lucide-react'
import { useFetch } from '@/lib/use-fetch'
import {
  reportsApi,
  centsToBRL,
  formatNumber,
  formatPercent,
  formatDateShort,
  formatDateTime,
  downloadFile,
  getPresetRange,
  rangeDays,
  type PresetKey,
  type PeriodRange,
  type SalesKpis,
  type SalesOverview,
  type TimeseriesResponse,
  type ProductsResponse,
  type ChannelsResponse,
  type CustomersResponse,
  type CustomerSales,
} from '@/lib/api/reports'

// ============ CORES DOS CANAIS ============

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: '#22c55e',
  IFOOD: '#ef4444',
  APP: '#3b82f6',
  BALCAO: '#a855f7',
  MERCADO_LIVRE: '#f59e0b',
  OTHER: '#64748b',
}

function channelColor(channel: string): string {
  return CHANNEL_COLORS[channel] ?? CHANNEL_COLORS.OTHER
}

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    WHATSAPP: 'WhatsApp',
    IFOOD: 'iFood',
    APP: 'App Próprio',
    BALCAO: 'Balcão',
    MERCADO_LIVRE: 'Mercado Livre',
    OTHER: 'Outros',
  }
  return map[channel] ?? channel
}

// ============ PRESETS DE PERÍODO ============

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'thisMonth', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom', label: 'Personalizado' },
]

// ============ COMPONENTE PRINCIPAL ============

export default function ReportsPage() {
  const [preset, setPreset] = useState<PresetKey>('30d')
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)
  const [productsSortBy, setProductsSortBy] = useState<'revenue' | 'quantity'>('revenue')

  const range = useMemo<PeriodRange>(() => getPresetRange(preset, custom), [preset, custom])

  // Chave de cache depende do range — refetch automático ao mudar
  const cacheKey = useMemo(
    () => `reports:${range.from}:${range.to}:${rangeDays(range)}`,
    [range],
  )

  // Fetch dos 5 endpoints
  const overview = useFetch<SalesOverview>(
    `${cacheKey}:overview`,
    () => reportsApi.overview(range.from, range.to),
    { ttl: 30_000 },
  )
  const timeseries = useFetch<TimeseriesResponse>(
    `${cacheKey}:timeseries`,
    () => reportsApi.timeseries(range.from, range.to, rangeDays(range) > 60 ? 'week' : 'day'),
    { ttl: 30_000 },
  )
  const products = useFetch<ProductsResponse>(
    `${cacheKey}:products:${productsSortBy}`,
    () => reportsApi.products(range.from, range.to, { limit: 10, sortBy: productsSortBy }),
    { ttl: 30_000 },
  )
  const channels = useFetch<ChannelsResponse>(
    `${cacheKey}:channels`,
    () => reportsApi.channels(range.from, range.to),
    { ttl: 30_000 },
  )
  const customers = useFetch<CustomersResponse>(
    `${cacheKey}:customers`,
    () => reportsApi.customers(range.from, range.to, 10),
    { ttl: 30_000 },
  )

  const isLoading =
    overview.isLoading && overview.data === undefined

  const refresh = useCallback(async () => {
    await Promise.all([
      overview.mutate(),
      timeseries.mutate(),
      products.mutate(),
      channels.mutate(),
      customers.mutate(),
    ])
  }, [overview, timeseries, products, channels, customers])

  // Ajusta granularidade baseado no range
  const gran = rangeDays(range) > 60 ? 'week' : 'day'

  return (
    <div className="flex flex-1 flex-col gap-6 pb-8">
      <ReportsOverview />

      {/* ===== HEADER ===== */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif-h2 text-[28px] text-paper">Relatórios detalhados</h1>
          <p className="font-sans text-[13px] text-paper-3 mt-1">
            Análise tabular complementar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={overview.isValidating}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Atualizar dados"
          >
            <RefreshCw className={`size-3.5 ${overview.isValidating ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(reportsApi.exportCsv(range.from, range.to))
            }
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-semibold transition-colors"
          >
            <Download className="size-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* ===== SELETOR DE PERÍODO ===== */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <Calendar className="size-3.5" />
            <span className="font-medium">Período:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => {
              const active = preset === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setPreset(p.key)
                    if (p.key !== 'custom') setShowCustom(false)
                    else setShowCustom(true)
                  }}
                  className={`px-3 h-8 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-white/50">
            <span className="font-medium text-white/80">{range.label}</span>
            <span className="text-white/30">·</span>
            <span>{rangeDays(range)} dias</span>
          </div>
        </div>

        {showCustom && (
          <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <CalendarRange className="size-3.5 text-white/40" />
              <span className="text-xs text-white/50">De:</span>
              <input
                type="date"
                value={custom.from}
                max={custom.to || range.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-accent/50 [color-scheme:dark]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Até:</span>
              <input
                type="date"
                value={custom.to}
                min={custom.from}
                max={range.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-accent/50 [color-scheme:dark]"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (custom.from && custom.to) {
                  setPreset('custom')
                }
              }}
              disabled={!custom.from || !custom.to}
              className="px-3 h-8 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium border border-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* ===== ESTADO DE ERRO ===== */}
      {overview.error && (
        <div className="card p-4 border-red-500/30 bg-red-500/[0.05] flex items-start gap-3">
          <AlertCircle className="size-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-red-200">Erro ao carregar relatórios</div>
            <div className="text-xs text-red-300/70 mt-0.5">
              {overview.error.message || 'Tente novamente em alguns instantes.'}
            </div>
          </div>
        </div>
      )}

      {/* ===== KPIs ===== */}
      <KpiGrid
        kpis={overview.data?.kpis ?? null}
        growth={overview.data?.growth ?? null}
        isLoading={isLoading}
      />

      {/* ===== SÉRIE TEMPORAL + CANAIS ===== */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <TimeSeriesCard
          data={timeseries.data?.series ?? null}
          granularity={timeseries.data?.granularity ?? gran}
          isLoading={timeseries.isLoading && !timeseries.data}
        />
        <ChannelsCard
          items={channels.data?.items ?? null}
          isLoading={channels.isLoading && !channels.data}
        />
      </div>

      {/* ===== TOP PRODUTOS ===== */}
      <TopProductsCard
        items={products.data?.items ?? null}
        sortBy={productsSortBy}
        isLoading={products.isLoading && !products.data}
        onChangeSort={setProductsSortBy}
      />

      {/* ===== TOP CLIENTES ===== */}
      <TopCustomersCard
        items={customers.data?.items ?? null}
        isLoading={customers.isLoading && !customers.data}
      />

      {/* ===== FOOTER ===== */}
      <div className="text-[10px] text-white/30 text-center pt-2">
        Dados atualizados em tempo real · {range.from} → {range.to} · período: {rangeDays(range)} dias
      </div>
    </div>
  )
}

// ============ KPI GRID ============

function KpiGrid({
  kpis,
  growth,
  isLoading,
}: {
  kpis: SalesKpis | null
  growth: { revenuePct: number; ordersPct: number } | null
  isLoading: boolean
}) {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={DollarSign}
        label="Receita Total"
        value={centsToBRL(kpis.totalRevenueCents)}
        delta={growth?.revenuePct ?? 0}
        deltaSuffix=" vs período anterior"
        tone="green"
        sub={`${kpis.totalOrders} pedidos concluídos`}
      />
      <KpiCard
        icon={ShoppingBag}
        label="Pedidos"
        value={formatNumber(kpis.totalOrders)}
        delta={growth?.ordersPct ?? 0}
        deltaSuffix=" vs período anterior"
        tone="blue"
        sub={`${kpis.cancelledOrders} cancelados`}
      />
      <KpiCard
        icon={Receipt}
        label="Ticket Médio"
        value={centsToBRL(kpis.avgTicketCents)}
        delta={0}
        deltaSuffix=" vs período anterior"
        tone="amber"
        sub="Por pedido concluído"
        hideDelta
      />
      <KpiCard
        icon={Users}
        label="Clientes Únicos"
        value={formatNumber(kpis.uniqueCustomers)}
        delta={0}
        deltaSuffix=" distintos no período"
        tone="purple"
        sub="Que fizeram pelo menos 1 pedido"
        hideDelta
      />
    </div>
  )
}

type KpiTone = 'green' | 'blue' | 'amber' | 'purple' | 'red'

const TONE_MAP: Record<KpiTone, { color: string; bg: string; border: string }> = {
  green: { color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.20)' },
  blue: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.20)' },
  amber: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
  purple: { color: '#a855f7', bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.20)' },
  red: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.20)' },
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaSuffix,
  tone,
  sub,
  hideDelta,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  delta: number
  deltaSuffix: string
  tone: KpiTone
  sub: string
  hideDelta?: boolean
}) {
  const t = TONE_MAP[tone]
  const isUp = delta > 0
  const isDown = delta < 0
  const isFlat = !isUp && !isDown
  const arrow = isUp ? <TrendingUp className="size-3" /> : isDown ? <TrendingDown className="size-3" /> : null
  const deltaColor = isUp ? '#22c55e' : isDown ? '#ef4444' : '#94a3b8'
  const deltaBg = isUp ? 'rgba(34,197,94,0.12)' : isDown ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)'

  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 size-32 -mr-8 -mt-8 rounded-full opacity-30 blur-2xl" style={{ background: t.bg }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div
            className="size-9 rounded-xl flex items-center justify-center"
            style={{ background: t.bg, border: `1px solid ${t.border}` }}
          >
            <Icon className="size-4" style={{ color: t.color }} />
          </div>
          {!hideDelta && !isFlat && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums"
              style={{ color: deltaColor, background: deltaBg }}
            >
              {arrow}
              <span>{formatPercent(Math.abs(delta))}</span>
            </div>
          )}
          {hideDelta && (
            <div
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: t.color, background: t.bg }}
            >
              {tone === 'green' ? 'Receita' : tone === 'blue' ? 'Volume' : tone === 'amber' ? 'Médio' : 'Base'}
            </div>
          )}
        </div>
        <div className="text-2xl font-black tracking-tight text-white tabular-nums">{value}</div>
        <div className="text-[11px] text-white/40 mt-1">{label}</div>
        <div className="text-[10px] text-white/30 mt-0.5">
          {!hideDelta ? deltaSuffix : sub}
        </div>
      </div>
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="size-9 rounded-xl bg-white/[0.05] animate-pulse" />
        <div className="w-12 h-5 rounded-md bg-white/[0.05] animate-pulse" />
      </div>
      <div className="h-7 w-32 bg-white/[0.05] rounded animate-pulse mb-2" />
      <div className="h-3 w-20 bg-white/[0.03] rounded animate-pulse" />
    </div>
  )
}

// ============ TIME SERIES CARD ============

function TimeSeriesCard({
  data,
  granularity,
  isLoading,
}: {
  data: { date: string; revenueCents: number; orders: number; customers: number }[] | null
  granularity: 'day' | 'week'
  isLoading: boolean
}) {
  const chartData = useMemo(() => {
    if (!data) return []
    return data.map((p) => ({
      ...p,
      label: granularity === 'week' ? `sem ${formatDateShort(p.date)}` : formatDateShort(p.date),
    }))
  }, [data, granularity])

  const totalRevenue = useMemo(() => {
    if (!data) return 0
    return data.reduce((s, p) => s + p.revenueCents, 0)
  }, [data])

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="size-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.20)' }}
            >
              <TrendingUp className="size-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Evolução de Receita</h3>
              <p className="text-[10px] text-white/40">
                {granularity === 'week' ? 'Por semana' : 'Por dia'} · {chartData.length} pontos
              </p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Total no período</div>
          <div className="text-base font-black text-white tabular-nums">{centsToBRL(totalRevenue)}</div>
        </div>
      </div>

      <div className="h-[280px] w-full">
        {isLoading ? (
          <div className="size-full flex items-center justify-center">
            <div className="text-xs text-white/40">Carregando dados...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="size-full flex items-center justify-center">
            <div className="text-xs text-white/40">Nenhum dado no período</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.3)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `R$${(v / 100).toFixed(0)}`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}
                formatter={(value: number, key: string) => {
                  if (key === 'revenueCents') return [centsToBRL(value), 'Receita']
                  if (key === 'orders') return [formatNumber(value), 'Pedidos']
                  return [value, key]
                }}
              />
              <Line
                type="monotone"
                dataKey="revenueCents"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ============ CHANNELS CARD ============

function ChannelsCard({
  items,
  isLoading,
}: {
  items: { channel: string; orders: number; revenueCents: number; percentage: number }[] | null
  isLoading: boolean
}) {
  const sorted = useMemo(() => {
    if (!items) return []
    return [...items].sort((a, b) => b.revenueCents - a.revenueCents)
  }, [items])

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="size-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.20)' }}
          >
            <Store className="size-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Vendas por Canal</h3>
            <p className="text-[10px] text-white/40">Distribuição da receita</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[280px] flex items-center justify-center">
          <div className="text-xs text-white/40">Carregando...</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center">
          <div className="text-xs text-white/40">Sem dados no período</div>
        </div>
      ) : (
        <>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="revenueCents"
                  nameKey="channel"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="rgba(15,23,42,1)"
                  strokeWidth={2}
                >
                  {sorted.map((c) => (
                    <Cell key={c.channel} fill={channelColor(c.channel)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(value: number, _name: string, item) => {
                    const ch = (item?.payload?.channel as string) ?? ''
                    return [centsToBRL(value), channelLabel(ch)]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {sorted.map((c) => (
              <div key={c.channel} className="flex items-center gap-3 text-xs">
                <div
                  className="size-2.5 rounded-sm shrink-0"
                  style={{ background: channelColor(c.channel) }}
                />
                <span className="text-white/70 flex-1 truncate">{channelLabel(c.channel)}</span>
                <span className="text-white/40 tabular-nums">{c.orders} pedidos</span>
                <span className="font-semibold text-white tabular-nums w-20 text-right">
                  {formatPercent(c.percentage, 1)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============ TOP PRODUCTS CARD ============

function TopProductsCard({
  items,
  sortBy,
  isLoading,
  onChangeSort,
}: {
  items: { productId: string; productName: string; quantitySold: number; revenueCents: number; orders: number }[] | null
  sortBy: 'revenue' | 'quantity'
  isLoading: boolean
  onChangeSort: (sortBy: 'revenue' | 'quantity') => void
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="size-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.20)' }}
          >
            <Crown className="size-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Produtos Mais Vendidos</h3>
            <p className="text-[10px] text-white/40">Top 10 no período</p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <button
            type="button"
            onClick={() => onChangeSort('revenue')}
            className={`px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors ${
              sortBy === 'revenue'
                ? 'bg-accent/15 text-accent'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Receita
          </button>
          <button
            type="button"
            onClick={() => onChangeSort('quantity')}
            className={`px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors ${
              sortBy === 'quantity'
                ? 'bg-accent/15 text-accent'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Quantidade
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-xs text-white/40">Carregando...</div>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-xs text-white/40">Sem vendas no período</div>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={items}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis
                type="number"
                stroke="rgba(255,255,255,0.3)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  sortBy === 'revenue' ? `R$${(v / 100).toFixed(0)}` : `${v}`
                }
              />
              <YAxis
                type="category"
                dataKey="productName"
                stroke="rgba(255,255,255,0.5)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={130}
                interval={0}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(value: number) => {
                  if (sortBy === 'revenue') return [centsToBRL(value), 'Receita']
                  return [formatNumber(value), 'Quantidade']
                }}
              />
              <Bar
                dataKey={sortBy === 'revenue' ? 'revenueCents' : 'quantitySold'}
                fill="#f59e0b"
                radius={[0, 4, 4, 0]}
                background={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ============ TOP CUSTOMERS CARD ============

type SortKey = 'revenue' | 'orders' | 'name' | 'lastOrder'

function TopCustomersCard({
  items,
  isLoading,
}: {
  items: CustomerSales[] | null
  isLoading: boolean
}) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = useMemo(() => {
    if (!items) return []
    const arr = [...items]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'revenue') cmp = a.revenueCents - b.revenueCents
      else if (sortKey === 'orders') cmp = a.orders - b.orders
      else if (sortKey === 'name') {
        const an = (a.customerName ?? '').toLowerCase()
        const bn = (b.customerName ?? '').toLowerCase()
        cmp = an.localeCompare(bn)
      } else if (sortKey === 'lastOrder') {
        cmp = Date.parse(a.lastOrderAt) - Date.parse(b.lastOrderAt)
      }
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [items, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div
            className="size-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.20)' }}
          >
            <Users className="size-4 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Top Clientes</h3>
            <p className="text-[10px] text-white/40">Ordenado por receita</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-white/40">Carregando...</div>
      ) : !sorted || sorted.length === 0 ? (
        <div className="p-12 text-center text-xs text-white/40">
          Nenhum cliente com pedido no período
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-white/40 uppercase tracking-wider border-b border-white/[0.05]">
                <SortHeader label="#" className="w-12" />
                <SortHeader label="Cliente" sortKey="name" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortHeader label="Pedidos" sortKey="orders" current={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Receita" sortKey="revenue" current={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Última compra" sortKey="lastOrder" current={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, idx) => (
                <tr
                  key={c.customerKey}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-5 py-3 text-xs text-white/40 tabular-nums w-12">
                    <span
                      className={`inline-flex items-center justify-center size-5 rounded-md text-[10px] font-bold ${
                        idx < 3 ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.04] text-white/50'
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase"
                        style={{ background: 'rgba(34,197,94,0.10)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.20)' }}
                      >
                        {(c.customerName ?? '?').slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-sm text-white font-medium">{c.customerName ?? '(sem nome)'}</div>
                        <div className="text-[10px] text-white/30">{c.customerKey}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-white/70 text-right tabular-nums">
                    {formatNumber(c.orders)}
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-white text-right tabular-nums">
                    {centsToBRL(c.revenueCents)}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-white/50 text-right tabular-nums">
                    {formatDateTime(c.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  current,
  asc,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string
  sortKey?: SortKey
  current?: SortKey
  asc?: boolean
  onSort?: (k: SortKey) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = sortKey && current === sortKey
  const isInteractive = sortKey && onSort

  return (
    <th
      className={`px-5 py-2.5 font-semibold ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {isInteractive ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
            active ? 'text-accent' : ''
          } ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          {active && (
            <ChevronDown
              className={`size-3 transition-transform ${asc ? 'rotate-180' : ''}`}
            />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  )
}

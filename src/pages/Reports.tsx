import { apiFetch } from '@/lib/apiClient'
import { formatMoney } from '@/lib/format'
import { useSessionStore } from '@/stores/sessionStore'
import StatCard from '@/components/ui/StatCard'
import { AreaChart, DonutChart, BarList, type DonutSegment } from '@/components/ui/charts'
import { CHART_PALETTE } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { ArrowDownRight, ArrowUpRight, Download, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Overview = {
  range: { fromMs: number; toMs: number; days: number }
  kpis: { totalRevenueCents: number; totalOrders: number; avgTicketCents: number; uniqueCustomers: number; cancelledOrders: number }
  growth: { revenuePct: number; ordersPct: number }
}
type Timeseries = { granularity: string; series: { date: string; revenueCents: number; orders: number; customers: number }[] }
type ProductSales = { productId: string; productName: string; quantitySold: number; revenueCents: number; orders: number }
type Channels = { items: { channel: string; orders: number; revenueCents: number; percentage: number }[]; totalRevenueCents: number }
type Customers = { items: { customerKey: string; customerName: string | null; orders: number; revenueCents: number; lastOrderAt: string }[] }

type PresetKey = '7d' | '30d' | 'thisMonth' | 'lastMonth'
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'thisMonth', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
]

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function presetRange(preset: PresetKey): { from: string; to: string } {
  const now = new Date()
  switch (preset) {
    case '7d':
      return { from: toISODate(new Date(now.getTime() - 6 * 864e5)), to: toISODate(now) }
    case '30d':
      return { from: toISODate(new Date(now.getTime() - 29 * 864e5)), to: toISODate(now) }
    case 'thisMonth':
      return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastPrev = new Date(first.getTime() - 1)
      return { from: toISODate(new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1)), to: toISODate(lastPrev) }
    }
  }
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '0%'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function formatDateShort(iso: string): string {
  const parts = iso.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso
}

function Growth({ pct }: { pct: number }) {
  const up = pct >= 0
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono text-[11px] font-semibold', up ? 'text-app-success' : 'text-rose-300')}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {formatPct(pct)} vs período anterior
    </span>
  )
}

export default function Reports() {
  const [preset, setPreset] = useState<PresetKey>('30d')
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity'>('revenue')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [timeseries, setTimeseries] = useState<Timeseries | null>(null)
  const [products, setProducts] = useState<ProductSales[]>([])
  const [channels, setChannels] = useState<Channels | null>(null)
  const [customers, setCustomers] = useState<Customers['items']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const range = useMemo(() => presetRange(preset), [preset])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = `from=${range.from}&to=${range.to}`
    Promise.all([
      apiFetch<Overview>(`/api/v1/reports/sales/overview?${qs}`),
      apiFetch<Timeseries>(`/api/v1/reports/sales/timeseries?${qs}&granularity=day`),
      apiFetch<{ sortBy: string; items: ProductSales[] }>(`/api/v1/reports/sales/products?${qs}&limit=8&sortBy=${sortBy}`),
      apiFetch<Channels>(`/api/v1/reports/sales/channels?${qs}`),
      apiFetch<Customers>(`/api/v1/reports/sales/customers?${qs}&limit=8`),
    ])
      .then(([ov, ts, pr, ch, cu]) => {
        if (cancelled) return
        setOverview(ov)
        setTimeseries(ts)
        setProducts(pr.items)
        setChannels(ch)
        setCustomers(cu.items)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Falha ao carregar relatórios'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range, sortBy])

  useEffect(() => load(), [load])

  const exportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const { token, me } = useSessionStore.getState()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      if (me?.tenantId) headers['X-Tenant-Id'] = me.tenantId
      if (me?.branchId) headers['X-Branch-Id'] = me.branchId
      const res = await fetch(`/api/v1/reports/sales/export?from=${range.from}&to=${range.to}&format=csv`, { headers })
      if (!res.ok) throw new Error('Falha na exportação')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `garciat-relatorio-${range.from}_a_${range.to}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na exportação')
    } finally {
      setExporting(false)
    }
  }, [range])

  const revenueSeries = useMemo(() => (timeseries?.series ?? []).map((p) => p.revenueCents / 100), [timeseries])
  const channelSegments = useMemo<DonutSegment[]>(
    () => (channels?.items ?? []).map((c, i) => ({ label: c.channel, value: c.revenueCents, color: CHART_PALETTE[i % CHART_PALETTE.length] })),
    [channels],
  )
  const productRows = useMemo(
    () =>
      products.map((p) => ({
        label: p.productName,
        value: sortBy === 'revenue' ? p.revenueCents : p.quantitySold,
        hint: sortBy === 'revenue' ? formatMoney(p.revenueCents) : `${p.quantitySold} un`,
      })),
    [products, sortBy],
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="ui-label">Inteligência · Relatórios de vendas</div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-app-text">
            Análise de <span className="text-app-primary">desempenho</span>
          </h1>
          <p className="mt-1 text-sm text-app-muted">Receita, ticket médio, canais e produtos líderes no período.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} className="ui-btn ui-btn-ghost text-app-muted hover:text-app-text" disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Atualizar
          </button>
          <button type="button" onClick={exportCsv} className="ui-btn ui-btn-primary" disabled={exporting || loading}>
            <Download className="size-4" />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </header>

      <div className="ui-segmented w-fit">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={cn('ui-segmented-item', preset === p.key && 'ui-segmented-item-active')}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>}

      {loading && !overview ? (
        <div className="text-sm text-app-muted">Carregando…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Receita total" value={formatMoney(overview?.kpis.totalRevenueCents ?? 0)} tone="good" hint=" " />
            <StatCard label="Pedidos" value={`${overview?.kpis.totalOrders ?? 0}`} tone="neutral" hint={`${overview?.kpis.cancelledOrders ?? 0} cancelados`} />
            <StatCard label="Ticket médio" value={formatMoney(overview?.kpis.avgTicketCents ?? 0)} tone="warn" hint=" " />
            <StatCard label="Clientes únicos" value={`${overview?.kpis.uniqueCustomers ?? 0}`} tone="neutral" hint="no período" />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Growth pct={overview?.growth.revenuePct ?? 0} />
            <span className="text-xs text-app-muted">Período: {formatDateShort(range.from)} → {formatDateShort(range.to)}</span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="ui-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-app-text">Evolução da receita</div>
                <div className="font-display text-lg font-bold text-app-text">{formatMoney(overview?.kpis.totalRevenueCents ?? 0)}</div>
              </div>
              <AreaChart data={revenueSeries} height={180} />
            </div>
            <div className="ui-panel p-5">
              <div className="mb-4 text-sm font-semibold text-app-text">Vendas por canal</div>
              <DonutChart segments={channelSegments} centerValue={`${channels?.items.length ?? 0}`} centerLabel="canais" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="ui-panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-app-text">Produtos mais vendidos</div>
                <div className="ui-segmented">
                  <button type="button" onClick={() => setSortBy('revenue')} className={cn('ui-segmented-item', sortBy === 'revenue' && 'ui-segmented-item-active')}>
                    Receita
                  </button>
                  <button type="button" onClick={() => setSortBy('quantity')} className={cn('ui-segmented-item', sortBy === 'quantity' && 'ui-segmented-item-active')}>
                    Quantidade
                  </button>
                </div>
              </div>
              <BarList rows={productRows} />
            </div>

            <div className="ui-panel overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="text-sm font-semibold text-app-text">Top clientes</div>
                <div className="text-xs text-app-muted">por receita</div>
              </div>
              <div className="ui-divider">
                {customers.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-app-muted">Sem clientes no período</div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-app-border">
                        <th className="px-5 py-2 ui-label font-semibold">#</th>
                        <th className="px-5 py-2 ui-label font-semibold">Cliente</th>
                        <th className="px-5 py-2 ui-label font-semibold text-right">Pedidos</th>
                        <th className="px-5 py-2 ui-label font-semibold text-right">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c, i) => (
                        <tr key={c.customerKey} className="border-b border-app-border last:border-0 hover:bg-app-s2/60">
                          <td className="px-5 py-3 font-mono text-sm text-app-muted">{String(i + 1).padStart(2, '0')}</td>
                          <td className="px-5 py-3 text-sm text-app-text">{c.customerName ?? 'Cliente'}</td>
                          <td className="px-5 py-3 text-right font-mono text-sm text-app-muted">{c.orders}</td>
                          <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-app-text">{formatMoney(c.revenueCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

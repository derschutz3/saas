'use client'

/**
 * Histórico de Pedidos — visão de gestão.
 *
 * Features:
 * - Filtros: período (atalhos + custom), canal, status, busca textual
 * - Tabela com ordenação por coluna
 * - KPIs: total de pedidos, receita, ticket médio, cancelados
 * - Drawer lateral abre ao clicar em um pedido (mesmo componente da fila)
 * - Exportação CSV client-side
 * - Paginação
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  X,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Receipt,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Calendar,
  Phone,
  MapPin,
  ChevronRight as ChevronRightIcon,
  ArrowUpDown,
} from 'lucide-react'
import { useFetch } from '@/lib/use-fetch'
import {
  ordersApi,
  centsToBRL,
  formatDateTime,
  formatPhone,
  orderShortId,
  timeAgo,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_TRANSITIONS,
  CHANNEL_LABELS,
  TONE_BG,
  type Order,
  type OrderChannel,
  type OrderStatus,
} from '@/lib/api/orders'

const CHANNEL_OPTIONS: { key: OrderChannel | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'balcao', label: 'Balcão' },
  { key: 'ifood', label: 'iFood' },
  { key: 'rappi', label: 'Rappi' },
  { key: '99eats', label: '99 Eats' },
  { key: 'site', label: 'Site' },
]

const STATUS_OPTIONS: { key: OrderStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'RECEBIDO', label: 'Recebido' },
  { key: 'CONFIRMADO', label: 'Confirmado' },
  { key: 'EM_SEPARACAO', label: 'Em separação' },
  { key: 'SEPARADO', label: 'Separado' },
  { key: 'SAIU_PARA_ENTREGA', label: 'Saiu p/ entrega' },
  { key: 'ENTREGUE', label: 'Entregue' },
  { key: 'CANCELADO', label: 'Cancelado' },
]

const PAGE_SIZE = 20

type SortKey = 'createdAt' | 'customer' | 'channel' | 'status' | 'total'

export default function OrdersHistoryPage() {
  // ===== FILTROS =====
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<OrderChannel | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [preset, setPreset] = useState<'all' | '7d' | '30d' | '90d' | 'custom'>('all')
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>({ from: '', to: '' })

  // ===== TABELA =====
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)

  // ===== DRAWER =====
  const [selected, setSelected] = useState<Order | null>(null)

  // Computa range de datas
  const range = useMemo(() => {
    const now = new Date()
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    if (preset === 'all') return { from: null, to: null }
    if (preset === '7d') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
      return { from: start, to: endOfToday }
    }
    if (preset === '30d') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
      return { from: start, to: endOfToday }
    }
    if (preset === '90d') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89, 0, 0, 0, 0)
      return { from: start, to: endOfToday }
    }
    // custom
    if (customRange.from && customRange.to) {
      return {
        from: new Date(`${customRange.from}T00:00:00`),
        to: new Date(`${customRange.to}T23:59:59`),
      }
    }
    return { from: null, to: null }
  }, [preset, customRange])

  // ===== FETCH =====
  // Pede todos os pedidos; filtros são aplicados client-side para suportar data + busca
  const apiFilters: { status?: OrderStatus; channel?: OrderChannel } = {}
  if (statusFilter !== 'ALL') apiFilters.status = statusFilter
  if (channel !== 'ALL') apiFilters.channel = channel

  const cacheKey = `orders:history:${JSON.stringify(apiFilters)}`

  const { data, mutate, isLoading } = useFetch<{ items: Order[] }>(
    cacheKey,
    () => ordersApi.list(apiFilters),
    { ttl: 30_000, revalidateOnFocus: true },
  )

  // ===== FILTRAGEM LOCAL =====
  const allOrders = useMemo(() => data?.items ?? [], [data])

  const filtered = useMemo(() => {
    let arr = allOrders
    // período
    if (range.from || range.to) {
      arr = arr.filter((o) => {
        const t = new Date(o.createdAt).getTime()
        if (range.from && t < range.from.getTime()) return false
        if (range.to && t > range.to.getTime()) return false
        return true
      })
    }
    // busca textual (id, cliente, telefone)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter((o) => {
        return (
          o.id.toLowerCase().includes(q) ||
          (o.customerName ?? '').toLowerCase().includes(q) ||
          (o.customerPhone ?? '').toLowerCase().includes(q) ||
          (o.deliveryAddress ?? '').toLowerCase().includes(q)
        )
      })
    }
    return arr
  }, [allOrders, range, search])

  // ===== ORDENAÇÃO =====
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'total':
          cmp = a.totalCents - b.totalCents
          break
        case 'customer':
          cmp = (a.customerName ?? '').localeCompare(b.customerName ?? '')
          break
        case 'channel':
          cmp = a.channel.localeCompare(b.channel)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortAsc])

  // ===== KPIs =====
  const kpis = useMemo(() => {
    let revenueCents = 0
    let count = 0
    let cancelled = 0
    for (const o of filtered) {
      if (o.status === 'CANCELADO') {
        cancelled++
        continue
      }
      revenueCents += o.totalCents
      count++
    }
    return {
      revenueCents,
      orders: count,
      avgTicket: count > 0 ? Math.round(revenueCents / count) : 0,
      cancelled,
    }
  }, [filtered])

  // ===== PAGINAÇÃO =====
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE)

  // Reset page se filtros mudaram
  useEffect(() => {
    setPage(1)
  }, [search, channel, statusFilter, preset, customRange])

  // ===== EXPORT CSV =====
  const handleExport = useCallback(() => {
    const headers = [
      'ID',
      'Data',
      'Status',
      'Canal',
      'Cliente',
      'Telefone',
      'Endereço',
      'Itens',
      'Subtotal (R$)',
      'Total (R$)',
    ]
    const rows = sorted.map((o) => [
      o.id,
      formatDateTime(o.createdAt),
      STATUS_LABELS[o.status],
      CHANNEL_LABELS[o.channel as OrderChannel],
      o.customerName ?? '',
      o.customerPhone ?? '',
      o.deliveryAddress ?? '',
      String(o.items.length),
      (o.subtotalCents / 100).toFixed(2).replace('.', ','),
      (o.totalCents / 100).toFixed(2).replace('.', ','),
    ])
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell)
            return s.includes('"') || s.includes(';') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"`
              : s
          })
          .join(';'),
      )
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [sorted])

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((v) => !v)
    else {
      setSortKey(k)
      setSortAsc(false)
    }
  }

  // Esc fecha o drawer; lock do scroll quando aberto
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [selected])

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pedidos</h1>
          <p className="text-sm text-white/50 mt-1">
            Histórico completo · {filtered.length} pedido{filtered.length === 1 ? '' : 's'}
            {filtered.length !== allOrders.length && (
              <span className="text-white/30"> de {allOrders.length}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors"
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={sorted.length === 0}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="size-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="Receita (não cancelados)"
          value={centsToBRL(kpis.revenueCents)}
          tone="green"
        />
        <Kpi
          icon={ShoppingBag}
          label="Pedidos"
          value={String(kpis.orders)}
          tone="blue"
        />
        <Kpi
          icon={Receipt}
          label="Ticket médio"
          value={centsToBRL(kpis.avgTicket)}
          tone="amber"
        />
        <Kpi
          icon={TrendingDown}
          label="Cancelados"
          value={String(kpis.cancelled)}
          tone="red"
        />
      </div>

      {/* FILTROS */}
      <div className="card p-4 space-y-3">
        {/* Linha 1: busca + status + canal */}
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID, cliente, telefone, endereço…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 size-5 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.05]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as OrderStatus | 'ALL')}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Canal"
            value={channel}
            onChange={(v) => setChannel(v as OrderChannel | 'ALL')}
            options={CHANNEL_OPTIONS}
          />
        </div>

        {/* Linha 2: período */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40 mr-2 font-semibold inline-flex items-center gap-1.5">
            <Calendar className="size-3" />
            Período
          </span>
          {(
            [
              { key: 'all', label: 'Todos' },
              { key: '7d', label: '7 dias' },
              { key: '30d', label: '30 dias' },
              { key: '90d', label: '90 dias' },
              { key: 'custom', label: 'Personalizado' },
            ] as { key: 'all' | '7d' | '30d' | '90d' | 'custom'; label: string }[]
          ).map((p) => {
            const active = preset === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`px-3 h-7 rounded-lg text-[11px] font-medium transition-colors ${
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

        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/50">De:</span>
              <input
                type="date"
                value={customRange.from}
                max={customRange.to || undefined}
                onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
                className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-accent/50 [color-scheme:dark]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/50">Até:</span>
              <input
                type="date"
                value={customRange.to}
                min={customRange.from || undefined}
                onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
                className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-accent/50 [color-scheme:dark]"
              />
            </div>
          </div>
        )}

        {/* Filtros ativos (chips removíveis) */}
        {hasActiveFilters(search, channel, statusFilter, preset) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-white/30">Filtros ativos:</span>
            {search && <Chip onClear={() => setSearch('')}>{`"${search}"`}</Chip>}
            {channel !== 'ALL' && (
              <Chip onClear={() => setChannel('ALL')}>{CHANNEL_LABELS[channel as OrderChannel]}</Chip>
            )}
            {statusFilter !== 'ALL' && (
              <Chip onClear={() => setStatusFilter('ALL')}>{STATUS_LABELS[statusFilter]}</Chip>
            )}
            {preset !== 'all' && (
              <Chip onClear={() => setPreset('all')}>
                {preset === 'custom'
                  ? `${customRange.from || '?'} → ${customRange.to || '?'}`
                  : `${preset === '7d' ? '7 dias' : preset === '30d' ? '30 dias' : '90 dias'}`}
              </Chip>
            )}
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setChannel('ALL')
                setStatusFilter('ALL')
                setPreset('all')
                setCustomRange({ from: '', to: '' })
              }}
              className="text-[10px] text-accent hover:underline ml-1"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {/* TABELA */}
      <div className="card overflow-hidden">
        {isLoading && !data ? (
          <div className="p-12 text-center text-xs text-white/40">Carregando pedidos…</div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <Filter className="size-8 text-white/20 mx-auto mb-3" />
            <div className="text-sm text-white/60">Nenhum pedido encontrado</div>
            <div className="text-[11px] text-white/30 mt-1">
              Ajuste os filtros ou amplie o período
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-white/40 uppercase tracking-wider border-b border-white/[0.05]">
                    <SortHeader
                      label="Pedido"
                      sortKey="createdAt"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Cliente"
                      sortKey="customer"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Canal"
                      sortKey="channel"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Status"
                      sortKey="status"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-2.5 text-right font-semibold">Itens</th>
                    <SortHeader
                      label="Total"
                      sortKey="total"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                      align="right"
                    />
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((o) => {
                    const tone = STATUS_TONE[o.status]
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                        onClick={() => setSelected(o)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-xs font-bold text-white tabular-nums">
                            #{orderShortId(o.id)}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {formatDateTime(o.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-white font-medium truncate max-w-[200px]">
                            {o.customerName ?? '(sem nome)'}
                          </div>
                          {o.customerPhone && (
                            <div className="text-[10px] text-white/40 mt-0.5 tabular-nums">
                              {formatPhone(o.customerPhone)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${TONE_BG['gray']}`}
                          >
                            {CHANNEL_LABELS[o.channel as OrderChannel]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                          >
                            {STATUS_LABELS[o.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-white/60 tabular-nums">
                          {o.items.length}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-white tabular-nums">
                          {centsToBRL(o.totalCents)}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRightIcon className="size-3.5 text-white/30" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINAÇÃO */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
                <div className="text-[11px] text-white/40">
                  Mostrando <span className="text-white/60 font-semibold">{pageStart + 1}</span>–
                  <span className="text-white/60 font-semibold">
                    {Math.min(pageStart + PAGE_SIZE, sorted.length)}
                  </span>{' '}
                  de <span className="text-white/60 font-semibold">{sorted.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="size-7 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  {pageNumbers(safePage, totalPages).map((n, i) =>
                    n === '…' ? (
                      <span key={`gap-${i}`} className="px-1 text-white/30 text-xs">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={`size-7 rounded-md text-xs font-semibold transition-colors ${
                          safePage === n
                            ? 'bg-accent/15 text-accent'
                            : 'text-white/50 hover:text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {n}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="size-7 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* DRAWER */}
      {selected && (
        <OrderDrawer
          order={selected}
          onClose={() => setSelected(null)}
          onChange={(updated) => {
            setSelected(updated)
            mutate()
          }}
        />
      )}
    </div>
  )
}

// ============ KPI ============

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Receipt
  label: string
  value: string
  tone: 'green' | 'blue' | 'amber' | 'red'
}) {
  const colorMap: Record<typeof tone, { color: string; bg: string; border: string }> = {
    green: { color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.20)' },
    blue: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.20)' },
    amber: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
    red: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.20)' },
  }
  const t = colorMap[tone]
  return (
    <div className="card p-4 flex items-center gap-3">
      <div
        className="size-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: t.bg, border: `1px solid ${t.border}` }}
      >
        <Icon className="size-4" style={{ color: t.color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          {label}
        </div>
        <div className="text-lg font-black text-white tabular-nums">{value}</div>
      </div>
    </div>
  )
}

// ============ FILTER SELECT ============

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { key: T; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none h-9 pl-3 pr-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-accent/50 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key} className="bg-slate-900">
            {label}: {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="size-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
    </div>
  )
}

// ============ SORT HEADER ============

function SortHeader({
  label,
  sortKey,
  current,
  asc,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = current === sortKey
  return (
    <th className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
          active ? 'text-accent' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        {active ? (
          <ChevronDown className={`size-3 transition-transform ${asc ? 'rotate-180' : ''}`} />
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </th>
  )
}

// ============ CHIP ============

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-accent/10 text-accent text-[10px] font-medium border border-accent/20">
      {children}
      <button
        type="button"
        onClick={onClear}
        className="size-3.5 rounded flex items-center justify-center hover:bg-accent/20"
        aria-label="Remover filtro"
      >
        <X className="size-2.5" />
      </button>
    </span>
  )
}

function hasActiveFilters(
  search: string,
  channel: string,
  status: string,
  preset: string,
): boolean {
  return !!(search || channel !== 'ALL' || status !== 'ALL' || preset !== 'all')
}

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

// ============ DRAWER (mesmo padrão visual da fila) ============

function OrderDrawer({
  order,
  onClose,
  onChange,
}: {
  order: Order
  onClose: () => void
  onChange: (updated: Order) => void
}) {
  const tone = STATUS_TONE[order.status]
  const next = STATUS_TRANSITIONS[order.status] ?? []
  const [busy, setBusy] = useState(false)

  const handleTransition = async (target: OrderStatus) => {
    setBusy(true)
    try {
      const res = await ordersApi.updateStatus(order.id, target)
      const updated: Order = res.order ?? { ...order, status: target }
      onChange(updated)
    } catch {
      // silencioso — fila não está aberta para confirmar
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-slate-900 border-l border-white/[0.08] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.05]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-base font-bold text-white">#{orderShortId(order.id)}</span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
              >
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <div className="text-xs text-white/50 flex items-center gap-1.5 flex-wrap">
              <span>{CHANNEL_LABELS[order.channel as OrderChannel]}</span>
              <span>·</span>
              <span>{formatDateTime(order.createdAt)}</span>
              <span>·</span>
              <span>{timeAgo(order.createdAt)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Cliente
            </div>
            <div className="card p-3 space-y-1.5">
              <div className="text-sm font-semibold text-white">
                {order.customerName ?? '(sem nome)'}
              </div>
              {order.customerPhone && (
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Phone className="size-3" />
                  {formatPhone(order.customerPhone)}
                </div>
              )}
              {order.deliveryAddress && (
                <div className="flex items-start gap-2 text-xs text-white/60">
                  <MapPin className="size-3 mt-0.5 shrink-0" />
                  <span>{order.deliveryAddress}</span>
                </div>
              )}
              {!order.customerPhone && !order.deliveryAddress && (
                <div className="text-xs text-white/30">Sem dados de contato</div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                Itens ({order.items.length})
              </div>
            </div>
            <div className="space-y-1.5">
              {order.items.map((it) => (
                <div key={it.id} className="card p-3">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="text-sm text-white font-medium min-w-0 flex-1">
                      {it.productName}
                    </div>
                    <div className="text-sm font-bold text-white tabular-nums shrink-0">
                      {centsToBRL(it.totalCents)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/50">
                    <span>
                      {it.quantity} {it.unitLabel} × {centsToBRL(it.unitPriceCents)}
                    </span>
                    <span className="font-mono text-[10px] text-white/30">
                      {it.unitCode}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="card p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50">Subtotal</span>
                <span className="text-white tabular-nums">
                  {centsToBRL(order.subtotalCents)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.05]">
                <span className="text-sm font-semibold text-white">Total</span>
                <span className="text-base font-black text-white tabular-nums">
                  {centsToBRL(order.totalCents)}
                </span>
              </div>
            </div>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Datas
            </div>
            <div className="card p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-white/50">Criado</span>
                <span className="text-white/80">{formatDateTime(order.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Atualizado</span>
                <span className="text-white/80">{formatDateTime(order.updatedAt)}</span>
              </div>
            </div>
          </section>
        </div>

        {next.length > 0 && (
          <div className="p-5 border-t border-white/[0.05] space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Avançar status
            </div>
            <div className="flex gap-2">
              {next.map((s) => {
                const isCancel = s === 'CANCELADO'
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleTransition(s)}
                    disabled={busy}
                    className={`flex-1 h-10 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      isCancel
                        ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30'
                        : 'bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30'
                    }`}
                  >
                    {isCancel ? 'Cancelar' : STATUS_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

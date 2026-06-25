'use client'

/**
 * Financeiro — Contas a Receber.
 *
 * - 4 KPIs (A receber / Em atraso / Vence hoje / Recebido no mês)
 * - Filtros: status (Todos / Em aberto / Recebidos / Em atraso) + busca por id
 * - Tabela com ordenação: vencimento, valor, status
 * - Drawer com detalhes do título e botão "Receber agora"
 * - Após receber, atualiza a linha via mutate()
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  Search,
  X,
  Download,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  ChevronDown,
  Hash,
  ChevronRight as ChevronRightIcon,
  Receipt,
} from 'lucide-react'
import { useFetch } from '@/lib/use-fetch'
import {
  financeApi,
  centsToBRL,
  arShortId,
  formatDate,
  formatDateTime,
  dueInfo,
  AR_STATUS_LABELS,
  AR_STATUS_TONE,
  TONE_BG,
  type AccountReceivable,
  type ARStatus,
} from '@/lib/api/finance'

const STATUS_FILTERS: { key: ARStatus | 'ALL' | 'OVERDUE'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'OPEN', label: 'Em aberto' },
  { key: 'OVERDUE', label: 'Em atraso' },
  { key: 'SETTLED', label: 'Recebidos' },
  { key: 'CANCELLED', label: 'Cancelados' },
]

type SortKey = 'dueDate' | 'amount' | 'status' | 'createdAt'

const PAGE_SIZE = 20

export default function FinancePage() {
  const [statusFilter, setStatusFilter] = useState<ARStatus | 'ALL' | 'OVERDUE'>('ALL')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AccountReceivable | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // API recebe status quando aplicável (OVERDUE é client-side)
  const apiStatus: ARStatus | undefined =
    statusFilter === 'ALL' || statusFilter === 'OVERDUE'
      ? undefined
      : statusFilter

  const cacheKey = `finance:ar:${apiStatus ?? 'ALL'}`

  const { data, mutate, isLoading, isValidating } = useFetch<{ items: AccountReceivable[] }>(
    cacheKey,
    () => financeApi.list({ status: apiStatus }),
    { ttl: 30_000, revalidateOnFocus: true },
  )

  const all = useMemo(() => data?.items ?? [], [data])

  // ===== KPIs =====
  const kpis = useMemo(() => {
    let openCents = 0
    let overdueCents = 0
    let dueTodayCents = 0
    let receivedThisMonthCents = 0
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    for (const ar of all) {
      if (ar.status === 'OPEN') {
        openCents += ar.amountCents
        const info = dueInfo(ar, now)
        if (info.isOverdue) overdueCents += ar.amountCents
        if (info.isDueToday) dueTodayCents += ar.amountCents
      } else if (ar.status === 'SETTLED' && ar.settledAt) {
        const t = new Date(ar.settledAt).getTime()
        if (t >= startOfMonth) receivedThisMonthCents += ar.amountCents
      }
    }
    return { openCents, overdueCents, dueTodayCents, receivedThisMonthCents }
  }, [all])

  // ===== FILTRO LOCAL =====
  const filtered = useMemo(() => {
    let arr = all
    if (statusFilter === 'OVERDUE') {
      const now = new Date()
      arr = arr.filter((ar) => ar.status === 'OPEN' && dueInfo(ar, now).isOverdue)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter(
        (ar) => ar.id.toLowerCase().includes(q) || ar.orderId.toLowerCase().includes(q),
      )
    }
    return arr
  }, [all, statusFilter, search])

  // ===== ORDENAÇÃO =====
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'dueDate':
          cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          break
        case 'amount':
          cmp = a.amountCents - b.amountCents
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
      }
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortAsc])

  // ===== PAGINAÇÃO =====
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [statusFilter, search])

  // ESC fecha drawer + lock body scroll
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

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSettle = useCallback(
    async (ar: AccountReceivable) => {
      setBusy(true)
      try {
        const updated = await financeApi.settle(ar.id)
        setToast({ kind: 'ok', msg: `Recebido: ${centsToBRL(updated.amountCents)}` })
        if (selected?.id === ar.id) setSelected(updated)
        await mutate()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao receber'
        setToast({ kind: 'err', msg })
      } finally {
        setBusy(false)
      }
    },
    [mutate, selected],
  )

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((v) => !v)
    else {
      setSortKey(k)
      setSortAsc(true)
    }
  }

  // Export CSV
  const handleExport = () => {
    const headers = ['ID', 'Pedido', 'Vencimento', 'Status', 'Criado em', 'Recebido em', 'Valor (R$)']
    const rows = sorted.map((a) => [
      a.id,
      a.orderId,
      formatDate(a.dueDate),
      AR_STATUS_LABELS[a.status],
      formatDateTime(a.createdAt),
      a.settledAt ? formatDateTime(a.settledAt) : '',
      (a.amountCents / 100).toFixed(2).replace('.', ','),
    ])
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((c) => {
            const s = String(c)
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
    a.download = `contas_receber_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Contas a Receber</h1>
          <p className="text-sm text-white/50 mt-1">
            Títulos gerados pelos pedidos · {filtered.length} título
            {filtered.length === 1 ? '' : 's'}
            {filtered.length !== all.length && (
              <span className="text-white/30"> de {all.length}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isValidating}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${isValidating ? 'animate-spin' : ''}`} />
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
          icon={Wallet}
          label="A receber"
          value={centsToBRL(kpis.openCents)}
          tone="yellow"
        />
        <Kpi
          icon={AlertTriangle}
          label="Em atraso"
          value={centsToBRL(kpis.overdueCents)}
          tone="red"
        />
        <Kpi
          icon={CalendarClock}
          label="Vence hoje"
          value={centsToBRL(kpis.dueTodayCents)}
          tone="amber"
        />
        <Kpi
          icon={TrendingUp}
          label="Recebido no mês"
          value={centsToBRL(kpis.receivedThisMonthCents)}
          tone="green"
        />
      </div>

      {/* FILTROS */}
      <div className="card p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID do título ou do pedido…"
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
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40 mr-2 font-semibold">
            Status
          </span>
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* TABELA */}
      <div className="card overflow-hidden">
        {isLoading && !data ? (
          <div className="p-12 text-center text-xs text-white/40 flex items-center justify-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando títulos…
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="size-8 text-white/20 mx-auto mb-3" />
            <div className="text-sm text-white/60">Nenhum título encontrado</div>
            <div className="text-[11px] text-white/30 mt-1">
              Ajuste os filtros ou aguarde novos pedidos
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-white/40 uppercase tracking-wider border-b border-white/[0.05]">
                    <SortHeader
                      label="Título"
                      sortKey="createdAt"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-2.5 text-left font-semibold">Pedido</th>
                    <SortHeader
                      label="Vencimento"
                      sortKey="dueDate"
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
                    <SortHeader
                      label="Valor"
                      sortKey="amount"
                      current={sortKey}
                      asc={sortAsc}
                      onSort={handleSort}
                      align="right"
                    />
                    <th className="px-4 py-2.5 w-32 text-right font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((ar) => {
                    const tone = AR_STATUS_TONE[ar.status]
                    const due = dueInfo(ar)
                    return (
                      <tr
                        key={ar.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                      >
                        <td
                          className="px-4 py-3 cursor-pointer"
                          onClick={() => setSelected(ar)}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-white tabular-nums">
                            <Hash className="size-3 text-white/30" />
                            {arShortId(ar.id)}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {formatDateTime(ar.createdAt)}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 cursor-pointer"
                          onClick={() => setSelected(ar)}
                        >
                          <div className="text-xs text-white/70 font-mono">
                            {arShortId(ar.orderId)}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 cursor-pointer"
                          onClick={() => setSelected(ar)}
                        >
                          <div className="text-xs text-white tabular-nums">
                            {formatDate(ar.dueDate)}
                          </div>
                          {ar.status === 'OPEN' && (
                            <div
                              className={`text-[10px] mt-0.5 ${
                                due.isOverdue
                                  ? 'text-red-400 font-semibold'
                                  : due.isDueToday
                                    ? 'text-yellow-400 font-semibold'
                                    : 'text-white/40'
                              }`}
                            >
                              {due.label}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 cursor-pointer"
                          onClick={() => setSelected(ar)}
                        >
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                          >
                            {AR_STATUS_LABELS[ar.status]}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right cursor-pointer"
                          onClick={() => setSelected(ar)}
                        >
                          <div className="text-sm font-bold text-white tabular-nums">
                            {centsToBRL(ar.amountCents)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {ar.status === 'OPEN' ? (
                            <button
                              type="button"
                              onClick={() => handleSettle(ar)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md bg-green-500/15 hover:bg-green-500/25 text-green-300 border border-green-500/30 text-[10px] font-semibold transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="size-3" />
                              Receber
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelected(ar)}
                              className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white border border-white/[0.06] text-[10px] font-semibold transition-colors"
                            >
                              Detalhes
                              <ChevronRightIcon className="size-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
                <div className="text-[11px] text-white/40">
                  <span className="text-white/60 font-semibold">{pageStart + 1}</span>–
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
                    className="px-2 h-7 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-[11px] text-white/60 px-2">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-2 h-7 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* DRAWER */}
      {selected && (
        <ARDrawer
          ar={selected}
          onClose={() => setSelected(null)}
          onSettle={() => handleSettle(selected)}
          busy={busy}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === 'ok'
              ? 'bg-green-500/15 text-green-300 border border-green-500/30'
              : 'bg-red-500/15 text-red-300 border border-red-500/30'
          }`}
        >
          {toast.msg}
        </div>
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
  icon: typeof Wallet
  label: string
  value: string
  tone: 'yellow' | 'red' | 'amber' | 'green'
}) {
  const colorMap: Record<typeof tone, { color: string; bg: string; border: string }> = {
    yellow: { color: '#eab308', bg: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.20)' },
    red: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.20)' },
    amber: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
    green: { color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.20)' },
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
          <ChevronDown className={`size-3 transition-transform ${asc ? '' : 'rotate-180'}`} />
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </th>
  )
}

// ============ DRAWER ============

function ARDrawer({
  ar,
  onClose,
  onSettle,
  busy,
}: {
  ar: AccountReceivable
  onClose: () => void
  onSettle: () => void
  busy: boolean
}) {
  const tone = AR_STATUS_TONE[ar.status]
  const due = dueInfo(ar)
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-slate-900 border-l border-white/[0.08] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.05]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-base font-bold text-white">#{arShortId(ar.id)}</span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
              >
                {AR_STATUS_LABELS[ar.status]}
              </span>
            </div>
            <div className="text-xs text-white/50">
              Pedido <span className="font-mono">#{arShortId(ar.orderId)}</span>
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
              Valor
            </div>
            <div className="card p-4 text-center">
              <div className="text-3xl font-black text-white tabular-nums">
                {centsToBRL(ar.amountCents)}
              </div>
              <div className="text-[10px] text-white/40 mt-1">
                {ar.status === 'SETTLED' && ar.settledAt
                  ? `Recebido em ${formatDate(ar.settledAt)}`
                  : ar.status === 'CANCELLED'
                    ? 'Título cancelado'
                    : due.label}
              </div>
            </div>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Datas
            </div>
            <div className="card p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-white/50">Criado em</span>
                <span className="text-white/80">{formatDateTime(ar.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Vencimento</span>
                <span className="text-white/80">{formatDate(ar.dueDate)}</span>
              </div>
              {ar.settledAt && (
                <div className="flex justify-between">
                  <span className="text-white/50">Recebido em</span>
                  <span className="text-white/80">{formatDateTime(ar.settledAt)}</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Metadados
            </div>
            <div className="card p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-white/50">Filial</span>
                <span className="text-white/80 font-mono text-[10px]">{ar.branchId.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Tenant</span>
                <span className="text-white/80 font-mono text-[10px]">{ar.tenantId.slice(0, 8)}</span>
              </div>
            </div>
          </section>
        </div>

        {ar.status === 'OPEN' && (
          <div className="p-5 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={onSettle}
              disabled={busy}
              className="w-full h-11 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 text-sm font-bold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Recebendo…
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Receber agora · {centsToBRL(ar.amountCents)}
                </>
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

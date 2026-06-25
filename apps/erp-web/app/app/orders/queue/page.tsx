'use client'

/**
 * Fila de pedidos operacional.
 *
 * Layout:
 * - Header com contadores + filtro por canal + auto-refresh
 * - 5 colunas Kanban (RECEBIDO, CONFIRMADO, EM_SEPARACAO, SEPARADO, SAIU_PARA_ENTREGA)
 * - Cada card: ID, cliente, qtd itens, total, "há X min", ações de transição
 * - Drawer lateral abre ao clicar em um pedido com detalhes
 * - Auto-refresh a cada 30s + refetch on focus
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshCw,
  ChevronRight,
  X,
  Phone,
  MapPin,
  ShoppingBag,
  ArrowRight,
  Ban,
  Clock,
  Inbox,
} from 'lucide-react'
import { useFetch } from '@/lib/use-fetch'
import {
  ordersApi,
  centsToBRL,
  formatTime,
  timeAgo,
  orderShortId,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_TRANSITIONS,
  CHANNEL_LABELS,
  QUEUE_STATUSES,
  TONE_BG,
  TONE_DOT,
  type Order,
  type OrderChannel,
  type OrderStatus,
} from '@/lib/api/orders'

const CHANNEL_FILTERS: { key: OrderChannel | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'balcao', label: 'Balcão' },
  { key: 'ifood', label: 'iFood' },
  { key: 'rappi', label: 'Rappi' },
  { key: 'site', label: 'Site' },
]

type Toast = { kind: 'ok' | 'err'; msg: string } | null

export default function OrderQueuePage() {
  const [channel, setChannel] = useState<OrderChannel | 'ALL'>('ALL')
  const [selected, setSelected] = useState<Order | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const cacheKey = `orders:queue:${channel}`

  const { data, mutate, isLoading, isValidating, error } = useFetch<{ items: Order[] }>(
    cacheKey,
    () => ordersApi.list(channel === 'ALL' ? {} : { channel }),
    { ttl: 15_000, revalidateOnFocus: true, revalidateOnReconnect: true },
  )

  const orders = useMemo(() => data?.items ?? [], [data])

  // Agrupa por status (apenas os da fila operacional)
  const byStatus = useMemo(() => {
    const m: Record<OrderStatus, Order[]> = {
      RECEBIDO: [],
      CONFIRMADO: [],
      EM_SEPARACAO: [],
      SEPARADO: [],
      SAIU_PARA_ENTREGA: [],
      ENTREGUE: [],
      CANCELADO: [],
    }
    for (const o of orders) {
      if (m[o.status]) m[o.status].push(o)
    }
    return m
  }, [orders])

  const totalActive = QUEUE_STATUSES.reduce((s, st) => s + (byStatus[st]?.length ?? 0), 0)

  // Auto-refresh a cada 30s
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => {
      mutate().catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [autoRefresh, mutate])

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Esc fecha drawer
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // Trava scroll do body quando drawer aberto
  useEffect(() => {
    if (selected) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
    return undefined
  }, [selected])

  const handleTransition = useCallback(
    async (order: Order, next: OrderStatus) => {
      setBusyId(order.id)
      try {
        await ordersApi.updateStatus(order.id, next)
        setToast({ kind: 'ok', msg: `Pedido #${orderShortId(order.id)} → ${STATUS_LABELS[next]}` })
        // Atualiza o detail se aberto
        if (selected?.id === order.id) {
          setSelected({ ...order, status: next })
        }
        await mutate()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao atualizar status'
        setToast({ kind: 'err', msg })
      } finally {
        setBusyId(null)
      }
    },
    [mutate, selected],
  )

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Fila de Pedidos</h1>
          <p className="text-sm text-white/50 mt-1">
            Operação em tempo real · {totalActive} pedido{totalActive === 1 ? '' : 's'} em andamento
            {!isLoading && orders.length > 0 && (
              <>
                {' '}
                · <span className="text-white/40">{orders.length} total</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium transition-colors ${
              autoRefresh
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-white/[0.04] text-white/60 border-white/[0.06] hover:text-white'
            }`}
            title="Auto-refresh a cada 30s"
          >
            <Clock className="size-3" />
            Auto-refresh {autoRefresh ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isValidating}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* FILTROS DE CANAL */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/40 mr-2 font-semibold">Canal</span>
        {CHANNEL_FILTERS.map((f) => {
          const active = channel === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setChannel(f.key)}
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

      {/* ERRO */}
      {error && (
        <div className="card p-4 border-red-500/30 bg-red-500/[0.05] text-sm text-red-200">
          Erro ao carregar pedidos: {error.message}
        </div>
      )}

      {/* KANBAN */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {QUEUE_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            orders={byStatus[status] ?? []}
            isLoading={isLoading && !data}
            onSelect={setSelected}
            onTransition={handleTransition}
            busyId={busyId}
          />
        ))}
      </div>

      {/* ESTADO VAZIO GERAL */}
      {!isLoading && orders.length === 0 && (
        <div className="card p-12 text-center">
          <Inbox className="size-8 text-white/20 mx-auto mb-3" />
          <div className="text-sm text-white/60">
            Nenhum pedido encontrado
            {channel !== 'ALL' && ` no canal ${CHANNEL_LABELS[channel as OrderChannel]}`}
          </div>
          <div className="text-[11px] text-white/30 mt-1">
            Quando novos pedidos chegarem, eles aparecerão aqui automaticamente
          </div>
        </div>
      )}

      {/* DRAWER DE DETALHES */}
      {selected && (
        <OrderDrawer
          order={selected}
          onClose={() => setSelected(null)}
          onTransition={(s) => handleTransition(selected, s)}
          busy={busyId === selected.id}
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

// ============ KANBAN COLUMN ============

function KanbanColumn({
  status,
  orders,
  isLoading,
  onSelect,
  onTransition,
  busyId,
}: {
  status: OrderStatus
  orders: Order[]
  isLoading: boolean
  onSelect: (o: Order) => void
  onTransition: (o: Order, s: OrderStatus) => void
  busyId: string | null
}) {
  const tone = STATUS_TONE[status]
  const dotColor = TONE_DOT[tone]
  const nextStatuses = STATUS_TRANSITIONS[status] ?? []

  return (
    <div className="flex flex-col gap-2 shrink-0 w-[260px]">
      {/* Header da coluna */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <span
          className="size-2 rounded-full shrink-0"
          style={{
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
          }}
        />
        <span className="text-xs font-bold text-white/90 uppercase tracking-wider">
          {STATUS_LABELS[status]}
        </span>
        <span
          className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TONE_BG[tone]}`}
        >
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-[200px]">
        {isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-6 text-center">
            <div className="text-[11px] text-white/30">Vazio</div>
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onSelect={onSelect}
              onAdvance={() => {
                const next = nextStatuses.find((s) => s !== 'CANCELADO') ?? nextStatuses[0]
                if (next) onTransition(o, next)
              }}
              onCancel={() => onTransition(o, 'CANCELADO')}
              busy={busyId === o.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="card p-3 animate-pulse">
      <div className="flex justify-between mb-2">
        <div className="h-3 w-14 bg-white/[0.05] rounded" />
        <div className="h-3 w-8 bg-white/[0.05] rounded" />
      </div>
      <div className="h-3 w-32 bg-white/[0.05] rounded mb-3" />
      <div className="h-5 w-20 bg-white/[0.05] rounded" />
    </div>
  )
}

// ============ ORDER CARD ============

function OrderCard({
  order,
  onSelect,
  onAdvance,
  onCancel,
  busy,
}: {
  order: Order
  onSelect: (o: Order) => void
  onAdvance: () => void
  onCancel: () => void
  busy: boolean
}) {
  const advances = STATUS_TRANSITIONS[order.status]?.filter((s) => s !== 'CANCELADO') ?? []
  const canCancel = STATUS_TRANSITIONS[order.status]?.includes('CANCELADO') ?? false
  const advanceLabel = advances.length > 0 ? STATUS_LABELS[advances[0]] : null

  return (
    <div
      className="card p-3 cursor-pointer hover:border-accent/30 transition-all group"
      onClick={() => onSelect(order)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-white tabular-nums">
          #{orderShortId(order.id)}
        </span>
        <span className="text-[10px] text-white/40 tabular-nums" title={formatTime(order.createdAt)}>
          {timeAgo(order.createdAt)}
        </span>
      </div>
      <div className="text-xs text-white/80 font-medium truncate mb-0.5">
        {order.customerName ?? '(sem nome)'}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-2">
        <span className={`px-1.5 py-0.5 rounded ${TONE_BG['gray']} text-[9px]`}>
          {CHANNEL_LABELS[order.channel as OrderChannel]}
        </span>
        <span>·</span>
        <span>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span>
      </div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-bold text-white tabular-nums">
          {centsToBRL(order.totalCents)}
        </span>
        <ChevronRight className="size-3.5 text-white/30 group-hover:text-accent transition-colors" />
      </div>
      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        {advanceLabel && (
          <button
            type="button"
            onClick={onAdvance}
            disabled={busy}
            className="flex-1 h-7 rounded-md text-[10px] font-semibold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            <ArrowRight className="size-2.5" />
            {advanceLabel}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-7 px-2 rounded-md text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors disabled:opacity-50"
            title="Cancelar pedido"
          >
            <Ban className="size-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ============ DRAWER DE DETALHES ============

function OrderDrawer({
  order,
  onClose,
  onTransition,
  busy,
}: {
  order: Order
  onClose: () => void
  onTransition: (s: OrderStatus) => void
  busy: boolean
}) {
  const tone = STATUS_TONE[order.status]
  const next = STATUS_TRANSITIONS[order.status] ?? []

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* drawer */}
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-slate-900 border-l border-white/[0.08] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.05]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold text-white">#{orderShortId(order.id)}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <div className="text-xs text-white/50">
              {CHANNEL_LABELS[order.channel as OrderChannel]} · {timeAgo(order.createdAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Cliente */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">Cliente</div>
            <div className="card p-3 space-y-1.5">
              <div className="text-sm font-semibold text-white">
                {order.customerName ?? '(sem nome)'}
              </div>
              {order.customerPhone && (
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Phone className="size-3" />
                  {order.customerPhone}
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

          {/* Itens */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                Itens
              </div>
              <div className="text-[10px] text-white/40">
                {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
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
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Totais */}
          <section>
            <div className="card p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50">Subtotal</span>
                <span className="text-white tabular-nums">{centsToBRL(order.subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.05]">
                <span className="text-sm font-semibold text-white">Total</span>
                <span className="text-base font-black text-white tabular-nums">
                  {centsToBRL(order.totalCents)}
                </span>
              </div>
            </div>
          </section>

          {/* Metadados */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Detalhes
            </div>
            <div className="card p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-white/50">Criado em</span>
                <span className="text-white/80">{formatTime(order.createdAt)}</span>
              </div>
              {order.updatedAt !== order.createdAt && (
                <div className="flex justify-between">
                  <span className="text-white/50">Atualizado em</span>
                  <span className="text-white/80">{formatTime(order.updatedAt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-white/50">Tenant</span>
                <span className="text-white/80 font-mono text-[10px]">{order.tenantId.slice(0, 8)}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer com ações */}
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
                    onClick={() => onTransition(s)}
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

        {next.length === 0 && (
          <div className="p-5 border-t border-white/[0.05]">
            <div className="flex items-center gap-2 text-xs text-white/40">
              <ShoppingBag className="size-3.5" />
              {order.status === 'ENTREGUE'
                ? 'Pedido finalizado'
                : 'Pedido cancelado — sem ações disponíveis'}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

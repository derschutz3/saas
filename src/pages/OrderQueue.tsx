import { apiFetch } from '@/lib/apiClient'
import { formatMoney } from '@/lib/format'
import Pill from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { FileText, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Order = {
  id: string
  status: string
  channel: string
  totalCents: number
  createdAt: string
  customerName: string | null
  items: Array<{ productName: string; quantityBase: number }>
}

const columns: Array<{ key: string; title: string; tone: 'neutral' | 'warn' | 'good' | 'bad' }> = [
  { key: 'CONFIRMADO', title: 'Confirmado', tone: 'warn' },
  { key: 'EM_SEPARACAO', title: 'Separação', tone: 'warn' },
  { key: 'SEPARADO', title: 'Separado', tone: 'neutral' },
  { key: 'SAIU_PARA_ENTREGA', title: 'Saiu', tone: 'neutral' },
  { key: 'ENTREGUE', title: 'Entregue', tone: 'good' },
]

const nextStatus: Record<string, string | null> = {
  CONFIRMADO: 'EM_SEPARACAO',
  EM_SEPARACAO: 'SEPARADO',
  SEPARADO: 'SAIU_PARA_ENTREGA',
  SAIU_PARA_ENTREGA: 'ENTREGUE',
  ENTREGUE: null,
  CANCELADO: null,
}

export default function OrderQueue() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    apiFetch<{ items: Order[] }>('/api/v1/orders')
      .then((r) => setOrders(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const byStatus = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const c of columns) map.set(c.key, [])
    for (const o of orders) {
      const key = map.has(o.status) ? o.status : 'CONFIRMADO'
      map.get(key)!.push(o)
    }
    return map
  }, [orders])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-app-text">Fila de pedidos</div>
          <div className="text-xs text-app-muted">Kanban operacional por status</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="ui-btn ui-btn-ghost text-app-muted hover:text-app-text"
        >
          <RefreshCw className="size-4" />
          Atualizar
        </button>
      </div>

      {loading ? <div className="text-sm text-app-muted">Carregando…</div> : null}
      {error ? (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>
      ) : null}

      {!loading && !error ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {columns.map((c) => (
            <div key={c.key} className="ui-panel">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="text-xs font-semibold text-app-text">{c.title}</div>
                <Pill label={`${byStatus.get(c.key)?.length ?? 0}`} tone={c.tone} />
              </div>
              <div className="max-h-[60vh] space-y-2 overflow-auto border-t border-app-border p-3">
                {(byStatus.get(c.key) ?? []).map((o) => {
                  const next = nextStatus[o.status]
                  return (
                    <div key={o.id} className="rounded-xl border border-app-border bg-app-s1 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-app-text">{o.customerName ?? 'Cliente'}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
                            <span className="font-mono text-app-muted/85">{o.id.slice(0, 8)}</span>
                            <span className="text-app-border">•</span>
                            <span className="uppercase">{o.channel}</span>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-app-text">{formatMoney(o.totalCents)}</div>
                      </div>

                      <div className="mt-2 line-clamp-2 text-xs text-app-muted">
                        {o.items.slice(0, 2).map((i) => `${i.productName} x${i.quantityBase}`).join(' · ')}
                        {o.items.length > 2 ? ' …' : ''}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Pill
                          label={o.status.split('_').join(' ')}
                          tone={
                            o.status === 'ENTREGUE'
                              ? 'good'
                              : o.status === 'CANCELADO'
                                ? 'bad'
                                : o.status === 'CONFIRMADO' || o.status === 'EM_SEPARACAO'
                                  ? 'warn'
                                  : 'neutral'
                          }
                        />

                        <div className="flex items-center gap-2">
                          {o.status === 'ENTREGUE' ? (
                            <button
                              type="button"
                              disabled={busyOrderId === o.id}
                              onClick={async () => {
                                setBusyOrderId(o.id)
                                try {
                                  await apiFetch('/api/v1/fiscal/documents', {
                                    method: 'POST',
                                    body: JSON.stringify({ orderId: o.id, docType: 'NFE' }),
                                  })
                                  load()
                                } finally {
                                  setBusyOrderId(null)
                                }
                              }}
                              className={cn(
                                'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition',
                                busyOrderId === o.id
                                  ? 'cursor-not-allowed border-app-border bg-app-s2 text-app-muted/60'
                                  : 'border-app-border bg-app-s2 text-app-muted hover:bg-[#232B3B] hover:text-app-text',
                              )}
                            >
                              <FileText className="size-4" />
                              Emitir NF-e
                            </button>
                          ) : null}

                          {next ? (
                            <button
                              type="button"
                              disabled={busyOrderId === o.id}
                              onClick={async () => {
                                setBusyOrderId(o.id)
                                try {
                                  await apiFetch(`/api/v1/orders/${o.id}/status`, {
                                    method: 'POST',
                                    body: JSON.stringify({ status: next }),
                                  })
                                  load()
                                } finally {
                                  setBusyOrderId(null)
                                }
                              }}
                              className={cn(
                                'rounded-lg border px-2 py-1 text-xs transition',
                                busyOrderId === o.id
                                  ? 'cursor-not-allowed border-app-border bg-app-s2 text-app-muted/60'
                                  : 'border-app-border bg-app-s2 text-app-muted hover:bg-[#232B3B] hover:text-app-text',
                              )}
                            >
                              Avançar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {(byStatus.get(c.key) ?? []).length === 0 ? (
                  <div className="rounded-xl border border-app-border bg-app-s1 px-3 py-4 text-xs text-app-muted">
                    Sem pedidos
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

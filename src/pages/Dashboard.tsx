import { apiFetch } from '@/lib/apiClient'
import { formatMoney } from '@/lib/format'
import StatCard from '@/components/ui/StatCard'
import Pill from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type Order = {
  id: string
  status: string
  channel: string
  totalCents: number
  createdAt: string
  customerName: string | null
}

type Receivable = { id: string; status: 'OPEN' | 'SETTLED' | 'CANCELLED'; amountCents: number; dueDate: string }
type FiscalDoc = { id: string; status: 'PENDING' | 'AUTHORIZED' | 'REJECTED'; orderId: string; updatedAt: string }

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [fiscalDocs, setFiscalDocs] = useState<FiscalDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch<{ items: Order[] }>('/api/v1/orders'),
      apiFetch<{ items: Receivable[] }>('/api/v1/finance/ar?status=OPEN'),
      apiFetch<{ items: FiscalDoc[] }>('/api/v1/fiscal/documents'),
    ])
      .then(([o, ar, fiscal]) => {
        if (cancelled) return
        setOrders(o.items)
        setReceivables(ar.items)
        setFiscalDocs(fiscal.items)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const byStatus = new Map<string, number>()
    for (const o of orders) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1)
    const openAr = receivables.reduce((s, r) => s + r.amountCents, 0)
    const pendingFiscal = fiscalDocs.filter((d) => d.status === 'PENDING').length
    const rejectedFiscal = fiscalDocs.filter((d) => d.status === 'REJECTED').length
    return {
      pedidosAbertos:
        (byStatus.get('CONFIRMADO') ?? 0) +
        (byStatus.get('EM_SEPARACAO') ?? 0) +
        (byStatus.get('SEPARADO') ?? 0) +
        (byStatus.get('SAIU_PARA_ENTREGA') ?? 0),
      entregue: byStatus.get('ENTREGUE') ?? 0,
      cancelado: byStatus.get('CANCELADO') ?? 0,
      openAr,
      pendingFiscal,
      rejectedFiscal,
    }
  }, [orders, receivables, fiscalDocs])

  const recentOrders = useMemo(() => orders.slice(0, 8), [orders])

  if (loading) {
    return <div className="text-sm text-app-muted">Carregando…</div>
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="ui-label">Operação · Visão geral</div>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-app-text">
          Painel <span className="text-app-primary">Garciat</span>
        </h1>
        <p className="mt-1 text-sm text-app-muted">Pedidos, recebíveis e situação fiscal em tempo real.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Pedidos em andamento" value={`${stats.pedidosAbertos}`} tone="warn" hint="Confirmado → entrega" />
        <StatCard label="A receber (aberto)" value={formatMoney(stats.openAr)} tone="neutral" hint="Títulos OPEN" />
        <StatCard
          label="Fiscal pendente"
          value={`${stats.pendingFiscal}`}
          tone={stats.pendingFiscal > 0 ? 'warn' : 'good'}
          hint={stats.rejectedFiscal > 0 ? `${stats.rejectedFiscal} rejeitadas` : 'Sem rejeições'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/app/orders/new"
          className="ui-btn ui-btn-primary"
        >
          Criar pedido
        </Link>
        <Link
          to="/app/orders/queue"
          className="ui-btn ui-btn-ghost text-app-muted hover:text-app-text"
        >
          Ver fila
        </Link>
        <Link
          to="/app/fiscal/monitor"
          className="ui-btn ui-btn-ghost text-app-muted hover:text-app-text"
        >
          Monitor fiscal
        </Link>
      </div>

      <div className="ui-panel">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold text-app-text">Últimos pedidos</div>
          <div className="text-xs text-app-muted">{orders.length} no total</div>
        </div>
        <div className="ui-divider">
          {recentOrders.length === 0 ? (
            <div className="px-4 py-6 text-sm text-app-muted">Nenhum pedido ainda</div>
          ) : (
            <div className="divide-y divide-app-border">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app-text">{o.customerName ?? 'Cliente'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                      <span className="font-mono text-app-muted/80">{o.id.slice(0, 8)}</span>
                      <span className="text-app-border">•</span>
                      <span>{new Date(o.createdAt).toLocaleString('pt-BR')}</span>
                      <span className="text-app-border">•</span>
                      <span className="uppercase">{o.channel}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 md:justify-end">
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
                    <div className={cn('text-sm font-semibold text-app-text')}>{formatMoney(o.totalCents)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

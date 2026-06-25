'use client'

/**
 * Banner de alerta do Agente de IA — Estoque Inteligente
 *
 * Aparece em /app/orders/new e faz pré-checagem de cada item do pedido.
 * Quando o cliente já comprou a mesma quantidade no mês anterior E o
 * estoque ainda tem 60%+ dessa quantidade, exibe o alerta.
 *
 * Não é bloqueante: é informativo para o operador decidir.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'

export type AlertItem = {
  productId: string
  productName: string
  previousQuantityBase: number
  onHandBase: number
  onHandPctOfPrevious: number
  requestedQuantityBase: number
  message: string
  severity: 'info' | 'warn' | 'critical'
}

type Props = {
  /** Opcional — se omitido, o backend usa o branchId do usuário logado. */
  branchId?: string
  customerPhone: string | null
  customerName?: string | null
  items: Array<{ productId: string; productName?: string; quantityBase: number }>
}

const iconFor = (sev: AlertItem['severity']) => {
  if (sev === 'critical') return <ShieldAlert className="size-4" />
  if (sev === 'warn') return <AlertTriangle className="size-4" />
  return <Info className="size-4" />
}

const toneFor = (sev: AlertItem['severity']) => {
  if (sev === 'critical')
    return 'border-rose-500/40 bg-rose-500/10 text-rose-200'
  if (sev === 'warn')
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  return 'border-sky-500/40 bg-sky-500/10 text-sky-200'
}

export default function StockAlertBanner({ branchId, customerPhone, customerName, items }: Props) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!customerPhone || items.length === 0) {
      setAlerts([])
      setError(null)
      return
    }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch('/api/v1/agent/orders/check-alert', {
          method: 'POST',
          credentials: 'include',
          signal: ac.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(branchId ? { branchId } : {}),
            customerPhone,
            customerName: customerName ?? null,
            items: items.filter((i) => i.productId && i.quantityBase > 0),
            coverageThreshold: 0.6,
          }),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        setAlerts(data.alerts ?? [])
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message)
          setAlerts([])
        }
      } finally {
        setLoading(false)
      }
    }, 350) // debounce 350ms
    return () => {
      ac.abort()
      clearTimeout(t)
    }
  }, [branchId, customerPhone, customerName, items])

  if (!customerPhone || items.length === 0) return null
  if (loading && alerts.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-[11px] text-slate-500">
        agente verificando estoque…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
        agente: erro ao checar ({error})
      </div>
    )
  }
  if (alerts.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.productId}
          className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 ${toneFor(a.severity)}`}
        >
          <div className="mt-0.5">{iconFor(a.severity)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider opacity-80">
              {a.severity === 'critical' ? 'Alerta de recompra' : a.severity === 'warn' ? 'Atenção' : 'Aviso'}
            </div>
            <div className="text-xs font-semibold mt-0.5">{a.message}</div>
            <div className="text-[10px] opacity-70 mt-0.5">
              pedido: {a.requestedQuantityBase} un · compra anterior: {a.previousQuantityBase} un · estoque: {a.onHandBase} un
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

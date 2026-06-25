import { apiFetch } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import Pill from '@/components/ui/Pill'
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Product = { id: string; sku: string; name: string; baseUnit: string }

type BalanceRow = Product & { quantityBase: number }

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    apiFetch<{ items: Product[] }>('/api/v1/products')
      .then(async (r) => {
        setProducts(r.items)
        const entries = await Promise.all(
          r.items.map(async (p) => {
            const bal = await apiFetch<{ productId: string; quantityBase: number }>(
              `/api/v1/inventory/balance?productId=${encodeURIComponent(p.id)}`,
            )
            return [p.id, bal.quantityBase] as const
          }),
        )
        setBalances(Object.fromEntries(entries))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo<BalanceRow[]>(
    () => products.map((p) => ({ ...p, quantityBase: balances[p.id] ?? 0 })),
    [products, balances],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-app-text">Estoque</div>
          <div className="text-xs text-app-muted">Saldo por produto (unidade base)</div>
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
        <div className="ui-panel">
          <div className="grid grid-cols-[1fr_110px_240px] gap-3 px-4 py-3 text-xs font-semibold text-app-muted">
            <div>Produto</div>
            <div className="text-right">Saldo</div>
            <div className="text-right">Ação</div>
          </div>
          <div className="divide-y divide-app-border">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_110px_240px] items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-app-text">{r.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-app-muted">
                    <span className="font-mono text-app-muted/85">{r.sku}</span>
                    <span className="text-app-border">•</span>
                    <span className="uppercase">{r.baseUnit}</span>
                  </div>
                </div>

                <div className="text-right">
                  <Pill label={`${r.quantityBase}`} tone={r.quantityBase <= 5 ? 'warn' : 'neutral'} />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      setBusyId(r.id)
                      try {
                        await apiFetch('/api/v1/inventory/adjustments', {
                          method: 'POST',
                          body: JSON.stringify({ productId: r.id, quantityDeltaBase: 10, reason: 'Ajuste demo +10' }),
                        })
                        load()
                      } finally {
                        setBusyId(null)
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition',
                      busyId === r.id
                        ? 'cursor-not-allowed border-app-border bg-app-s2 text-app-muted/60'
                        : 'border-app-border bg-app-s2 text-app-muted hover:bg-[#232B3B] hover:text-app-text',
                    )}
                  >
                    <ArrowUp className="size-4" />
                    +10
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id || r.quantityBase <= 0}
                    onClick={async () => {
                      setBusyId(r.id)
                      try {
                        await apiFetch('/api/v1/inventory/adjustments', {
                          method: 'POST',
                          body: JSON.stringify({ productId: r.id, quantityDeltaBase: -5, reason: 'Ajuste demo -5' }),
                        })
                        load()
                      } finally {
                        setBusyId(null)
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition',
                      busyId === r.id || r.quantityBase <= 0
                        ? 'cursor-not-allowed border-app-border bg-app-s2 text-app-muted/60'
                        : 'border-app-border bg-app-s2 text-app-muted hover:bg-[#232B3B] hover:text-app-text',
                    )}
                  >
                    <ArrowDown className="size-4" />
                    -5
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

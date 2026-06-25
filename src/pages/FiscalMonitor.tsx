import { apiFetch } from '@/lib/apiClient'
import Pill from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { RefreshCw, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type FiscalDoc = {
  id: string
  orderId: string
  docType: string
  status: 'PENDING' | 'AUTHORIZED' | 'REJECTED'
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export default function FiscalMonitor() {
  const [items, setItems] = useState<FiscalDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    apiFetch<{ items: FiscalDoc[] }>('/api/v1/fiscal/documents')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [])

  const stats = useMemo(() => {
    const pending = items.filter((d) => d.status === 'PENDING').length
    const ok = items.filter((d) => d.status === 'AUTHORIZED').length
    const rej = items.filter((d) => d.status === 'REJECTED').length
    return { pending, ok, rej }
  }, [items])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-app-text">Monitor fiscal</div>
          <div className="text-xs text-app-muted">Fila demo (processamento simulado em background)</div>
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

      <div className="flex flex-wrap gap-2">
        <Pill label={`PENDENTE ${stats.pending}`} tone={stats.pending > 0 ? 'warn' : 'good'} />
        <Pill label={`AUTORIZADA ${stats.ok}`} tone="good" />
        <Pill label={`REJEITADA ${stats.rej}`} tone={stats.rej > 0 ? 'bad' : 'neutral'} />
      </div>

      {loading ? <div className="text-sm text-app-muted">Carregando…</div> : null}
      {error ? (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>
      ) : null}

      {!loading && !error ? (
        <div className="ui-panel">
          <div className="grid grid-cols-[160px_120px_1fr_140px] gap-3 px-4 py-3 text-xs font-semibold text-app-muted">
            <div>Pedido</div>
            <div>Tipo</div>
            <div>Status</div>
            <div className="text-right">Ação</div>
          </div>
          <div className="divide-y divide-app-border">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-app-muted">Sem documentos fiscais ainda</div>
            ) : (
              items.slice(0, 30).map((d) => (
                <div key={d.id} className="grid grid-cols-[160px_120px_1fr_140px] items-center gap-3 px-4 py-3">
                  <div className="font-mono text-xs text-app-muted/85">{d.orderId.slice(0, 8)}</div>
                  <div className="text-xs text-app-muted/85">{d.docType}</div>
                  <div className="flex min-w-0 items-center gap-3">
                    <Pill
                      label={d.status}
                      tone={d.status === 'AUTHORIZED' ? 'good' : d.status === 'REJECTED' ? 'bad' : 'warn'}
                    />
                    <div className="min-w-0 truncate text-xs text-app-muted">
                      {d.status === 'REJECTED' ? d.errorMessage ?? 'Rejeitada' : `Atualizado: ${new Date(d.updatedAt).toLocaleTimeString('pt-BR')}`}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {d.status === 'REJECTED' ? (
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={async () => {
                          setBusyId(d.id)
                          try {
                            await apiFetch(`/api/v1/fiscal/documents/${d.id}/retry`, { method: 'POST' })
                            load()
                          } finally {
                            setBusyId(null)
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition',
                          busyId === d.id
                            ? 'cursor-not-allowed border-app-border bg-app-s2 text-app-muted/60'
                            : 'border-app-border bg-app-s2 text-app-muted hover:bg-[#232B3B] hover:text-app-text',
                        )}
                      >
                        <RotateCcw className="size-4" />
                        Reprocessar
                      </button>
                    ) : (
                      <div className="text-xs text-app-muted/60">—</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

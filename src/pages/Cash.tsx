import { apiFetch } from '@/lib/apiClient'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import Pill from '@/components/ui/Pill'
import { Check, DoorOpen, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type CashSession = { id: string; openedAt: string; openingFloatCents: number; closedAt: string | null }
type CashMovement = { id: string; movementType: string; amountCents: number; createdAt: string; refType: string | null }
type OpenCashResponse = { session: CashSession | null; movements: CashMovement[]; totals: { receiveCents: number; supplyCents: number; withdrawCents: number } }

type Receivable = { id: string; orderId: string; amountCents: number; status: 'OPEN' | 'SETTLED' | 'CANCELLED'; dueDate: string }

export default function Cash() {
  const [openCash, setOpenCash] = useState<OpenCashResponse | null>(null)
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch<OpenCashResponse>('/api/v1/finance/cash-sessions/open'),
      apiFetch<{ items: Receivable[] }>('/api/v1/finance/ar?status=OPEN'),
    ])
      .then(([cash, ar]) => {
        setOpenCash(cash)
        setReceivables(ar.items)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => openCash?.totals ?? { receiveCents: 0, supplyCents: 0, withdrawCents: 0 }, [openCash])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-app-text">Caixa do dia</div>
          <div className="text-xs text-app-muted">Abertura/fechamento e recebimentos</div>
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
          <div className="space-y-4">
            <div className="ui-panel p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-app-text">Sessão</div>
                {openCash?.session ? <Pill label="Aberto" tone="good" /> : <Pill label="Fechado" tone="neutral" />}
              </div>

              {openCash?.session ? (
                <div className="mt-3 space-y-2 text-xs text-app-muted">
                  <div className="flex items-center justify-between">
                    <span>Abertura</span>
                    <span className="font-mono text-app-muted/85">{new Date(openCash.session.openedAt).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Fundo</span>
                    <span className="font-semibold text-app-text">{formatMoney(openCash.session.openingFloatCents)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-app-border bg-app-s2 p-2">
                      <div className="text-[11px] text-app-muted">Recebido</div>
                      <div className="mt-1 text-sm font-semibold text-app-text">{formatMoney(totals.receiveCents)}</div>
                    </div>
                    <div className="rounded-xl border border-app-border bg-app-s2 p-2">
                      <div className="text-[11px] text-app-muted">Suprimento</div>
                      <div className="mt-1 text-sm font-semibold text-app-text">{formatMoney(totals.supplyCents)}</div>
                    </div>
                    <div className="rounded-xl border border-app-border bg-app-s2 p-2">
                      <div className="text-[11px] text-app-muted">Sangria</div>
                      <div className="mt-1 text-sm font-semibold text-app-text">{formatMoney(totals.withdrawCents)}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!openCash.session) return
                      setBusy(true)
                      try {
                        await apiFetch(`/api/v1/finance/cash-sessions/${openCash.session.id}/close`, {
                          method: 'POST',
                          body: JSON.stringify({ closingDeclaredCents: openCash.session.openingFloatCents + totals.receiveCents }),
                        })
                        load()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Falha ao fechar caixa')
                      } finally {
                        setBusy(false)
                      }
                    }}
                    className={cn(
                      'ui-btn ui-btn-primary mt-4 w-full',
                      busy ? 'opacity-50' : '',
                    )}
                  >
                    Fechar caixa (demo)
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await apiFetch('/api/v1/finance/cash-sessions/open', {
                          method: 'POST',
                          body: JSON.stringify({ openingFloatCents: 20000 }),
                        })
                        load()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Falha ao abrir caixa')
                      } finally {
                        setBusy(false)
                      }
                    }}
                    className={cn(
                      'ui-btn ui-btn-primary w-full',
                      busy ? 'opacity-50' : '',
                    )}
                  >
                    <DoorOpen className="size-4" />
                    Abrir caixa (demo)
                  </button>
                  <div className="mt-2 text-xs text-app-muted">Abre com fundo de R$ 200,00</div>
                </div>
              )}
            </div>
          </div>

          <div className="ui-panel">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-semibold text-app-text">Contas a receber (OPEN)</div>
              <Pill label={`${receivables.length}`} tone={receivables.length > 0 ? 'warn' : 'good'} />
            </div>
            <div className="ui-divider">
              {receivables.length === 0 ? (
                <div className="px-4 py-6 text-sm text-app-muted">Nenhum título em aberto</div>
              ) : (
                <div className="divide-y divide-app-border">
                  {receivables.slice(0, 12).map((r) => (
                    <div key={r.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-app-text">
                          Pedido <span className="font-mono">{r.orderId.slice(0, 8)}</span>
                        </div>
                        <div className="mt-1 text-xs text-app-muted">Venc.: {new Date(r.dueDate).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <div className="text-sm font-semibold text-app-text">{formatMoney(r.amountCents)}</div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true)
                            try {
                              await apiFetch(`/api/v1/finance/ar/${r.id}/settle`, { method: 'POST' })
                              load()
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Falha ao baixar')
                            } finally {
                              setBusy(false)
                            }
                          }}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition',
                            busy
                              ? 'cursor-not-allowed border-app-border bg-app-s2 text-app-muted/60'
                              : 'border-app-border bg-app-s2 text-app-muted hover:bg-[#232B3B] hover:text-app-text',
                          )}
                        >
                          <Check className="size-4" />
                          Baixar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

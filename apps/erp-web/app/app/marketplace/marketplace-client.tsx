'use client'

/**
 * Página de Marketplace Hub (Integrações de Marketplaces).
 *
 * Conecta/desconecta provedores (iFood, Rappi, 99Eats, Mercado Livre, Shopify, etc.),
 * mostra status, webhooks, eventos e métricas.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShoppingBag, RefreshCw, Store, Check, X, Copy, Power, AlertTriangle,
  ExternalLink, Webhook, Activity, Settings, ChevronRight, Zap, Eye, EyeOff,
} from 'lucide-react'
import {
  integrationsApi, formatDateTime,
  type IntegrationProviderInfo, type IntegrationEvent, type IntegrationStats,
} from '@/lib/api/integrations'
import { useFetch } from '@/lib/use-fetch'

const KEY_PROVIDERS = 'integrations:providers:v1'
const KEY_STATS = 'integrations:stats:v1'
const KEY_EVENTS = 'integrations:events:v1'

type FilterTab = 'all' | 'connected' | 'available'

export default function MarketplacePage() {
  const providersFetch = useFetch(KEY_PROVIDERS, () => integrationsApi.providers(), { ttl: 5000 })
  const statsFetch = useFetch(KEY_STATS, () => integrationsApi.stats(), { ttl: 5000 })
  const eventsFetch = useFetch(KEY_EVENTS, () => integrationsApi.events({ limit: 50 }), { ttl: 5000 })

  const { mutate: mutateProviders } = providersFetch
  const { mutate: mutateStats } = statsFetch

  const [filter, setFilter] = useState<FilterTab>('all')
  const [connecting, setConnecting] = useState<IntegrationProviderInfo | null>(null)
  const [webhookFor, setWebhookFor] = useState<IntegrationProviderInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const providers: IntegrationProviderInfo[] = providersFetch.data?.providers ?? []
  const stats: IntegrationStats | undefined = statsFetch.data
  const events: IntegrationEvent[] = eventsFetch.data?.events ?? []

  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'connected') return providers.filter((p) => p.connected)
    if (filter === 'available') return providers.filter((p) => !p.connected)
    return providers
  }, [providers, filter])

  const counts = useMemo(() => ({
    total: providers.length,
    connected: providers.filter((p) => p.connected).length,
    available: providers.filter((p) => !p.connected).length,
  }), [providers])

  useEffect(() => {
    if (!connecting && !webhookFor) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [connecting, webhookFor])

  const refresh = async () => {
    await Promise.all([mutateProviders(), mutateStats(), eventsFetch.mutate()])
    showToast('ok', 'Atualizado')
  }

  const handleConnect = async (provider: IntegrationProviderInfo, body: { apiKey?: string; apiSecret?: string; accessToken?: string; environment: 'sandbox' | 'production' }) => {
    setBusy(true)
    try {
      await integrationsApi.connect(provider.id, body)
      showToast('ok', `${provider.name} conectado em ${body.environment}`)
      setConnecting(null)
      await Promise.all([mutateProviders(), mutateStats()])
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao conectar')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async (provider: IntegrationProviderInfo) => {
    if (!confirm(`Desconectar ${provider.name}? Os webhooks serão desativados.`)) return
    setBusy(true)
    try {
      await integrationsApi.disconnect(provider.id)
      showToast('ok', `${provider.name} desconectado`)
      await Promise.all([mutateProviders(), mutateStats()])
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao desconectar')
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async (provider: IntegrationProviderInfo) => {
    setBusy(true)
    try {
      await integrationsApi.sync(provider.id)
      showToast('ok', `Sync de ${provider.name} iniciado`)
      await Promise.all([mutateStats(), eventsFetch.mutate()])
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro no sync')
    } finally {
      setBusy(false)
    }
  }

  const handleShowWebhook = async (provider: IntegrationProviderInfo) => {
    setWebhookFor(provider)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Store className="h-6 w-6 text-indigo-600" />
            Marketplace Hub
          </h1>
          <p className="text-sm text-slate-500">Gerencie as integrações com marketplaces e plataformas</p>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          data-testid="marketplace-refresh"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Providers" value={String(counts.total)} icon={Store} tone="slate" />
        <KpiCard label="Conectados" value={String(counts.connected)} icon={Zap} tone="emerald" />
        <KpiCard label="Eventos processados" value={String(stats?.totalProcessed ?? 0)} icon={Activity} tone="indigo" />
        <KpiCard label="Falhas" value={String(stats?.totalFailed ?? 0)} icon={AlertTriangle} tone="rose" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>Todos ({counts.total})</FilterTab>
        <FilterTab active={filter === 'connected'} onClick={() => setFilter('connected')}>Conectados ({counts.connected})</FilterTab>
        <FilterTab active={filter === 'available'} onClick={() => setFilter('available')}>Disponíveis ({counts.available})</FilterTab>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            busy={busy}
            onConnect={() => setConnecting(p)}
            onDisconnect={() => handleDisconnect(p)}
            onSync={() => handleSync(p)}
            onWebhook={() => handleShowWebhook(p)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Store className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <div className="text-sm font-semibold text-slate-700">Nenhum marketplace neste filtro</div>
          <div className="mt-1 text-xs text-slate-500">Tente outro filtro para ver os canais disponíveis</div>
        </div>
      )}

      <EventsPanel
        events={events}
        loading={eventsFetch.isLoading}
        onRetry={async (id) => {
          setBusy(true)
          try {
            await integrationsApi.retryDeadLetter(id)
            showToast('ok', 'Evento reenfileirado')
            await eventsFetch.mutate()
          } catch (err) {
            showToast('err', err instanceof Error ? err.message : 'Erro ao reprocessar')
          } finally {
            setBusy(false)
          }
        }}
        busy={busy}
      />

      {connecting && (
        <ConnectModal
          provider={connecting}
          busy={busy}
          onClose={() => setConnecting(null)}
          onSubmit={handleConnect}
        />
      )}

      {webhookFor && (
        <WebhookModal
          provider={webhookFor}
          onClose={() => setWebhookFor(null)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${
            toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          {toast.kind === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// =================================================================
// Subcomponentes
// =================================================================

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Store; tone: 'slate' | 'emerald' | 'indigo' | 'rose' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
  } as const
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function ProviderCard({
  provider, busy, onConnect, onDisconnect, onSync, onWebhook,
}: {
  provider: IntegrationProviderInfo
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  onWebhook: () => void
}) {
  const capLabels: Record<string, string> = {
    orders_read: 'Pedidos',
    orders_update: 'Atualizar',
    catalog_sync: 'Catálogo',
    inventory_sync: 'Estoque',
    payments_read: 'Pagamentos',
    payments_write: 'Cobrança',
    webhooks: 'Webhooks',
  }
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-testid={`marketplace-card-${provider.id}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
            style={{ background: `${provider.color}15`, color: provider.color }}
          >
            {provider.icon}
          </div>
          <div>
            <div className="font-semibold text-slate-900">{provider.name}</div>
            <div className="text-xs text-slate-500">{provider.description}</div>
          </div>
        </div>
        {provider.connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <Power className="h-3 w-3" />
            {provider.status ?? 'conectado'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
            <Power className="h-3 w-3" />
            offline
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {provider.capabilities.map((cap) => (
          <span key={cap} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
            {capLabels[cap] ?? cap}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {provider.connected ? (
          <>
            <button
              onClick={onSync}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid={`marketplace-sync-${provider.id}`}
            >
              <RefreshCw className="h-3 w-3" /> Sincronizar
            </button>
            <button
              onClick={onWebhook}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              data-testid={`marketplace-webhook-${provider.id}`}
            >
              <Webhook className="h-3 w-3" /> Webhook
            </button>
            <button
              onClick={onDisconnect}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              data-testid={`marketplace-disconnect-${provider.id}`}
            >
              <X className="h-3 w-3" /> Desconectar
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            data-testid={`marketplace-connect-${provider.id}`}
          >
            <Power className="h-3 w-3" /> Conectar
          </button>
        )}
      </div>
    </div>
  )
}

function ConnectModal({
  provider, busy, onClose, onSubmit,
}: {
  provider: IntegrationProviderInfo
  busy: boolean
  onClose: () => void
  onSubmit: (p: IntegrationProviderInfo, body: { apiKey?: string; apiSecret?: string; accessToken?: string; environment: 'sandbox' | 'production' }) => Promise<void>
}) {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [showSecret, setShowSecret] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" data-testid="marketplace-connect-modal">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
              style={{ background: `${provider.color}15`, color: provider.color }}
            >
              {provider.icon}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Conectar {provider.name}</h2>
              <p className="text-xs text-slate-500">Autenticação: {provider.authType === 'oauth2' ? 'OAuth2' : 'API Key'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          {provider.authType === 'apikey' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">API Key *</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="pk_live_..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  data-testid="marketplace-apikey"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">API Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="sk_live_..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={() => setShowSecret((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Access Token</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ya29...."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">Em produção, redirecionar para OAuth flow do provider.</p>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Ambiente</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as 'sandbox' | 'production')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="sandbox">Sandbox (testes)</option>
              <option value="production">Produção (real)</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={() => onSubmit(provider, { apiKey: apiKey.trim() || undefined, apiSecret: apiSecret.trim() || undefined, environment })}
            disabled={busy || !apiKey.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            data-testid="marketplace-connect-submit"
          >
            <Power className="h-4 w-4" />
            {busy ? 'Conectando...' : 'Conectar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function WebhookModal({ provider, onClose }: { provider: IntegrationProviderInfo; onClose: () => void }) {
  const [info, setInfo] = useState<{ webhookUrl: string; instructions: Record<string, unknown> } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    integrationsApi.webhookUrl(provider.id).then(setInfo).catch(() => setInfo(null))
  }, [provider.id])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
              style={{ background: `${provider.color}15`, color: provider.color }}
            >
              {provider.icon}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Webhook {provider.name}</h2>
              <p className="text-xs text-slate-500">URL para receber eventos em tempo real</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        {info ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">URL pública</label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <code className="flex-1 truncate font-mono text-xs text-slate-800">{info.webhookUrl}</code>
                <button
                  onClick={() => copy(info.webhookUrl)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                  title="Copiar"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Headers esperados</label>
              <pre className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
{`Content-Type: application/json
X-Tenant-Id: <seu-tenant-id>`}
              </pre>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Importante:</strong> configure esta URL no painel do {provider.name} e utilize o
              <code className="mx-1 rounded bg-amber-100 px-1">webhookSecret</code> gerado para validar a assinatura.
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500">Carregando...</div>
        )}
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function EventsPanel({
  events, loading, onRetry, busy,
}: {
  events: IntegrationEvent[]
  loading: boolean
  onRetry: (id: string) => void
  busy: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Activity className="h-4 w-4 text-slate-500" />
          Eventos recentes
        </h2>
        <span className="text-xs text-slate-500">{events.length} evento(s)</span>
      </div>
      {loading && events.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Carregando eventos...</div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Nenhum evento registrado ainda.</div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Evento</th>
                <th className="px-4 py-2">Recebido</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-xs">{e.provider}</td>
                  <td className="px-4 py-2 text-xs font-medium text-slate-700">{e.eventType}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(e.receivedAt)}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${
                      e.status === 'processed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : e.status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : e.status === 'dead_letter' ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {e.status === 'dead_letter' && (
                      <button
                        onClick={() => onRetry(e.id)}
                        disabled={busy}
                        className="rounded p-1 text-rose-700 hover:bg-rose-50"
                        title="Reprocessar"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

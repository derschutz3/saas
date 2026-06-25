'use client'

/**
 * Cliente HTTP para o módulo de Integrações (Marketplace Hub).
 *
 * Endpoints (via Next.js proxy /api/integrations -> backend /integrations):
 *   GET    /api/integrations/providers        — providers disponíveis + status
 *   GET    /api/integrations/connections      — conexões ativas
 *   POST   /api/integrations/connect/:provider
 *   DELETE /api/integrations/disconnect/:provider
 *   GET    /api/integrations/webhook-url/:provider
 *   POST   /api/integrations/sync/:provider
 *   GET    /api/integrations/events
 *   GET    /api/integrations/stats
 *   POST   /api/integrations/dlq/:eventId/retry
 */

import type { IntegrationProvider } from '@/lib/types/integrations'

export type ProviderCapability = 'orders_read' | 'orders_update' | 'catalog_sync' | 'inventory_sync' | 'payments_read' | 'payments_write' | 'webhooks'
export type AuthType = 'oauth2' | 'apikey'

export type IntegrationProviderInfo = {
  id: IntegrationProvider
  name: string
  description: string
  icon: string
  capabilities: ProviderCapability[]
  authType: AuthType
  color: string
  connected: boolean
  status: 'sandbox' | 'production' | null
}

export type Connection = {
  provider: IntegrationProvider
  environment: 'sandbox' | 'production'
  connected: boolean
  expiresAt: string | null
  lastSync: string
  createdAt: string
}

export type IntegrationEvent = {
  id: string
  provider: IntegrationProvider
  eventType: string
  payload: unknown
  receivedAt: string
  processedAt: string | null
  status: 'pending' | 'processed' | 'failed' | 'dead_letter'
  errorMessage?: string
}

export type IntegrationStats = {
  totalReceived: number
  totalProcessed: number
  totalFailed: number
  deadLetterEvents: IntegrationEvent[]
}

export type ConnectBody = {
  apiKey?: string
  apiSecret?: string
  accessToken?: string
  refreshToken?: string
  environment?: 'sandbox' | 'production'
}

const BASE = '/api/integrations'

class ApiErr extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const data: { code?: string; message?: string; error?: string } = await res
      .json()
      .catch(() => ({}))
    throw new ApiErr(
      res.status,
      data.code ?? data.error ?? 'ERROR',
      data.message ?? res.statusText,
    )
  }
  return res.json() as Promise<T>
}

export const integrationsApi = {
  providers: () => req<{ providers: IntegrationProviderInfo[] }>('GET', `${BASE}/providers`),
  connections: () => req<{ connections: Connection[] }>('GET', `${BASE}/connections`),
  connect: (provider: string, body: ConnectBody) =>
    req<{ success: boolean; message: string; credentials: { provider: string; environment: string; webhookSecret: string; createdAt: string } }>('POST', `${BASE}/connect/${provider}`, body),
  disconnect: (provider: string) =>
    req<{ success: boolean; message: string }>('DELETE', `${BASE}/disconnect/${provider}`),
  webhookUrl: (provider: string) =>
    req<{ provider: string; webhookUrl: string; instructions: Record<string, unknown> }>('GET', `${BASE}/webhook-url/${provider}`),
  sync: (provider: string, since?: string) =>
    req<Record<string, unknown>>('POST', `${BASE}/sync/${provider}`, since ? { since } : {}),
  events: (params: { provider?: string; limit?: number } = {}) => {
    const sp = new URLSearchParams()
    if (params.provider) sp.set('provider', params.provider)
    if (params.limit) sp.set('limit', String(params.limit))
    const qs = sp.toString()
    return req<{ events: IntegrationEvent[]; total: number }>('GET', qs ? `${BASE}/events?${qs}` : `${BASE}/events`)
  },
  stats: () => req<IntegrationStats>('GET', `${BASE}/stats`),
  retryDeadLetter: (eventId: string) =>
    req<{ success: boolean; message: string }>('POST', `${BASE}/dlq/${eventId}/retry`),
}

export { ApiErr }

// ===== Helpers =====

export const PROVIDER_TONE: Record<IntegrationProvider, string> = {
  ifood: 'border-red-200 bg-red-50 text-red-700',
  rappi: 'border-orange-200 bg-orange-50 text-orange-700',
  '99eats': 'border-yellow-200 bg-yellow-50 text-yellow-700',
  mercadolivre: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  shopify: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  woocommerce: 'border-purple-200 bg-purple-50 text-purple-700',
  pagseguro: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  stripe: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

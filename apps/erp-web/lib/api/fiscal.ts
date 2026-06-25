'use client'

/**
 * Cliente HTTP para o módulo Fiscal (NF-e / NFC-e).
 *
 * Endpoints:
 *   GET    /api/v1/fiscal/documents
 *   GET    /api/v1/fiscal/documents/:id
 *   POST   /api/v1/fiscal/documents
 *   POST   /api/v1/fiscal/documents/:id/emit
 *   POST   /api/v1/fiscal/documents/:id/retry
 *   POST   /api/v1/fiscal/documents/:id/cancel
 *   GET    /api/v1/fiscal/stats
 */

export type FiscalStatus = 'PENDING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELED' | 'DENIED'
export type FiscalDocType = 'NFE' | 'NFCE'

export type FiscalDocument = {
  id: string
  tenantId: string
  branchId: string
  orderId: string
  docType: FiscalDocType
  status: FiscalStatus
  numero: string | null
  serie: string | null
  accessKey: string | null
  protocol: string | null
  authorizedAt: string | null
  xmlUrl: string | null
  pdfUrl: string | null
  errorMessage: string | null
  totalCents: number | null
  createdAt: string
  updatedAt: string
}

export type FiscalStats = {
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
  totalAuthorizedCents: number
  pendingCount: number
  rejectedCount: number
}

const BASE = '/api/v1/fiscal'

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

export const fiscalApi = {
  list: (params: { status?: FiscalStatus | 'all'; docType?: FiscalDocType; limit?: number } = {}) => {
    const sp = new URLSearchParams()
    if (params.status) sp.set('status', params.status)
    if (params.docType) sp.set('docType', params.docType)
    if (params.limit) sp.set('limit', String(params.limit))
    const qs = sp.toString()
    return req<{ items: FiscalDocument[] }>('GET', qs ? `${BASE}?${qs}` : BASE)
  },
  get: (id: string) => req<FiscalDocument>('GET', `${BASE}/${id}`),
  create: (body: { orderId: string; docType: FiscalDocType }) =>
    req<FiscalDocument>('POST', BASE, body),
  emit: (id: string, simulateReject = false) =>
    req<FiscalDocument>('POST', `${BASE}/${id}/emit`, simulateReject ? { simulate: 'reject' } : {}),
  retry: (id: string, body: { approved?: boolean; errorMessage?: string | null } = {}) =>
    req<FiscalDocument>('POST', `${BASE}/${id}/retry`, body),
  cancel: (id: string, reason: string) =>
    req<FiscalDocument>('POST', `${BASE}/${id}/cancel`, { reason }),
  stats: () => req<FiscalStats>('GET', `${BASE}/stats`),
}

export { ApiErr }

// ===== Helpers =====

export const FISCAL_STATUS_LABELS: Record<FiscalStatus, string> = {
  PENDING: 'Pendente',
  AUTHORIZED: 'Autorizada',
  REJECTED: 'Rejeitada',
  CANCELED: 'Cancelada',
  DENIED: 'Denegada',
}

export const FISCAL_STATUS_TONE: Record<FiscalStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  AUTHORIZED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELED: 'bg-slate-100 text-slate-700 border-slate-200',
  DENIED: 'bg-rose-100 text-rose-700 border-rose-200',
}

export const FISCAL_DOC_TYPE_LABELS: Record<FiscalDocType, string> = {
  NFE: 'NF-e (modelo 55)',
  NFCE: 'NFC-e (modelo 65)',
}

export function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Formata a chave de acesso em grupos (4 dígitos) para facilitar a leitura. */
export function formatAccessKey(key: string | null | undefined): string {
  if (!key) return '—'
  return key.match(/.{1,4}/g)?.join(' ') ?? key
}

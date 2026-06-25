'use client'

/**
 * Cliente HTTP para o módulo de Caixa (Cash Register).
 */

export type CashMovementType = 'sale' | 'withdrawal' | 'supply' | 'tip' | 'adjustment'

export type CashSession = {
  id: string
  tenantId: string
  registerName: string
  operatorName: string
  openingCents: number
  closingCents: number | null
  expectedCents: number
  differenceCents: number | null
  status: 'open' | 'closed'
  notes: string | null
  openedAt: string
  closedAt: string | null
}

export type CashMovement = {
  id: string
  tenantId: string
  sessionId: string
  type: CashMovementType
  amountCents: number
  reason: string | null
  orderId: string | null
  createdAt: string
  createdBy: string | null
}

const BASE = '/api/v1/cash'

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
    throw new ApiErr(res.status, data.code ?? data.error ?? 'ERROR', data.message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export const cashApi = {
  getOpenSession: () => req<{ session: CashSession | null }>('GET', `${BASE}/session/open`),
  listSessions: (status: 'open' | 'closed' | 'all' = 'all') =>
    req<{ items: CashSession[] }>('GET', `${BASE}/sessions?status=${status}`),
  getSession: (id: string) => req<CashSession>('GET', `${BASE}/sessions/${id}`),
  openSession: (body: { registerName?: string; operatorName: string; openingCents?: number; notes?: string | null }) =>
    req<CashSession>('POST', `${BASE}/sessions`, body),
  closeSession: (id: string, body: { closingCents: number; notes?: string | null }) =>
    req<CashSession>('POST', `${BASE}/sessions/${id}/close`, body),
  listMovements: (sessionId?: string) =>
    req<{ items: CashMovement[] }>('GET', sessionId ? `${BASE}/movements?sessionId=${sessionId}` : `${BASE}/movements`),
  addMovement: (body: { sessionId: string; type: CashMovementType; amountCents: number; reason?: string | null; orderId?: string | null }) =>
    req<CashMovement>('POST', `${BASE}/movements`, body),
}

export { ApiErr }

// ============ HELPERS ============

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

export const MOVEMENT_LABELS: Record<CashMovementType, string> = {
  sale: 'Venda',
  withdrawal: 'Sangria',
  supply: 'Suprimento',
  tip: 'Gorjeta',
  adjustment: 'Ajuste',
}

export const MOVEMENT_TONE: Record<CashMovementType, string> = {
  sale: 'bg-emerald-950/40 text-emerald-300 border-emerald-900',
  withdrawal: 'bg-rose-950/40 text-rose-300 border-rose-900',
  supply: 'bg-sky-950/40 text-sky-300 border-sky-900',
  tip: 'bg-amber-950/40 text-amber-300 border-amber-900',
  adjustment: 'bg-slate-800/60 text-slate-300 border-slate-700',
}

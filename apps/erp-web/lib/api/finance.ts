'use client'

/**
 * Cliente HTTP para o Financeiro — Contas a Receber.
 *
 * Endpoints consumidos:
 *   GET  /api/v1/finance/ar?status=          (lista contas a receber)
 *   POST /api/v1/finance/ar/:id/settle        (receber / liquidar)
 */

export type ARStatus = 'OPEN' | 'SETTLED' | 'CANCELLED'

export type AccountReceivable = {
  id: string
  tenantId: string
  branchId: string
  orderId: string
  amountCents: number
  status: ARStatus
  dueDate: string
  createdAt: string
  settledAt: string | null
}

export const AR_STATUS_LABELS: Record<ARStatus, string> = {
  OPEN: 'Em aberto',
  SETTLED: 'Recebido',
  CANCELLED: 'Cancelado',
}

export const AR_STATUS_TONE: Record<ARStatus, 'yellow' | 'green' | 'red'> = {
  OPEN: 'yellow',
  SETTLED: 'green',
  CANCELLED: 'red',
}

const API_BASE = '/api/v1/finance/ar'

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

function buildUrl(path: string, params: Record<string, string | undefined> = {}): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`
}

export const financeApi = {
  list: (params: { status?: ARStatus } = {}) =>
    req<{ items: AccountReceivable[] }>('GET', buildUrl('', { status: params.status })),
  settle: (id: string) => req<AccountReceivable>('POST', `${API_BASE}/${id}/settle`),
}

export { ApiErr }

// ============ HELPERS ============

export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

export function arShortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '--/--/----'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '--/--/---- --:--'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Retorna { isOverdue, daysOverdue, label }.
 * Considera overdue se dueDate < início do dia de hoje e status=OPEN.
 */
export function dueInfo(ar: AccountReceivable, now: Date = new Date()): {
  isOverdue: boolean
  daysOverdue: number
  isDueToday: boolean
  label: string
} {
  const due = new Date(ar.dueDate)
  if (ar.status !== 'OPEN') {
    return { isOverdue: false, daysOverdue: 0, isDueToday: false, label: '—' }
  }
  if (!Number.isFinite(due.getTime())) {
    return { isOverdue: false, daysOverdue: 0, isDueToday: false, label: '—' }
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dueStart = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
  ).getTime()
  const days = Math.floor((startOfToday - dueStart) / 86_400_000)
  const isOverdue = days > 0
  const isDueToday = days === 0
  if (isOverdue) return { isOverdue, daysOverdue: days, isDueToday, label: `${days}d atraso` }
  if (isDueToday) return { isOverdue, daysOverdue: 0, isDueToday, label: 'Vence hoje' }
  if (days === -1) return { isOverdue, daysOverdue: 0, isDueToday, label: 'Vence amanhã' }
  return { isOverdue, daysOverdue: 0, isDueToday, label: `Vence em ${-days}d` }
}

export const TONE_BG: Record<string, string> = {
  yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  green: 'bg-green-500/10 text-green-400 border border-green-500/20',
  red: 'bg-red-500/10 text-red-400 border border-red-500/20',
  gray: 'bg-white/[0.05] text-white/60 border border-white/[0.08]',
}

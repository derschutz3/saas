'use client'

/**
 * Cliente HTTP para o módulo de Clientes (CRM).
 */

export type CustomerLifecycle = 'lead' | 'active' | 'inactive' | 'churned'

export type Customer = {
  id: string
  tenantId: string
  name: string
  tradeName: string | null
  taxId: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  tags: string[]
  lifecycle: CustomerLifecycle
  notes: string | null
  creditLimitCents: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CustomerInput = {
  name: string
  tradeName?: string | null
  taxId?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  tags?: string[]
  lifecycle?: CustomerLifecycle
  notes?: string | null
  creditLimitCents?: number | null
  active?: boolean
}

export type CustomerStats = {
  total: number
  active: number
  archived: number
  byLifecycle: { lead: number; active: number; inactive: number; churned: number }
  vip: number
}

const BASE = '/api/v1/customers'

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

export const customersApi = {
  list: (params: { query?: string; includeArchived?: boolean; lifecycle?: CustomerLifecycle; tag?: string } = {}) => {
    const sp = new URLSearchParams()
    if (params.query) sp.set('query', params.query)
    if (params.includeArchived) sp.set('includeArchived', '1')
    if (params.lifecycle) sp.set('lifecycle', params.lifecycle)
    if (params.tag) sp.set('tag', params.tag)
    const qs = sp.toString()
    return req<{ items: Customer[] }>('GET', qs ? `${BASE}?${qs}` : BASE)
  },
  stats: () => req<CustomerStats>('GET', `${BASE}/stats`),
  get: (id: string) => req<Customer>('GET', `${BASE}/${id}`),
  create: (body: CustomerInput) => req<Customer>('POST', BASE, body),
  update: (id: string, body: Partial<CustomerInput>) => req<Customer>('PATCH', `${BASE}/${id}`, body),
  archive: (id: string) => req<Customer>('POST', `${BASE}/${id}/archive`),
  restore: (id: string) => req<Customer>('POST', `${BASE}/${id}/restore`),
  delete: (id: string) => req<{ deletedId: string }>('DELETE', `${BASE}/${id}`),
}

export { ApiErr }

// ============ HELPERS ============

export function formatDocument(doc: string | null | undefined): string {
  if (!doc) return '—'
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4-')
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return doc
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return phone
}

export function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const LIFECYCLE_LABELS: Record<CustomerLifecycle, string> = {
  lead: 'Lead',
  active: 'Ativo',
  inactive: 'Inativo',
  churned: 'Perdido',
}

export const LIFECYCLE_TONE: Record<CustomerLifecycle, string> = {
  lead: 'bg-sky-950/40 text-sky-300 border-sky-900',
  active: 'bg-emerald-950/40 text-emerald-300 border-emerald-900',
  inactive: 'bg-slate-800/60 text-slate-300 border-slate-700',
  churned: 'bg-rose-950/40 text-rose-300 border-rose-900',
}

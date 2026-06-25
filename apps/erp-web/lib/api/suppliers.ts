'use client'

/**
 * Cliente HTTP para o módulo de Fornecedores.
 *
 * Endpoints consumidos:
 *   GET    /api/v1/suppliers[?query=&includeArchived=1]
 *   GET    /api/v1/suppliers/:id
 *   POST   /api/v1/suppliers
 *   PATCH  /api/v1/suppliers/:id
 *   POST   /api/v1/suppliers/:id/archive
 *   POST   /api/v1/suppliers/:id/restore
 *   DELETE /api/v1/suppliers/:id
 */

export type Supplier = {
  id: string
  tenantId: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  contactName: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  paymentTerms: string | null
  leadTimeDays: number | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type SupplierInput = {
  name: string
  document?: string | null
  email?: string | null
  phone?: string | null
  contactName?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  paymentTerms?: string | null
  leadTimeDays?: number | null
  notes?: string | null
  active?: boolean
}

const BASE = '/api/v1/suppliers'

class ApiErr extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function req<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
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

export const suppliersApi = {
  list: (params: { query?: string; includeArchived?: boolean } = {}, signal?: AbortSignal) => {
    const sp = new URLSearchParams()
    if (params.query) sp.set('query', params.query)
    if (params.includeArchived) sp.set('includeArchived', '1')
    const qs = sp.toString()
    return req<{ items: Supplier[] }>('GET', qs ? `${BASE}?${qs}` : BASE, undefined, signal)
  },
  get: (id: string, signal?: AbortSignal) => req<Supplier>('GET', `${BASE}/${id}`, undefined, signal),
  create: (body: SupplierInput, signal?: AbortSignal) => req<Supplier>('POST', BASE, body, signal),
  update: (id: string, body: Partial<SupplierInput>, signal?: AbortSignal) => req<Supplier>('PATCH', `${BASE}/${id}`, body, signal),
  archive: (id: string, signal?: AbortSignal) => req<Supplier>('POST', `${BASE}/${id}/archive`, undefined, signal),
  restore: (id: string, signal?: AbortSignal) => req<Supplier>('POST', `${BASE}/${id}/restore`, undefined, signal),
  delete: (id: string, signal?: AbortSignal) => req<{ deletedId: string }>('DELETE', `${BASE}/${id}`, undefined, signal),
}

export { ApiErr }

// ============ HELPERS ============

/** Formata um CNPJ (14 dígitos) ou CPF (11 dígitos) com pontuação. */
export function formatDocument(doc: string | null | undefined): string {
  if (!doc) return '—'
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4-')
  }
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return doc
}

/** Formata telefone (10 ou 11 dígitos) com pontuação brasileira. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return phone
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

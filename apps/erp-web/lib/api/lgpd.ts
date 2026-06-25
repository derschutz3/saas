'use client'

/**
 * Cliente HTTP para endpoints LGPD (Lei 13.709/2018 — Art. 18, V e VI).
 *
 * Endpoints:
 *   GET  /api/v1/lgpd/customers/:id/data-export  — exporta todos os dados pessoais
 *   POST /api/v1/lgpd/customers/:id/anonymize    — anonimiza dados (Art. 18, VI)
 *
 * LGPD Art. 18, V: direito de acesso — o titular pode solicitar uma cópia
 * de todos os dados pessoais que o sistema armazena sobre ele.
 *
 * LGPD Art. 18, VI: direito de eliminação — o titular pode solicitar a
 * eliminação completa dos seus dados pessoais (anonimização para preservar
 * integridade referencial).
 *
 * Restrição: apenas OWNER/ADMIN pode acionar estas rotas (controle de
 * identidade do titular fica para um fluxo separado com OTP).
 */

const BASE = '/api/v1/lgpd'

class ApiErr extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type CustomerProfile = {
  id: string
  name: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  tags: string[]
  lifecycle: string
  notes: string | null
  creditLimitCents: number
  createdAt: string
  updatedAt: string
}

export type OrderSnapshot = {
  id: string
  channel: string
  status: string
  subtotalCents: number
  totalCents: number
  createdAt: string
  customerName: string
  customerPhone: string | null
  deliveryAddress: string | null
}

export type DataExportPayload = {
  ok: true
  data: {
    profile: CustomerProfile
    orders: OrderSnapshot[]
    generatedAt: string
  }
}

export type AnonymizeResponse = {
  ok: true
  customerId: string
  anonymizedAt: string
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
    throw new ApiErr(res.status, data.code ?? data.error ?? 'ERROR', data.message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export const lgpdApi = {
  /** Direito de acesso (Art. 18, V): exporta todos os dados do customer. */
  exportData: (customerId: string, signal?: AbortSignal) =>
    req<DataExportPayload>('GET', `${BASE}/customers/${customerId}/data-export`, undefined, signal),

  /** Direito de eliminação (Art. 18, VI): anonimiza dados do customer. */
  anonymize: (customerId: string, signal?: AbortSignal) =>
    req<AnonymizeResponse>('POST', `${BASE}/customers/${customerId}/anonymize`, {}, signal),
}

export { ApiErr }

/**
 * Faz download de um payload JSON como arquivo (.json) no browser.
 * Usado para LGPD data-export — o titular recebe um arquivo portátil.
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

'use client'

/**
 * Cliente HTTP para o módulo de Pedidos.
 *
 * Endpoints consumidos:
 *   GET    /api/v1/orders?status=&channel=
 *   GET    /api/v1/orders/:id
 *   POST   /api/v1/orders                body: { channel, customerName, customerPhone, deliveryAddress, items[] }
 *   POST   /api/v1/orders/:id/status     body: { status }
 */

// Channels como a API realmente retorna (lowercase).
// Usamos lowercase como chave canônica e expomos um helper para o label legível.
export type OrderChannel = 'balcao' | 'whatsapp' | 'ifood' | 'rappi' | '99eats' | 'site'

export type OrderStatus =
  | 'RECEBIDO'
  | 'CONFIRMADO'
  | 'EM_SEPARACAO'
  | 'SEPARADO'
  | 'SAIU_PARA_ENTREGA'
  | 'ENTREGUE'
  | 'CANCELADO'

export type OrderItem = {
  id: string
  productId: string
  productName: string
  unitCode: string
  unitLabel: string
  quantity: number
  quantityBase: number
  unitPriceCents: number
  totalCents: number
}

export type OrderItemInput = {
  productId: string
  unitCode?: string
  quantity: number
  unitPriceCents?: number
  notes?: string
}

export type CreateOrderInput = {
  channel: OrderChannel
  customerName?: string
  customerPhone?: string
  customerId?: string
  deliveryAddress?: string
  notes?: string
  deliveryFeeCents?: number
  items: OrderItemInput[]
}

export type Order = {
  id: string
  tenantId: string
  branchId: string
  channel: OrderChannel
  customerName: string | null
  customerPhone: string | null
  deliveryAddress: string | null
  status: OrderStatus
  subtotalCents: number
  totalCents: number
  createdAt: string
  updatedAt: string
  createdBy: string
  items: OrderItem[]
}

// Estágios da fila operacional — todos exceto ENTREGUE e CANCELADO
export const QUEUE_STATUSES: OrderStatus[] = [
  'RECEBIDO',
  'CONFIRMADO',
  'EM_SEPARACAO',
  'SEPARADO',
  'SAIU_PARA_ENTREGA',
]

// Transições válidas conforme o backend
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  RECEBIDO: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['EM_SEPARACAO', 'CANCELADO'],
  EM_SEPARACAO: ['SEPARADO', 'CANCELADO'],
  SEPARADO: ['SAIU_PARA_ENTREGA', 'CANCELADO'],
  SAIU_PARA_ENTREGA: ['ENTREGUE', 'CANCELADO'],
  ENTREGUE: [],
  CANCELADO: [],
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  RECEBIDO: 'Recebido',
  CONFIRMADO: 'Confirmado',
  EM_SEPARACAO: 'Em separação',
  SEPARADO: 'Separado',
  SAIU_PARA_ENTREGA: 'Saiu p/ entrega',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export const STATUS_TONE: Record<OrderStatus, 'blue' | 'green' | 'yellow' | 'orange' | 'cyan' | 'red' | 'gray'> = {
  RECEBIDO: 'blue',
  CONFIRMADO: 'green',
  EM_SEPARACAO: 'yellow',
  SEPARADO: 'orange',
  SAIU_PARA_ENTREGA: 'cyan',
  ENTREGUE: 'green',
  CANCELADO: 'red',
}

export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  balcao: 'Balcão',
  whatsapp: 'WhatsApp',
  ifood: 'iFood',
  rappi: 'Rappi',
  '99eats': '99 Eats',
  site: 'Site',
}

/**
 * Retorna o label legível para um channel vindo da API (lowercase).
 * Aceita também uppercase para tolerância.
 */
export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return '—'
  const key = channel.toLowerCase() as OrderChannel
  return CHANNEL_LABELS[key] ?? channel
}

const API_BASE = '/api/v1/orders'

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

export const ordersApi = {
  list: (params: { status?: OrderStatus; channel?: OrderChannel } = {}) =>
    req<{ items: Order[] }>('GET', buildUrl('', { status: params.status, channel: params.channel })),
  get: (id: string) => req<Order>('GET', `${API_BASE}/${id}`),
  create: (input: CreateOrderInput) => req<{ order: Order }>('POST', API_BASE, input),
  updateStatus: (id: string, status: OrderStatus) =>
    req<{ order: Order; previousStatus: OrderStatus }>('POST', `${API_BASE}/${id}/status`, { status }),
}

export { ApiErr }

// ============ HELPERS DE FORMATAÇÃO ============

export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '--:--'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

export function orderShortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function timeAgo(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `há ${diffD}d`
}

// Tom de cor (verde/amarelo/azul/...) → classes Tailwind para pills
export const TONE_BG: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  green: 'bg-green-500/10 text-green-400 border border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  red: 'bg-red-500/10 text-red-400 border border-red-500/20',
  gray: 'bg-white/[0.05] text-white/60 border border-white/[0.08]',
}

export const TONE_DOT: Record<string, string> = {
  blue: 'hsl(217 91% 67%)',
  green: 'hsl(142 71% 55%)',
  yellow: 'hsl(38 92% 55%)',
  orange: 'hsl(20 90% 60%)',
  cyan: 'hsl(189 80% 60%)',
  red: 'hsl(0 86% 65%)',
  gray: 'hsl(215 16% 47%)',
}

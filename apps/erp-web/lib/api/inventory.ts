'use client'

/**
 * Cliente HTTP para o módulo de Estoque.
 *
 * Endpoints consumidos:
 *   GET  /api/v1/inventory/balance?productId=    (saldo de um produto)
 *   GET  /api/v1/inventory/movements?productId=  (movimentações de um produto)
 *   POST /api/v1/inventory/adjustments           body: { productId, quantityDeltaBase, reason }
 */

import { productsApi, type Product } from './products'

export type MovementType = 'SALE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT'
export type RefType = 'ORDER' | 'ADJUSTMENT' | 'TRANSFER' | null

export type InventoryMovement = {
  id: string
  tenantId: string
  branchId: string
  productId: string
  movementType: MovementType
  quantityBase: number
  refType: RefType
  refId: string | null
  reason: string | null
  createdAt: string
  createdBy: string
}

export type InventoryBalance = {
  productId: string
  quantityBase: number
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  SALE: 'Venda',
  ADJUSTMENT: 'Ajuste',
  TRANSFER_IN: 'Transf. entrada',
  TRANSFER_OUT: 'Transf. saída',
}

export const MOVEMENT_TONE: Record<MovementType, 'red' | 'green' | 'blue' | 'gray'> = {
  SALE: 'red',
  ADJUSTMENT: 'blue',
  TRANSFER_IN: 'green',
  TRANSFER_OUT: 'red',
}

const API_BASE = '/api/v1/inventory'

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

function buildUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`
}

export const inventoryApi = {
  balance: (productId: string, signal?: AbortSignal) =>
    req<{ productId: string; quantityBase: number }>('GET', buildUrl('/balance', { productId }), undefined, signal),
  movements: (params: { productId?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    req<{ items: InventoryMovement[]; total: number }>(
      'GET',
      buildUrl('/movements', { productId: params.productId, limit: params.limit, offset: params.offset }),
      undefined,
      signal,
    ),
  adjust: (input: {
    productId: string
    quantity: number
    type: 'in' | 'out'
    reason?: string
  }, signal?: AbortSignal) =>
    req<{ balance: InventoryBalance; movement: InventoryMovement }>(
      'POST',
      `${API_BASE}/adjustments`,
      input,
      signal,
    ),
}

export { ApiErr, productsApi, type Product }

// ============ HELPERS ============

export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
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

/** Formata uma quantidade em unidades base (que pode ser decimal). */
export function formatQty(qty: number, baseUnit: string): string {
  const rounded = Math.round(qty * 100) / 100
  const str = rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return `${str} ${baseUnit}`
}

export const TONE_BG: Record<string, string> = {
  red: 'bg-red-500/10 text-red-400 border border-red-500/20',
  green: 'bg-green-500/10 text-green-400 border border-green-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  gray: 'bg-white/[0.05] text-white/60 border border-white/[0.08]',
}

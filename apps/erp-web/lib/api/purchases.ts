'use client'

/**
 * Cliente HTTP para o módulo de Pedidos de Compra (Compras).
 *
 * Endpoints consumidos:
 *   GET    /api/v1/purchases[?status=&supplierId=]
 *   GET    /api/v1/purchases/:id
 *   POST   /api/v1/purchases
 *   PATCH  /api/v1/purchases/:id
 *   POST   /api/v1/purchases/:id/receive
 *   DELETE /api/v1/purchases/:id
 */

import type { Supplier } from './suppliers'
import type { Product } from './products'

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELED'

export type PurchaseOrderItem = {
  productId: string
  productName: string
  sku: string
  unitCode: string
  quantity: number
  unitCostCents: number
  totalCents: number
}

export type PurchaseOrder = {
  id: string
  tenantId: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  totalCents: number
  expectedDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  receivedAt: string | null
  receivedBy: string | null
  createdBy: string
}

export type PurchaseOrderItemInput = {
  productId: string
  productName?: string
  sku?: string
  unitCode?: string
  quantity: number
  unitCostCents: number
}

export type PurchaseOrderInput = {
  supplierId: string
  status?: PurchaseOrderStatus
  expectedDate?: string | null
  items: PurchaseOrderItemInput[]
  notes?: string | null
}

export type PurchaseOrderUpdateInput = {
  status?: PurchaseOrderStatus
  expectedDate?: string | null
  notes?: string | null
}

const BASE = '/api/v1/purchases'

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

export const purchasesApi = {
  list: (params: { status?: PurchaseOrderStatus | 'all'; supplierId?: string } = {}, signal?: AbortSignal) => {
    const sp = new URLSearchParams()
    if (params.status) sp.set('status', params.status)
    if (params.supplierId) sp.set('supplierId', params.supplierId)
    const qs = sp.toString()
    return req<{ items: PurchaseOrder[] }>('GET', qs ? `${BASE}?${qs}` : BASE, undefined, signal)
  },
  get: (id: string, signal?: AbortSignal) => req<PurchaseOrder>('GET', `${BASE}/${id}`, undefined, signal),
  create: (body: PurchaseOrderInput, signal?: AbortSignal) => req<PurchaseOrder>('POST', BASE, body, signal),
  update: (id: string, body: PurchaseOrderUpdateInput, signal?: AbortSignal) =>
    req<PurchaseOrder>('PATCH', `${BASE}/${id}`, body, signal),
  receive: (id: string, signal?: AbortSignal) =>
    req<{ order: PurchaseOrder; movementsCreated: number }>('POST', `${BASE}/${id}/receive`, undefined, signal),
  remove: (id: string, signal?: AbortSignal) => req<{ deletedId: string }>('DELETE', `${BASE}/${id}`, undefined, signal),
}

export { ApiErr }

// ============ HELPERS ============

export const PURCHASE_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  CONFIRMED: 'Confirmado',
  RECEIVED: 'Recebido',
  CANCELED: 'Cancelado',
}

export const PURCHASE_STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  SENT: 'bg-blue-100 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-amber-100 text-amber-700 border-amber-200',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELED: 'bg-rose-100 text-rose-700 border-rose-200',
}

export function formatMoneyCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function calcOrderTotalCents(items: PurchaseOrderItemInput[]): number {
  return items.reduce((acc, it) => acc + Math.round(it.quantity * it.unitCostCents), 0)
}

/** Próximos status permitidos a partir do atual. */
export function nextStatusOptions(current: PurchaseOrderStatus): PurchaseOrderStatus[] {
  switch (current) {
    case 'DRAFT':
      return ['SENT', 'CANCELED']
    case 'SENT':
      return ['CONFIRMED', 'CANCELED']
    case 'CONFIRMED':
      return ['RECEIVED', 'CANCELED']
    case 'RECEIVED':
    case 'CANCELED':
      return []
  }
}

/** Tipo utilitário: produto usado no autocomplete. */
export type ProductLookup = Pick<Product, 'id' | 'name' | 'sku' | 'baseUnit'>

/** Tipo utilitário: supplier usado no select. */
export type SupplierLookup = Pick<Supplier, 'id' | 'name'>

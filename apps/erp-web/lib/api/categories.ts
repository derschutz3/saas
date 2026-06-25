'use client'

/**
 * Tipos e cliente HTTP para o módulo de Categorias.
 *
 * Mantém contrato estável com o backend:
 *   GET    /api/v1/categories[?includeArchived=1]
 *   GET    /api/v1/categories/:id
 *   POST   /api/v1/categories
 *   PATCH  /api/v1/categories/:id
 *   POST   /api/v1/categories/:id/archive
 *   POST   /api/v1/categories/:id/restore
 *   DELETE /api/v1/categories/:id          body: { fallbackCategoryId: string | null }
 *   PUT    /api/v1/categories/reorder      body: { orderedIds: string[] }
 *   POST   /api/v1/categories/bulk-move    body: { productIds: string[], targetCategoryId: string | null }
 *
 * Também expõe:
 *   POST /api/v1/agent/nfe/parse           body: { xml?: string, text?: string }
 *   POST /api/v1/agent/nfe/commit          body: { items: [...] }
 *   POST /api/v1/products                  body: { sku, name, baseUnit, categoryId, active, priceCents? }
 */

export type Category = {
  id: string
  tenantId: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  position: number
  isSystem: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  productCount?: number
}

export type Product = {
  id: string
  tenantId?: string
  sku: string
  name: string
  baseUnit?: string
  categoryId: string | null
  active?: boolean
  /** Custo médio em centavos (R$). Vem do backend quando o CMV está ativo. */
  averageCostCents?: number
  createdAt?: string
}

export type NfeProductItem = {
  sku: string | null
  name: string
  unit: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  /** ID do produto já existente (detectado por SKU). */
  existingProductId: string | null
}

export type NfeParseResult = {
  nfeNumber: string | null
  series: string | null
  emissionDate: string | null
  issuerName: string | null
  issuerCnpj: string | null
  totalCents: number
  products: NfeProductItem[]
}

const BASE = '/api/v1/categories'
const PRODUCT_BASE = '/api/v1/products'
const NFE_BASE = '/api/v1/agent/nfe'

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
    const data: { code?: string; message?: string } = await res.json().catch(() => ({}))
    throw new ApiErr(res.status, data.code ?? 'ERROR', data.message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export const categoriesApi = {
  list: (opts: { includeArchived?: boolean } = {}, signal?: AbortSignal) => {
    const qs = opts.includeArchived ? '?includeArchived=1' : ''
    return req<{ items: Category[] }>('GET', `${BASE}${qs}`, undefined, signal)
  },
  get: (id: string, signal?: AbortSignal) => req<Category & { productCount: number }>('GET', `${BASE}/${id}`, undefined, signal),
  create: (body: { name: string; description?: string | null; color?: string | null; icon?: string | null }, signal?: AbortSignal) =>
    req<Category>('POST', BASE, body, signal),
  update: (id: string, body: Partial<{ name: string; description: string | null; color: string | null; icon: string | null; position: number }>, signal?: AbortSignal) =>
    req<Category>('PATCH', `${BASE}/${id}`, body, signal),
  archive: (id: string, signal?: AbortSignal) => req<Category>('POST', `${BASE}/${id}/archive`, undefined, signal),
  restore: (id: string, signal?: AbortSignal) => req<Category>('POST', `${BASE}/${id}/restore`, undefined, signal),
  delete: (id: string, fallbackCategoryId: string | null, signal?: AbortSignal) =>
    req<{ deletedId: string; movedItems: number }>('DELETE', `${BASE}/${id}`, { fallbackCategoryId }, signal),
  reorder: (orderedIds: string[], signal?: AbortSignal) => req<{ items: Category[] }>('PUT', `${BASE}/reorder`, { orderedIds }, signal),
  bulkMove: (productIds: string[], targetCategoryId: string | null, signal?: AbortSignal) =>
    req<{ moved: number }>('POST', `${BASE}/bulk-move`, { productIds, targetCategoryId }, signal),
}

export const productsApi = {
  list: (params: { query?: string; categoryId?: string | null } = {}, signal?: AbortSignal) => {
    const sp = new URLSearchParams()
    if (params.query) sp.set('query', params.query)
    if (params.categoryId !== undefined) {
      sp.set('categoryId', params.categoryId === null ? 'null' : params.categoryId)
    }
    const qs = sp.toString()
    return req<{ items: Product[] }>('GET', qs ? `${PRODUCT_BASE}?${qs}` : PRODUCT_BASE, undefined, signal)
  },
  create: (body: {
    sku: string
    name: string
    baseUnit: string
    categoryId?: string | null
    active?: boolean
    /** Estoque inicial (gera movimento ADJUSTMENT inicial). */
    stock?: number
    /** Preço de venda em centavos (cria SaleUnit + 4 canais). */
    priceCents?: number
    /** Custo unitário em centavos (grava como CMV inicial). */
    costCents?: number
  }, signal?: AbortSignal) => req<Product>('POST', PRODUCT_BASE, body, signal),
  update: (id: string, body: {
    sku?: string
    name?: string
    categoryId?: string | null
    active?: boolean
    baseUnit?: string
    costCents?: number
    priceCents?: number
    /** Estoque desejado (gera ADJUSTMENT com a diferença). */
    stock?: number
    stockReason?: string
  }, signal?: AbortSignal) => req<{ product: Product; stockMovement: { movementId: string; previousBalance: number; newBalance: number } | null }>('PATCH', `${PRODUCT_BASE}/${id}`, body, signal),
}

export const nfeApi = {
  parse: (body: { xml?: string; text?: string }, signal?: AbortSignal) => req<NfeParseResult>('POST', `${NFE_BASE}/parse`, body, signal),
  commit: (items: Array<{
    sku?: string | null
    name: string
    unit?: string
    quantity: number
    categoryId: string | null
    addToStockIfExists?: boolean
  }>, signal?: AbortSignal) =>
    req<{
      results: Array<{ name: string; status: 'created' | 'updated' | 'skipped' | 'error'; productId?: string; message?: string }>
      summary: { total: number; created: number; updated: number; errors: number }
    }>('POST', `${NFE_BASE}/commit`, { items }, signal),
}

export { ApiErr }

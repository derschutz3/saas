'use client'

/**
 * Cliente HTTP para Produtos.
 *
 * Endpoints consumidos:
 *   GET /api/v1/products?query=&categoryId=   (lista / busca)
 *   GET /api/v1/products/:id
 *   GET /api/v1/categories
 */

export type ProductSaleUnit = {
  unitCode: string
  label: string
  factorToBase: number
  /** Preço por canal em centavos. */
  prices: Partial<Record<ChannelKey, number>>
}

export type Product = {
  id: string
  tenantId: string
  sku: string
  name: string
  baseUnit: string
  categoryId: string | null
  active: boolean
  createdAt: string
  saleUnits: ProductSaleUnit[]
}

export type Category = {
  id: string
  name: string
  color: string
  icon: string | null
  parentId: string | null
}

const API_BASE = '/api/v1'

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

export const productsApi = {
  list: (params: { query?: string; categoryId?: string } = {}, signal?: AbortSignal) =>
    req<{ items: Product[] }>('GET', buildUrl('/products', params), undefined, signal),
  get: (id: string, signal?: AbortSignal) => req<Product>('GET', `${API_BASE}/products/${id}`, undefined, signal),
}

export const categoriesApi = {
  list: (signal?: AbortSignal) => req<{ items: Category[] }>('GET', `${API_BASE}/categories`, undefined, signal),
}

export { ApiErr }

// ============ HELPERS ============

/** Chaves dos preços por canal — a API pode ter 'BALCAO'/'WHATSAPP'/'CATALOGO'/'DELIVERY' ou 'balcao'/'whatsapp'/'ifood'. */
export type ChannelKey =
  | 'balcao'
  | 'whatsapp'
  | 'ifood'
  | 'rappi'
  | '99eats'
  | 'site'
  | 'BALCAO'
  | 'WHATSAPP'
  | 'CATALOGO'
  | 'DELIVERY'

/**
 * Retorna o preço (em centavos) de uma unidade de venda para um canal.
 * Se não houver preço configurado, retorna 0.
 */
export function priceForUnit(unit: ProductSaleUnit, channel: string): number {
  const ch = channel as ChannelKey
  if (unit.prices[ch] !== undefined) return unit.prices[ch] as number
  // Tenta variações (lowercase / uppercase)
  const up = channel.toUpperCase() as ChannelKey
  if (unit.prices[up] !== undefined) return unit.prices[up] as number
  return 0
}

export function unitLabel(unit: ProductSaleUnit): string {
  return unit.label || unit.unitCode
}

export function defaultUnit(product: Product): ProductSaleUnit {
  return product.saleUnits[0]
}

export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

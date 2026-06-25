'use client'

/**
 * Cliente HTTP para o módulo de Relatórios de Vendas.
 *
 * Endpoints consumidos:
 *   GET /api/v1/reports/sales/overview?from=&to=
 *   GET /api/v1/reports/sales/timeseries?from=&to=&granularity=day|week
 *   GET /api/v1/reports/sales/products?from=&to=&limit=&sortBy=revenue|quantity
 *   GET /api/v1/reports/sales/channels?from=&to=
 *   GET /api/v1/reports/sales/customers?from=&to=&limit=
 *   GET /api/v1/reports/sales/export?from=&to=&format=csv
 */

const API_BASE = '/api/v1'

export type SalesKpis = {
  totalRevenueCents: number
  totalOrders: number
  avgTicketCents: number
  uniqueCustomers: number
  cancelledOrders: number
}

export type SalesGrowth = {
  revenuePct: number
  ordersPct: number
}

export type SalesOverview = {
  range: { fromMs: number; toMs: number; days: number }
  kpis: SalesKpis
  growth: SalesGrowth
  previousRange: { fromMs: number; toMs: number; revenueCents: number; orders: number }
  format: { currency: string; avgTicket: string }
}

export type TimeseriesPoint = {
  date: string
  revenueCents: number
  orders: number
  customers: number
}

export type TimeseriesResponse = {
  granularity: 'day' | 'week'
  series: TimeseriesPoint[]
}

export type ProductSales = {
  productId: string
  productName: string
  quantitySold: number
  revenueCents: number
  orders: number
}

export type ProductsResponse = {
  sortBy: 'revenue' | 'quantity'
  items: ProductSales[]
}

export type ChannelBreakdown = {
  channel: string
  orders: number
  revenueCents: number
  percentage: number
}

export type ChannelsResponse = {
  items: ChannelBreakdown[]
  totalRevenueCents: number
}

export type CustomerSales = {
  customerKey: string
  customerName: string | null
  orders: number
  revenueCents: number
  lastOrderAt: string
}

export type CustomersResponse = {
  items: CustomerSales[]
}

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

function buildUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`
}

export const reportsApi = {
  overview: (from: string, to: string) =>
    req<SalesOverview>('GET', buildUrl('/reports/sales/overview', { from, to })),
  timeseries: (from: string, to: string, granularity: 'day' | 'week' = 'day') =>
    req<TimeseriesResponse>(
      'GET',
      buildUrl('/reports/sales/timeseries', { from, to, granularity }),
    ),
  products: (
    from: string,
    to: string,
    options: { limit?: number; sortBy?: 'revenue' | 'quantity' } = {},
  ) =>
    req<ProductsResponse>(
      'GET',
      buildUrl('/reports/sales/products', {
        from,
        to,
        limit: options.limit ?? 10,
        sortBy: options.sortBy ?? 'revenue',
      }),
    ),
  channels: (from: string, to: string) =>
    req<ChannelsResponse>('GET', buildUrl('/reports/sales/channels', { from, to })),
  customers: (from: string, to: string, limit = 10) =>
    req<CustomersResponse>(
      'GET',
      buildUrl('/reports/sales/customers', { from, to, limit }),
    ),
  exportCsv: (from: string, to: string): string =>
    buildUrl('/reports/sales/export', { from, to, format: 'csv' }),
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

export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

export function formatPercent(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return '0%'
  return `${pct.toFixed(digits)}%`
}

export function formatDateShort(iso: string): string {
  // iso no formato 'YYYY-MM-DD'
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function downloadFile(url: string, filename?: string): void {
  const a = document.createElement('a')
  a.href = url
  if (filename) a.download = filename
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ============ HELPERS DE PERÍODO ============

export type PresetKey = '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'

export type PeriodRange = {
  from: string // ISO YYYY-MM-DD
  to: string // ISO YYYY-MM-DD
  fromMs: number
  toMs: number
  label: string
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function endOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(23, 59, 59, 999)
  return c
}

export function getPresetRange(preset: PresetKey, custom?: { from: string; to: string }): PeriodRange {
  const now = new Date()
  let from: Date
  let to: Date
  let label: string

  switch (preset) {
    case '7d': {
      to = endOfDay(now)
      from = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000))
      label = 'Últimos 7 dias'
      break
    }
    case '30d': {
      to = endOfDay(now)
      from = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000))
      label = 'Últimos 30 dias'
      break
    }
    case 'thisMonth': {
      to = endOfDay(now)
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
      label = 'Este mês'
      break
    }
    case 'lastMonth': {
      const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDayPrevMonth = new Date(firstThisMonth.getTime() - 1)
      from = startOfDay(new Date(lastDayPrevMonth.getFullYear(), lastDayPrevMonth.getMonth(), 1))
      to = endOfDay(lastDayPrevMonth)
      label = 'Mês passado'
      break
    }
    case 'custom': {
      if (custom && custom.from && custom.to) {
        from = startOfDay(new Date(`${custom.from}T00:00:00`))
        to = endOfDay(new Date(`${custom.to}T23:59:59`))
        label = `${custom.from.split('-').reverse().join('/')} → ${custom.to.split('-').reverse().join('/')}`
      } else {
        to = endOfDay(now)
        from = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000))
        label = 'Últimos 30 dias'
      }
      break
    }
    default: {
      to = endOfDay(now)
      from = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000))
      label = 'Últimos 30 dias'
    }
  }

  return {
    from: toISODate(from),
    to: toISODate(to),
    fromMs: from.getTime(),
    toMs: to.getTime(),
    label,
  }
}

export function rangeDays(range: PeriodRange): number {
  return Math.max(1, Math.round((range.toMs - range.fromMs) / (24 * 60 * 60 * 1000)))
}

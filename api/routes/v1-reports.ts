/**
 * Rotas de Relatórios de Vendas.
 *
 * Endpoints:
 * - GET /api/v1/reports/sales/overview?from=&to=       → KPIs agregados + comparativo
 * - GET /api/v1/reports/sales/timeseries?from=&to=&granularity=day|week
 * - GET /api/v1/reports/sales/products?from=&to=&limit=20&sortBy=revenue|quantity
 * - GET /api/v1/reports/sales/channels?from=&to=
 * - GET /api/v1/reports/sales/customers?from=&to=&limit=20
 * - GET /api/v1/reports/sales/export?from=&to=&format=csv  → arquivo CSV
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { cacheRoute } from '../shared/route-cache.js'
import { logger } from '../shared/logger.js'

// Tipos auxiliares
type Granularity = 'day' | 'week'
type SortBy = 'revenue' | 'quantity'

// Cache curto (20s) para relatórios: cada request reagrega todos os pedidos do
// tenant (até 100k) em memória. Um dashboard que faz polling repete a mesma
// query várias vezes por minuto — 20s de staleness é aceitável para analytics e
// derruba o custo de CPU. Chave inclui tenant + path + querystring (isolamento
// total entre tenants e entre filtros from/to/granularity/sortBy/limit).
const REPORTS_TTL_MS = 20_000
const reportsCache = cacheRoute({
  ttlMs: REPORTS_TTL_MS,
  key: (req) => {
    const ctx = getCtx(req)
    if (!ctx?.tenantId) return ''
    const qs = new URLSearchParams(req.query as Record<string, string>).toString()
    return `reports:${ctx.tenantId}:${req.path}?${qs}`
  },
})

// =============== HELPERS ===============

function parseRange(req: Request): { fromMs: number; toMs: number } {
  const now = Date.now()
  const toStr = typeof req.query.to === 'string' ? req.query.to : null
  const fromStr = typeof req.query.from === 'string' ? req.query.from : null
  const toMs = toStr ? Date.parse(toStr) : now
  const fromMs = fromStr ? Date.parse(fromStr) : toMs - 30 * 24 * 60 * 60 * 1000
  if (!Number.isFinite(toMs) || !Number.isFinite(fromMs)) {
    throw new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'Parâmetros from/to inválidos' })
  }
  if (fromMs > toMs) {
    throw new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'from deve ser anterior a to' })
  }
  return { fromMs, toMs }
}

/** Filtra pedidos por tenant e intervalo, opcionalmente só os pagos/entregues */
function filterOrders<T extends { tenantId: string; createdAt: string; status: string }>(
  orders: T[],
  tenantId: string,
  fromMs: number,
  toMs: number,
  paidOnly: boolean,
): T[] {
  return orders.filter((o) => {
    if (o.tenantId !== tenantId) return false
    const t = Date.parse(o.createdAt)
    if (!Number.isFinite(t) || t < fromMs || t > toMs) return false
    if (paidOnly) {
      // Considera receita: orders com status que contam como venda
      // CANCELLED não conta. PENDING, PREPARING, READY, DELIVERED contam
      if (o.status === 'CANCELLED') return false
    }
    return true
  })
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function startOfWeek(iso: string): string {
  const d = new Date(iso)
  const day = d.getUTCDay() // 0=Dom
  const diff = (day + 6) % 7 // segunda=0
  d.setUTCDate(d.getUTCDate() - diff)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function pctGrowth(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

function centsToReais(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// =============== ROUTES ===============

export const registerReportRoutes = (app: Router): void => {
  const router = Router()

  // ---------- OVERVIEW (KPIs) ----------
  router.get(
    '/sales/overview',
    requireAuth,
    reportsCache,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const { fromMs, toMs } = parseRange(req)
      const range = toMs - fromMs
      const prevFromMs = fromMs - range
      const prevToMs = fromMs

      const all = await store.listAllOrdersForTenant({ tenantId: ctx.tenantId, limit: 100000 })
      const curr = filterOrders(all, ctx.tenantId, fromMs, toMs, true)
      const prev = filterOrders(all, ctx.tenantId, prevFromMs, prevToMs, true)
      const allInRange = filterOrders(all, ctx.tenantId, fromMs, toMs, false)
      const cancelled = allInRange.length - curr.length

      const totalRevenueCents = curr.reduce((s, o) => s + (o.totalCents ?? 0), 0)
      const totalOrders = curr.length
      const avgTicketCents = totalOrders > 0 ? Math.round(totalRevenueCents / totalOrders) : 0
      const uniqueCustomers = new Set(curr.map((o) => o.customerName || o.customerPhone).filter(Boolean)).size

      const prevRevenue = prev.reduce((s, o) => s + (o.totalCents ?? 0), 0)
      const prevOrders = prev.length

      res.json({
        range: { fromMs, toMs, days: Math.ceil(range / (24 * 60 * 60 * 1000)) },
        kpis: {
          totalRevenueCents,
          totalOrders,
          avgTicketCents,
          uniqueCustomers,
          cancelledOrders: cancelled,
        },
        growth: {
          revenuePct: pctGrowth(totalRevenueCents, prevRevenue),
          ordersPct: pctGrowth(totalOrders, prevOrders),
        },
        previousRange: { fromMs: prevFromMs, toMs: prevToMs, revenueCents: prevRevenue, orders: prevOrders },
        format: { currency: centsToReais(totalRevenueCents), avgTicket: centsToReais(avgTicketCents) },
      })
    }),
  )

  // ---------- TIMESERIES (gráfico de linha) ----------
  router.get(
    '/sales/timeseries',
    requireAuth,
    reportsCache,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const { fromMs, toMs } = parseRange(req)
      const gran: Granularity = req.query.granularity === 'week' ? 'week' : 'day'

      const all = await store.listAllOrdersForTenant({ tenantId: ctx.tenantId, limit: 100000 })
      const orders = filterOrders(all, ctx.tenantId, fromMs, toMs, true)

      // Bucket
      const buckets = new Map<string, { revenueCents: number; orders: number; customers: Set<string> }>()
      for (const o of orders) {
        const key = gran === 'week' ? startOfWeek(o.createdAt) : dayKey(o.createdAt)
        const b = buckets.get(key) ?? { revenueCents: 0, orders: 0, customers: new Set() }
        b.revenueCents += o.totalCents ?? 0
        b.orders += 1
        const c = o.customerName || o.customerPhone
        if (c) b.customers.add(c)
        buckets.set(key, b)
      }

      // Preencher dias sem vendas com zero
      const series: { date: string; revenueCents: number; orders: number; customers: number }[] = []
      const start = new Date(fromMs)
      const end = new Date(toMs)
      if (gran === 'day') {
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
          const key = dayKey(d.toISOString())
          const b = buckets.get(key)
          series.push({
            date: key,
            revenueCents: b?.revenueCents ?? 0,
            orders: b?.orders ?? 0,
            customers: b?.customers.size ?? 0,
          })
        }
      } else {
        // semana
        const cursor = new Date(start)
        // alinhar no início da semana (segunda)
        const day = cursor.getUTCDay()
        const diff = (day + 6) % 7
        cursor.setUTCDate(cursor.getUTCDate() - diff)
        while (cursor <= end) {
          const key = dayKey(cursor.toISOString())
          const b = buckets.get(key)
          series.push({
            date: key,
            revenueCents: b?.revenueCents ?? 0,
            orders: b?.orders ?? 0,
            customers: b?.customers.size ?? 0,
          })
          cursor.setUTCDate(cursor.getUTCDate() + 7)
        }
      }

      res.json({ granularity: gran, series })
    }),
  )

  // ---------- TOP PRODUTOS ----------
  router.get(
    '/sales/products',
    requireAuth,
    reportsCache,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const { fromMs, toMs } = parseRange(req)
      const sortBy: SortBy = req.query.sortBy === 'quantity' ? 'quantity' : 'revenue'
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)

      const all = await store.listAllOrdersForTenant({ tenantId: ctx.tenantId, limit: 100000 })
      const orders = filterOrders(all, ctx.tenantId, fromMs, toMs, true)

      const map = new Map<string, {
        productId: string
        productName: string
        quantitySold: number
        revenueCents: number
        orders: number
      }>()

      for (const o of orders) {
        for (const it of o.items ?? []) {
          const cur = map.get(it.productId) ?? {
            productId: it.productId,
            productName: it.productName,
            quantitySold: 0,
            revenueCents: 0,
            orders: 0,
          }
          cur.quantitySold += it.quantityBase ?? it.quantity ?? 0
          cur.revenueCents += it.totalCents ?? 0
          cur.orders += 1
          map.set(it.productId, cur)
        }
      }

      const arr = Array.from(map.values())
      arr.sort((a, b) => (sortBy === 'revenue' ? b.revenueCents - a.revenueCents : b.quantitySold - a.quantitySold))
      res.json({ sortBy, items: arr.slice(0, limit) })
    }),
  )

  // ---------- CMV (Custo da Mercadoria Vendida) ----------
  // Agrega unitCostCents × |quantityBase| nos movimentos SALE no período.
  router.get(
    '/cogs',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
      const { fromMs, toMs } = parseRange(req)
      const store = await getStore()
      const movs = await store.listInventoryMovements({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        from: fromMs ? new Date(fromMs).toISOString() : undefined,
        to: toMs ? new Date(toMs).toISOString() : undefined,
      })
      let cogsCents = 0
      let salesCents = 0
      let qtySold = 0
      for (const m of movs) {
        if (m.movementType !== 'SALE') continue
        const q = Math.abs(m.quantityBase)
        qtySold += q
        if (m.unitCostCents != null) cogsCents += q * m.unitCostCents
        if (m.unitRevenueCents != null) salesCents += q * m.unitRevenueCents
      }
      const grossProfitCents = salesCents - cogsCents
      const marginPct = salesCents > 0 ? Math.round((grossProfitCents / salesCents) * 1000) / 10 : 0
      res.json({
        cogsCents,
        salesCents,
        grossProfitCents,
        marginPct,
        qtySold,
      })
    }),
  )

  // ---------- PREJUÍZO / RENTABILIDADE POR PRODUTO ----------
  // Lista SKUs ordenados por lucro bruto ASC (prejuízo primeiro).
  router.get(
    '/profitability',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
      const { fromMs, toMs } = parseRange(req)
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
      const store = await getStore()
      const movs = await store.listInventoryMovements({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        from: fromMs ? new Date(fromMs).toISOString() : undefined,
        to: toMs ? new Date(toMs).toISOString() : undefined,
      })
      const map = new Map<string, { productId: string; qtySold: number; revenueCents: number; cogsCents: number }>()
      for (const m of movs) {
        if (m.movementType !== 'SALE') continue
        const cur = map.get(m.productId) ?? { productId: m.productId, qtySold: 0, revenueCents: 0, cogsCents: 0 }
        const q = Math.abs(m.quantityBase)
        cur.qtySold += q
        if (m.unitCostCents != null) cur.cogsCents += q * m.unitCostCents
        if (m.unitRevenueCents != null) cur.revenueCents += q * m.unitRevenueCents
        map.set(m.productId, cur)
      }
      const products = await store.listProducts({ tenantId: ctx.tenantId })
      const pMap = new Map(products.map((p) => [p.id, p]))
      const items = Array.from(map.values()).map((r) => {
        const p = pMap.get(r.productId)
        const grossProfitCents = r.revenueCents - r.cogsCents
        const marginPct = r.revenueCents > 0 ? Math.round((grossProfitCents / r.revenueCents) * 1000) / 10 : 0
        return {
          productId: r.productId,
          sku: p?.sku ?? null,
          name: p?.name ?? '—',
          qtySold: r.qtySold,
          revenueCents: r.revenueCents,
          cogsCents: r.cogsCents,
          grossProfitCents,
          marginPct,
          averageCostCents: p?.averageCostCents ?? 0,
        }
      })
      items.sort((a, b) => a.grossProfitCents - b.grossProfitCents) // prejuízo primeiro
      res.json({ items: items.slice(0, limit) })
    }),
  )

  // ---------- BREAKDOWN POR CANAL ----------
  router.get(
    '/sales/channels',
    requireAuth,
    reportsCache,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const { fromMs, toMs } = parseRange(req)

      const all = await store.listAllOrdersForTenant({ tenantId: ctx.tenantId, limit: 100000 })
      const orders = filterOrders(all, ctx.tenantId, fromMs, toMs, true)

      const map = new Map<string, { channel: string; orders: number; revenueCents: number }>()
      let totalRevenue = 0
      for (const o of orders) {
        const ch = o.channel ?? 'OTHER'
        const cur = map.get(ch) ?? { channel: ch, orders: 0, revenueCents: 0 }
        cur.orders += 1
        cur.revenueCents += o.totalCents ?? 0
        totalRevenue += o.totalCents ?? 0
        map.set(ch, cur)
      }
      const arr = Array.from(map.values()).map((c) => ({
        ...c,
        percentage: totalRevenue > 0 ? (c.revenueCents / totalRevenue) * 100 : 0,
      }))
      arr.sort((a, b) => b.revenueCents - a.revenueCents)

      res.json({ items: arr, totalRevenueCents: totalRevenue })
    }),
  )

  // ---------- TOP CLIENTES ----------
  router.get(
    '/sales/customers',
    requireAuth,
    reportsCache,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const { fromMs, toMs } = parseRange(req)
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)

      const all = await store.listAllOrdersForTenant({ tenantId: ctx.tenantId, limit: 100000 })
      const orders = filterOrders(all, ctx.tenantId, fromMs, toMs, true)

      const map = new Map<string, {
        customerKey: string
        customerName: string | null
        orders: number
        revenueCents: number
        lastOrderAt: string
      }>()

      for (const o of orders) {
        const key = o.customerPhone || o.customerName || 'anonymous'
        if (key === 'anonymous' && !o.customerName) continue
        const cur = map.get(key) ?? {
          customerKey: key,
          customerName: o.customerName ?? null,
          orders: 0,
          revenueCents: 0,
          lastOrderAt: o.createdAt,
        }
        cur.orders += 1
        cur.revenueCents += o.totalCents ?? 0
        if (Date.parse(o.createdAt) > Date.parse(cur.lastOrderAt)) {
          cur.lastOrderAt = o.createdAt
        }
        map.set(key, cur)
      }

      const arr = Array.from(map.values())
      arr.sort((a, b) => b.revenueCents - a.revenueCents)
      res.json({ items: arr.slice(0, limit) })
    }),
  )

  // ---------- EXPORT CSV ----------
  router.get(
    '/sales/export',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const { fromMs, toMs } = parseRange(req)
      const format = typeof req.query.format === 'string' ? req.query.format : 'csv'

      if (format !== 'csv') {
        throw new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'Apenas formato CSV é suportado' })
      }

      const all = await store.listAllOrdersForTenant({ tenantId: ctx.tenantId, limit: 100000 })
      const orders = filterOrders(all, ctx.tenantId, fromMs, toMs, true)

      // Cabeçalho + linhas
      const headers = ['id', 'createdAt', 'channel', 'status', 'customerName', 'customerPhone', 'subtotalCents', 'totalCents', 'itemsCount']
      const escape = (v: unknown): string => {
        if (v == null) return ''
        const s = String(v)
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"'
        }
        return s
      }
      const lines: string[] = [headers.join(',')]
      for (const o of orders) {
        lines.push([
          o.id,
          o.createdAt,
          o.channel,
          o.status,
          o.customerName,
          o.customerPhone,
          o.subtotalCents,
          o.totalCents,
          (o.items ?? []).length,
        ].map(escape).join(','))
      }

      const filename = `relatorio-vendas-${new Date(fromMs).toISOString().slice(0, 10)}_a_${new Date(toMs).toISOString().slice(0, 10)}.csv`
      logger.info('report.csv.exported', { traceId: ctx.traceId, orders: orders.length, filename })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(lines.join('\n'))
    }),
  )

  app.use('/api/v1/reports', router)
}

/**
 * Agente de IA — Estoque Inteligente
 *
 * Detecta padrões de recompra e cobertura de estoque.
 *
 * Regra principal (o caso do Bar do Zé):
 *   Para um (cliente, produto) onde:
 *     1. o cliente comprou X unidades no mês anterior
 *     2. o estoque atual é >= STOCK_COVERAGE_THRESHOLD * X
 *     3. o pedido em criação tem quantidade >= 0.8 * X (tolerância)
 *   → ALERTA: "ainda há Y unidades em estoque (Z% da compra anterior)"
 *
 * Tese: evitar que o cliente compre algo que já está parado no estoque
 * e evitar que o lojista rebaixe estoque sem necessidade.
 */
import { getStore } from '../infra/store.js'
import type { Store, Order, OrderItem } from '../infra/store.js'
import { logger } from '../shared/logger.js'

/** % mínimo de cobertura do estoque para disparar o alerta. Configurável. */
export const DEFAULT_STOCK_COVERAGE_THRESHOLD = 0.6
/** Tolerância na quantidade do pedido (0.8 = 80% da compra anterior). */
const PURCHASE_MATCH_TOLERANCE = 0.8
/** Janela padrão para olhar para trás (dias). */
const DEFAULT_LOOKBACK_DAYS = 30
/** Status de pedido que contam como "venda realizada" para fins de análise. */
const VALID_ORDER_STATUSES: ReadonlySet<Order['status']> = new Set<Order['status']>([
  'CONFIRMADO',
  'EM_SEPARACAO',
  'SEPARADO',
  'SAIU_PARA_ENTREGA',
  'ENTREGUE',
])

export type StockCoverageLevel = 'OK' | 'HIGH' | 'OVERSTOCK' | 'LOW'

export type ProductAnalysis = {
  productId: string
  productName: string
  branchId: string
  /** Quantidade base (em unidade base) */
  purchasedBase: number   // quanto entrou (orders com status válido, no mês anterior)
  soldBase: number        // quanto saiu (mesma janela)
  onHandBase: number      // estoque atual (InventoryBalance)
  coveragePct: number     // onHandBase / soldBase (cobertura do que vendeu)
  level: StockCoverageLevel
  insight: string         // frase explicativa curta
}

export type CustomerRecurringItem = {
  productId: string
  productName: string
  lastOrderAt: string
  lastQuantityBase: number
  totalOrdersLast30d: number
  totalQuantityBaseLast30d: number
}

export type ReorderAlert = {
  productId: string
  productName: string
  customerPhone: string
  customerName: string | null
  /** Quantidade que o cliente comprou da última vez */
  previousQuantityBase: number
  /** Quantidade atual em estoque */
  onHandBase: number
  /** % do estoque em relação à compra anterior (ex: 0.8 = 80%) */
  onHandPctOfPrevious: number
  /** Quantidade solicitada no pedido em criação */
  requestedQuantityBase: number
  /** Mensagem amigável para o operador */
  message: string
  severity: 'info' | 'warn' | 'critical'
}

const daysAgo = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const startOfMonth = (): string => {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const inWindow = (iso: string, fromIso: string): boolean => iso >= fromIso

/** ---------------- API do Agente ---------------- */

/**
 * Analisa um produto: quanto foi comprado, vendido e quanto sobrou no período.
 */
export const analyzeProduct = async (params: {
  tenantId: string
  branchId: string
  productId: string
  lookbackDays?: number
  store?: Store
}): Promise<ProductAnalysis | null> => {
  const lookback = params.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  const since = daysAgo(lookback)
  const store: Store = params.store ?? (await getStore())
  const product = await store.getProduct({ tenantId: params.tenantId, productId: params.productId })
  if (!product) return null

  // Compras/Saídas: orders com item deste produto no período
  const orders = await store.listOrders({ tenantId: params.tenantId, branchId: params.branchId })
  const relevantOrders = orders.filter(
    (o) => VALID_ORDER_STATUSES.has(o.status) && inWindow(o.createdAt, since) && o.items.some((i) => i.productId === params.productId),
  )

  let soldBase = 0
  for (const o of relevantOrders) {
    for (const it of o.items) {
      if (it.productId === params.productId) soldBase += it.quantityBase
    }
  }

  // Entradas: movements com movementType = TRANSFER_IN ou ADJUSTMENT+
  // (SALE subtrai; aqui queremos "comprado pelo dono" = entradas no estoque)
  const movements = await store.listInventoryMovements({ tenantId: params.tenantId, branchId: params.branchId, productId: params.productId })
  let purchasedBase = 0
  for (const m of movements) {
    if (inWindow(m.createdAt, since) && m.movementType === 'TRANSFER_IN' && m.quantityBase > 0) {
      purchasedBase += m.quantityBase
    } else if (inWindow(m.createdAt, since) && m.movementType === 'ADJUSTMENT' && m.quantityBase > 0) {
      // ajustes positivos também contam como entrada
      purchasedBase += m.quantityBase
    }
  }

  const balance = await store.getInventoryBalance({ tenantId: params.tenantId, branchId: params.branchId, productId: params.productId })
  const onHandBase = balance?.quantityBase ?? 0

  const coveragePct = soldBase > 0 ? onHandBase / soldBase : 0
  let level: StockCoverageLevel
  let insight: string
  if (soldBase === 0 && onHandBase === 0) {
    level = 'OK'
    insight = 'Sem movimento no período'
  } else if (soldBase === 0) {
    level = 'OVERSTOCK'
    insight = `Sem vendas no período; ${onHandBase} unidades paradas`
  } else if (coveragePct >= 1.0) {
    level = 'OVERSTOCK'
    insight = `${onHandBase} un em estoque = ${Math.round(coveragePct * 100)}% do que vendeu em ${lookback}d`
  } else if (coveragePct >= DEFAULT_STOCK_COVERAGE_THRESHOLD) {
    level = 'HIGH'
    insight = `Cobertura alta: ${Math.round(coveragePct * 100)}% do que vendeu`
  } else {
    level = 'OK'
    insight = `Cobertura normal: ${Math.round(coveragePct * 100)}%`
  }

  return {
    productId: params.productId,
    productName: product.name,
    branchId: params.branchId,
    purchasedBase,
    soldBase,
    onHandBase,
    coveragePct,
    level,
    insight,
  }
}

/**
 * Lista produtos recorrentes que um cliente comprou no período.
 * Usado para prever compras.
 */
export const findCustomerRecurringItems = async (params: {
  tenantId: string
  branchId: string
  customerPhone: string
  lookbackDays?: number
  store?: Store
}): Promise<CustomerRecurringItem[]> => {
  const lookback = params.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  const since = daysAgo(lookback)
  const store: Store = params.store ?? (await getStore())
  const orders = await store.listOrders({ tenantId: params.tenantId, branchId: params.branchId })
  const customerOrders = orders
    .filter(
      (o) =>
        VALID_ORDER_STATUSES.has(o.status) &&
        o.customerPhone === params.customerPhone &&
        inWindow(o.createdAt, since),
    )
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

  const map = new Map<string, CustomerRecurringItem>()
  for (const o of customerOrders) {
    for (const it of o.items) {
      const existing = map.get(it.productId)
      if (existing) {
        existing.totalOrdersLast30d += 1
        existing.totalQuantityBaseLast30d += it.quantityBase
      } else {
        map.set(it.productId, {
          productId: it.productId,
          productName: it.productName,
          lastOrderAt: o.createdAt,
          lastQuantityBase: it.quantityBase,
          totalOrdersLast30d: 1,
          totalQuantityBaseLast30d: it.quantityBase,
        })
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalQuantityBaseLast30d - a.totalQuantityBaseLast30d)
}

/**
 * Detecta se um pedido em criação tem itens que se encaixam na regra de alerta.
 * Esta é a função que o front-end chama ANTES de finalizar o pedido.
 *
 * Regra (Bar do Zé):
 *  - cliente já comprou X do mesmo produto no mês anterior
 *  - estoque atual >= threshold * X (default 60%)
 *  - quantidade solicitada está próxima (±20%) de X
 */
export const detectReorderAlerts = async (params: {
  tenantId: string
  branchId: string
  customerPhone: string | null
  customerName?: string | null
  items: Array<{ productId: string; productName?: string; quantityBase: number }>
  lookbackDays?: number
  coverageThreshold?: number
  store?: Store
}): Promise<ReorderAlert[]> => {
  const lookback = params.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  const threshold = params.coverageThreshold ?? DEFAULT_STOCK_COVERAGE_THRESHOLD
  if (!params.customerPhone) return []
  const since = daysAgo(lookback)
  const store: Store = params.store ?? (await getStore())

  const orders = await store.listOrders({ tenantId: params.tenantId, branchId: params.branchId })
  const customerOrders = orders.filter(
    (o) => VALID_ORDER_STATUSES.has(o.status) && o.customerPhone === params.customerPhone && inWindow(o.createdAt, since),
  )

  // Mapa productId -> { lastQtyBase, lastOrderAt, lastProductName }
  const lastPurchase = new Map<string, { quantityBase: number; at: string; productName: string }>()
  for (const o of customerOrders.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))) {
    for (const it of o.items) {
      if (!lastPurchase.has(it.productId)) {
        lastPurchase.set(it.productId, { quantityBase: it.quantityBase, at: o.createdAt, productName: it.productName })
      }
    }
  }

  const alerts: ReorderAlert[] = []
  for (const item of params.items) {
    const previous = lastPurchase.get(item.productId)
    if (!previous || previous.quantityBase <= 0) continue

    // 1. Mesma faixa de quantidade (±20% da compra anterior)
    const minRequired = previous.quantityBase * PURCHASE_MATCH_TOLERANCE
    if (item.quantityBase < minRequired) continue

    // 2. Estoque atual >= threshold * X
    const balance = await store.getInventoryBalance({
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: item.productId,
    })
    const onHand = balance?.quantityBase ?? 0
    const onHandPctOfPrevious = onHand / previous.quantityBase
    if (onHand < Math.ceil(previous.quantityBase * threshold)) continue

    // 3. Severidade
    let severity: ReorderAlert['severity'] = 'info'
    if (onHandPctOfPrevious >= 1.0) severity = 'critical'
    else if (onHandPctOfPrevious >= threshold) severity = 'warn'

    const productName = item.productName ?? previous.productName
    const pctStr = Math.round(onHandPctOfPrevious * 100)
    const monthLabel = `a última compra (${previous.quantityBase} un, ${previous.at.slice(0, 10)})`
    const message = severity === 'critical'
      ? `Você ainda tem ${onHand} unidades de ${productName} em estoque (${pctStr}% de ${monthLabel}). Considere não comprar agora.`
      : `Você ainda tem ${onHand} unidades de ${productName} em estoque (${pctStr}% de ${monthLabel}).`

    alerts.push({
      productId: item.productId,
      productName,
      customerPhone: params.customerPhone,
      customerName: params.customerName ?? null,
      previousQuantityBase: previous.quantityBase,
      onHandBase: onHand,
      onHandPctOfPrevious,
      requestedQuantityBase: item.quantityBase,
      message,
      severity,
    })
  }

  if (alerts.length > 0) {
    logger.info('Reorder alerts detectados', { tenantId: params.tenantId, branchId: params.branchId, customerPhone: params.customerPhone, alertCount: alerts.length })
  }
  return alerts
}

/**
 * Lista produtos da loja com alta cobertura (>= threshold * vendas).
 * Usado pela página /app/insights.
 */
export const listHighCoverageProducts = async (params: {
  tenantId: string
  branchId: string
  lookbackDays?: number
  coverageThreshold?: number
  limit?: number
  store?: Store
}): Promise<ProductAnalysis[]> => {
  const store: Store = params.store ?? (await getStore())
  const products = await store.listProducts({ tenantId: params.tenantId })
  const results: ProductAnalysis[] = []
  for (const p of products) {
    const analysis = await analyzeProduct({ tenantId: params.tenantId, branchId: params.branchId, productId: p.id, lookbackDays: params.lookbackDays, store })
    if (analysis) results.push(analysis)
  }
  // Ordena por cobertura desc, priorizando os críticos
  results.sort((a, b) => {
    const order = (l: StockCoverageLevel) => ({ OVERSTOCK: 3, HIGH: 2, OK: 1, LOW: 0 }[l])
    const ol = order(a.level) - order(b.level)
    if (ol !== 0) return -ol
    return b.coveragePct - a.coveragePct
  })
  return results.slice(0, params.limit ?? 50)
}

/** Helper para testes e para mostrar no dashboard */
export const getCurrentMonthLabel = (): string => {
  return startOfMonth().slice(0, 7) // YYYY-MM
}

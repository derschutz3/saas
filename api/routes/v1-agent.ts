/**
 * Rotas REST do Agente de IA — Estoque Inteligente
 *
 * Endpoints:
 *  GET  /api/v1/agent/insights                       — produtos com cobertura alta
 *  GET  /api/v1/agent/products/:id/analysis          — análise por produto
 *  GET  /api/v1/agent/customers/:phone/recurring     — produtos recorrentes do cliente
 *  POST /api/v1/agent/orders/check-alert             — pré-checagem ao montar pedido
 *  POST /api/v1/agent/nfe/parse                      — parse de XML de NFe → lista de produtos
 *  POST /api/v1/agent/nfe/commit                     — cria produtos a partir do parse (com categoria)
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import {
  analyzeProduct,
  findCustomerRecurringItems,
  detectReorderAlerts,
  listHighCoverageProducts,
  DEFAULT_STOCK_COVERAGE_THRESHOLD,
} from '../agent/stock-intelligence.js'
import { parseNfeXml, parseDanfeText } from '../agent/nfe-parser.js'

const router = Router()

/**
 * GET /api/v1/agent/insights?branchId=...&limit=50
 * Lista produtos com estoque alto em relação ao que vendeu.
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const branchId = (req.query.branchId as string | undefined) ?? ctx.branchId
    if (!branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'branchId é obrigatório' })
    const limit = Math.min(parseInt((req.query.limit as string | undefined) ?? '50', 10) || 50, 200)
    const lookbackDays = parseInt((req.query.lookbackDays as string | undefined) ?? '30', 10) || 30
    const coverageThreshold = parseFloat((req.query.coverageThreshold as string | undefined) ?? `${DEFAULT_STOCK_COVERAGE_THRESHOLD}`)
    const items = await listHighCoverageProducts({
      tenantId: ctx.tenantId,
      branchId,
      store,
      limit,
      lookbackDays,
      coverageThreshold,
    })
    res.status(200).json({
      items,
      meta: { lookbackDays, coverageThreshold, branchId, generatedAt: new Date().toISOString() },
    })
  }),
)

/**
 * GET /api/v1/agent/products/:id/analysis?branchId=...
 * Análise completa: comprado / vendido / em estoque / cobertura
 */
router.get(
  '/products/:id/analysis',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const branchId = (req.query.branchId as string | undefined) ?? ctx.branchId
    if (!branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'branchId é obrigatório' })
    const lookbackDays = parseInt((req.query.lookbackDays as string | undefined) ?? '30', 10) || 30
    const analysis = await analyzeProduct({ tenantId: ctx.tenantId, branchId, productId: req.params.id, lookbackDays, store })
    if (!analysis) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Produto não encontrado' })
    res.status(200).json(analysis)
  }),
)

/**
 * GET /api/v1/agent/customers/:phone/recurring?branchId=...
 * Produtos que o cliente costuma comprar (no mês anterior).
 */
router.get(
  '/customers/:phone/recurring',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const branchId = (req.query.branchId as string | undefined) ?? ctx.branchId
    if (!branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'branchId é obrigatório' })
    const lookbackDays = parseInt((req.query.lookbackDays as string | undefined) ?? '30', 10) || 30
    const items = await findCustomerRecurringItems({
      tenantId: ctx.tenantId,
      branchId,
      customerPhone: req.params.phone,
      lookbackDays,
      store,
    })
    res.status(200).json({ items, customerPhone: req.params.phone })
  }),
)

/**
 * POST /api/v1/agent/orders/check-alert
 * Body: { branchId?, customerPhone, customerName?, items: [{ productId, productName?, quantityBase }] }
 * Retorna array de alertas (pode ser vazio).
 */
router.post(
  '/orders/check-alert',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const body = req.body as {
      branchId?: string
      customerPhone?: string
      customerName?: string
      items?: Array<{ productId: string; productName?: string; quantityBase: number }>
      coverageThreshold?: number
    }
    const branchId = body.branchId ?? ctx.branchId
    if (!branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'branchId é obrigatório' })
    if (!body.customerPhone) {
      res.status(200).json({ alerts: [], meta: { reason: 'no_customer_phone' } })
      return
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(200).json({ alerts: [], meta: { reason: 'no_items' } })
      return
    }
    const alerts = await detectReorderAlerts({
      tenantId: ctx.tenantId,
      branchId,
      customerPhone: body.customerPhone,
      customerName: body.customerName,
      items: body.items.filter((i) => i.productId && i.quantityBase > 0),
      coverageThreshold: body.coverageThreshold,
      store,
    })
    res.status(200).json({
      alerts,
      meta: {
        customerPhone: body.customerPhone,
        branchId,
        generatedAt: new Date().toISOString(),
        coverageThreshold: body.coverageThreshold ?? DEFAULT_STOCK_COVERAGE_THRESHOLD,
      },
    })
  }),
)

/**
 * POST /api/v1/agent/nfe/parse
 * Aceita { xml: string } ou { text: string } e retorna a lista de produtos detectados.
 * Tenta primeiro o parser de XML, depois fallback para DANFE em texto.
 */
router.post(
  '/nfe/parse',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { xml?: string; text?: string }
    if (!body || (typeof body.xml !== 'string' && typeof body.text !== 'string')) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Informe o campo "xml" (string) ou "text" (string)' })
    }
    let parsed
    if (typeof body.xml === 'string' && body.xml.length > 0) {
      try {
        parsed = parseNfeXml(body.xml)
      } catch (xmlErr) {
        // Tentar fallback de texto se o XML parece curto
        if (body.xml.length < 2000 && typeof body.text !== 'string') {
          const danfeFallback = parseDanfeText(body.xml)
          if (danfeFallback) {
            parsed = danfeFallback
          } else {
            throw new ApiError({
              status: 400,
              code: 'PARSE_ERROR',
              message: xmlErr instanceof Error ? xmlErr.message : 'Falha ao parsear XML',
            })
          }
        } else {
          throw new ApiError({
            status: 400,
            code: 'PARSE_ERROR',
            message: xmlErr instanceof Error ? xmlErr.message : 'Falha ao parsear XML',
          })
        }
      }
    } else if (typeof body.text === 'string') {
      parsed = parseDanfeText(body.text)
      if (!parsed) {
        throw new ApiError({
          status: 400,
          code: 'PARSE_ERROR',
          message: 'Não foi possível identificar produtos no texto. Tente colar o XML completo da NFe.',
        })
      }
    }
    if (!parsed) {
      throw new ApiError({ status: 400, code: 'PARSE_ERROR', message: 'Entrada vazia ou inválida' })
    }

    // Detectar SKUs já existentes para mostrar ao usuário
    const store = await getStore()
    const existing = await store.listProducts({ tenantId: getCtx(req).tenantId })
    const skuToId = new Map<string, string>()
    for (const p of existing) {
      if (p.sku) skuToId.set(p.sku.toLowerCase(), p.id)
    }
    const productsWithState = parsed.products.map((it) => {
      const sku = (it.sku ?? '').toLowerCase()
      const existingId = sku ? skuToId.get(sku) ?? null : null
      return { ...it, existingProductId: existingId }
    })

    res.json({
      nfeNumber: parsed.nfeNumber,
      series: parsed.series,
      emissionDate: parsed.emissionDate,
      issuerName: parsed.issuerName,
      issuerCnpj: parsed.issuerCnpj,
      totalCents: parsed.totalCents,
      products: productsWithState,
    })
  }),
)

/**
 * POST /api/v1/agent/nfe/commit
 * Recebe uma lista de { sku?, name, unit, quantity, categoryId }
 * e cria os produtos no estoque (ou adiciona estoque se já existir).
 *
 * Body:
 *   { items: Array<{ sku?: string|null, name: string, unit: string, quantity: number, categoryId: string|null, addToStockIfExists?: boolean }> }
 */
router.post(
  '/nfe/commit',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const body = req.body as { items?: Array<{ sku?: string | null; name: string; unit?: string; quantity: number; categoryId: string | null; addToStockIfExists?: boolean; unitPriceCents?: number }> }
    const items = Array.isArray(body?.items) ? body.items : []
    if (items.length === 0) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Nenhum item para criar' })
    }
    if (items.length > 500) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Máximo de 500 itens por requisição' })
    }
    const store = await getStore()
    const existing = await store.listProducts({ tenantId: ctx.tenantId })
    const skuToId = new Map<string, string>()
    for (const p of existing) {
      if (p.sku) skuToId.set(p.sku.toLowerCase(), p.id)
    }

    const results: Array<{ name: string; status: 'created' | 'updated' | 'skipped' | 'error'; productId?: string; message?: string }> = []
    for (const it of items) {
      try {
        if (!it.name || typeof it.name !== 'string' || !it.name.trim()) {
          results.push({ name: it.name ?? '', status: 'error', message: 'Nome inválido' })
          continue
        }
        const sku = (it.sku ?? '').toString().trim()
        const skuLower = sku.toLowerCase()
        const existingId = skuLower ? skuToId.get(skuLower) : null
        const baseUnit = (it.unit ?? 'un').toString().trim() || 'un'

        if (existingId) {
          if (it.addToStockIfExists) {
            const qty = Number(it.quantity) || 0
            // Atualizar saldo (somar)
            const currentBal = await store.getInventoryBalance({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId ?? '',
              productId: existingId,
            })
            const nextQty = (currentBal?.quantityBase ?? 0) + qty
            await store.upsertInventoryBalance({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId ?? '',
              productId: existingId,
              quantityBase: nextQty,
            })
            await store.addInventoryMovement({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId ?? '',
              productId: existingId,
              movementType: 'ADJUSTMENT',
              quantityBase: qty,
              refType: 'NFE',
              refId: null,
              reason: `NFe importada — ref: ${ctx.userId}`,
              createdBy: ctx.userId,
              unitCostCents: Number.isFinite(Number(it.unitPriceCents)) && Number(it.unitPriceCents) > 0 ? Number(it.unitPriceCents) : null,
              unitRevenueCents: null,
            })
            if (Number.isFinite(Number(it.unitPriceCents)) && Number(it.unitPriceCents) > 0) {
              const u = Number(it.unitPriceCents)
              await store.updateProductAverageCost({
                tenantId: ctx.tenantId,
                productId: existingId,
                quantityIn: qty,
                unitCostInCents: u,
              })
            }
          }
          results.push({ name: it.name, status: 'updated', productId: existingId })
        } else {
          // Validar categoria se informada
          let categoryId: string | null = it.categoryId
          if (categoryId) {
            const cat = await store.getCategory({ tenantId: ctx.tenantId, categoryId })
            if (!cat || cat.archivedAt) categoryId = null
          }
          if (!categoryId) {
            categoryId = await store.getSystemCategoryId({ tenantId: ctx.tenantId })
          }
          const newProduct = await store.createProduct({
            tenantId: ctx.tenantId,
            sku: sku || `NFE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: it.name.trim(),
            baseUnit,
            categoryId,
            active: true,
            averageCostCents: 0,
          })
          // Cria o saldo inicial = quantity
          const initialQty = Number(it.quantity) || 0
          const initialCostCents = Number.isFinite(Number(it.unitPriceCents)) ? Number(it.unitPriceCents) : 0
          if (initialQty > 0) {
            await store.upsertInventoryBalance({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId ?? '',
              productId: newProduct.id,
              quantityBase: initialQty,
            })
            await store.addInventoryMovement({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId ?? '',
              productId: newProduct.id,
              movementType: 'ADJUSTMENT',
              quantityBase: initialQty,
              refType: 'NFE',
              refId: null,
              reason: `NFe importada — ref: ${ctx.userId}`,
              createdBy: ctx.userId,
              unitCostCents: initialCostCents > 0 ? initialCostCents : null,
              unitRevenueCents: null,
            })
            if (initialCostCents > 0) {
              await store.updateProductAverageCost({
                tenantId: ctx.tenantId,
                productId: newProduct.id,
                quantityIn: initialQty,
                unitCostInCents: initialCostCents,
              })
            }
          }
          results.push({ name: it.name, status: 'created', productId: newProduct.id })
        }
      } catch (err) {
        results.push({ name: it.name, status: 'error', message: err instanceof Error ? err.message : 'Erro' })
      }
    }

    await store.audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'NFE_IMPORT',
      entityType: 'Product',
      entityId: 'bulk',
      metadata: {
        totalItems: items.length,
        created: results.filter((r) => r.status === 'created').length,
        updated: results.filter((r) => r.status === 'updated').length,
      },
    })

    res.json({
      results,
      summary: {
        total: results.length,
        created: results.filter((r) => r.status === 'created').length,
        updated: results.filter((r) => r.status === 'updated').length,
        errors: results.filter((r) => r.status === 'error').length,
      },
    })
  }),
)

export function registerAgentRoutes(app: import('express').Application): void {
  app.use('/api/v1/agent', router)
}

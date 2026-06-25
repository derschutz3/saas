import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { ApiError, asyncHandler } from '../shared/http.js'
import { requireAuth, requireRole, type RequestContext } from '../shared/middleware.js'
import { signJwtHS256, verifyPassword } from '../shared/security.js'
import { getStore, type OrderChannel, type OrderStatus } from '../infra/store.js'
import { buildSafeAuditMeta, redactPii } from '../shared/pii-redactor.js'
import {
  productCreateSchema,
  orderCreateSchema,
  customerSchema,
  stockMovementSchema,
  paginationSchema,
  uuidParamSchema,
} from '../shared/schemas.js'
import { validateBody, validateQuery, validateParams } from '../shared/validate.js'

const router = Router()

const getCtx = (req: Request) => (req as any).ctx as RequestContext

router.post(
  '/auth/login',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { email?: string; password?: string }
    const email = body.email?.trim()
    const password = body.password ?? ''

    if (!email || password.length < 1) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Credenciais inválidas' })
    }

    const store = await getStore()
    const tenantId = await store.getDefaultTenantId()
    if (!tenantId) {
      throw new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Tenant não configurado' })
    }

    const user = await store.findUserByEmail({ tenantId, email })
    if (!user || !user.active) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    const { ok } = await verifyPassword(password, { salt: user.passwordSalt, hash: user.passwordHash })
    if (!ok) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    const token = signJwtHS256(
      { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, role: user.role },
      { ttlSeconds: 60 * 60 * 12 },
    )

    await store.audit({
      tenantId,
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    })

    res.status(200).json({
      token: token.token,
      me: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
      },
    })
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const user = await store.getUser({ tenantId: ctx.tenantId, userId: ctx.userId })
    if (!user) throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sessão inválida' })
    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
    })
  }),
)

router.get(
  '/customers',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const query = (req.query.query as string | undefined) ?? undefined
    const store = await getStore()
    const items = await store.listCustomers({ tenantId: ctx.tenantId, query })
    res.status(200).json({ items })
  }),
)

router.get(
  '/units',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const items = await store.listUnits({ tenantId: ctx.tenantId })
    res.status(200).json({ items })
  }),
)

router.get(
  '/products',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const query = (req.query.query as string | undefined) ?? undefined
    const categoryParam = req.query.categoryId as string | undefined
    const categoryId = categoryParam === 'null' || categoryParam === '' ? null : categoryParam ?? undefined
    // PERF: paginação server-side — default 100, max 500.
    // Em dev single-tenant com ~50 produtos não é estritamente necessário, mas
    // garante que a UI continua responsiva com catálogos grandes.
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt((req.query.offset as string) ?? '0', 10) || 0, 0)
    const store = await getStore()
    const result = await store.listProductsPaged({
      tenantId: ctx.tenantId,
      query,
      categoryId,
      limit,
      offset,
    })
    // PERF: 1 chamada batch em vez de N getSaleUnits() — economia de O(N) round-trips.
    const saleUnitsByProduct = await store.getSaleUnitsBatch({
      tenantId: ctx.tenantId,
      productIds: result.items.map((p) => p.id),
    })
    const items = result.items.map((p) => ({ ...p, saleUnits: saleUnitsByProduct.get(p.id) ?? [] }))
    // Cache-Control + ETag para o Next.js poder fazer SWR eficiente
    res.setHeader('Cache-Control', 'private, max-age=5')
    res.status(200).json({ items, total: result.total, limit: result.limit, offset: result.offset })
  }),
)

router.post(
  '/products',
  requireAuth,
  requireRole(['OWNER', 'ADMIN']),
  validateBody(productCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    // SECURITY (A3): req.body já foi validado/sanitizado por zod
    const body = req.body as { sku: string; name: string; baseUnit: string; barcode?: string; costCents?: number; priceCents?: number; stock?: number; minStock?: number; active?: boolean; categoryId?: string }
    const sku = body.sku
    const name = body.name?.trim()
    const baseUnit = body.baseUnit?.trim() ?? 'un'
    if (!sku || !name) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Dados inválidos' })
    const store = await getStore()

    // categoryId: se enviado, validar que existe; senão, usar a categoria de sistema
    let categoryId: string | null = null
    if (body.categoryId) {
      const cat = await store.getCategory({ tenantId: ctx.tenantId, categoryId: body.categoryId })
      if (!cat || cat.archivedAt) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Categoria inválida' })
      categoryId = cat.id
    } else {
      categoryId = await store.getSystemCategoryId({ tenantId: ctx.tenantId })
    }

    const product = await store.createProduct({ tenantId: ctx.tenantId, sku, name, baseUnit, categoryId, active: true, averageCostCents: body.costCents ?? 0 })
    await store.audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'PRODUCT_CREATE',
      entityType: 'PRODUCT',
      entityId: product.id,
      metadata: { sku, name, baseUnit, categoryId },
    })

    // Cria SaleUnit padrão (= unidade base) com preço de venda inicial.
    // Persiste em 3 tabelas: units, unitConversions, prices.
    if (body.priceCents != null && body.priceCents > 0) {
      const existingUnit = await store.getUnit({ tenantId: ctx.tenantId, code: baseUnit })
      if (!existingUnit) {
        await store.createUnit({ tenantId: ctx.tenantId, code: baseUnit, label: baseUnit })
      }
      await store.upsertUnitConversion({ tenantId: ctx.tenantId, productId: product.id, unitCode: baseUnit, factorToBase: 1 })
      // Preços para os 4 canais canônicos
      const channels = ['BALCAO', 'WHATSAPP', 'CATALOGO', 'DELIVERY'] as const
      for (const ch of channels) {
        await store.upsertPrice({ tenantId: ctx.tenantId, productId: product.id, unitCode: baseUnit, channel: ch, priceCents: body.priceCents })
      }
    }

    // Estoque inicial: cria movimento ADJUSTMENT e atualiza saldo da branch.
    // Só executa se houver uma branch ativa (default 'demo-branch' em dev).
    if (body.stock && body.stock > 0 && ctx.branchId) {
      await store.upsertInventoryBalance({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: product.id,
        quantityBase: Math.round(body.stock),
      })
      await store.addInventoryMovement({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: product.id,
        movementType: 'ADJUSTMENT',
        quantityBase: Math.round(body.stock),
        refType: 'MANUAL',
        refId: null,
        reason: 'Estoque inicial no cadastro',
        createdBy: ctx.userId,
        unitCostCents: body.costCents ?? null,
        unitRevenueCents: null,
      })
    }

    res.status(201).json(product)
  }),
)

// PATCH /products/:id — atualiza nome, sku, categoria, custo médio e/ou preço de venda
// e opcionalmente ajusta estoque (criando movimento ADJUSTMENT com a diferença).
router.patch(
  '/products/:id',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'STOCK', 'OPS']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const productId = req.params.id
    const store = await getStore()
    const current = await store.getProduct({ tenantId: ctx.tenantId, productId })
    if (!current) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Produto não encontrado' })

    const body = req.body as {
      sku?: string
      name?: string
      categoryId?: string | null
      active?: boolean
      baseUnit?: string
      costCents?: number
      priceCents?: number
      stock?: number // estoque desejado (opcional) — gera ADJUSTMENT com a diferença
      stockReason?: string
    }

    // 1) Atualiza dados básicos (sku, name, categoryId, active, averageCostCents)
    const updated = await store.updateProduct({
      tenantId: ctx.tenantId,
      productId,
      patch: {
        sku: body.sku?.trim() || current.sku,
        name: body.name?.trim() || current.name,
        categoryId: body.categoryId === undefined ? current.categoryId : body.categoryId,
        active: body.active ?? current.active,
        averageCostCents: Number.isFinite(body.costCents) ? Math.max(0, Math.round(body.costCents as number)) : current.averageCostCents,
      },
    })

    // 2) Atualiza preço de venda (4 canais)
    if (Number.isFinite(body.priceCents) && (body.priceCents as number) > 0) {
      const unitCode = body.baseUnit?.trim() || updated.baseUnit
      const existingUnit = await store.getUnit({ tenantId: ctx.tenantId, code: unitCode })
      if (!existingUnit) {
        await store.createUnit({ tenantId: ctx.tenantId, code: unitCode, label: unitCode })
      }
      await store.upsertUnitConversion({ tenantId: ctx.tenantId, productId: updated.id, unitCode, factorToBase: 1 })
      const channels = ['BALCAO', 'WHATSAPP', 'CATALOGO', 'DELIVERY'] as const
      for (const ch of channels) {
        await store.upsertPrice({ tenantId: ctx.tenantId, productId: updated.id, unitCode, channel: ch, priceCents: Math.round(body.priceCents as number) })
      }
    }

    // 3) Ajusta estoque (se body.stock definido): cria ADJUSTMENT com a diferença
    let stockMovement: { movementId: string; previousBalance: number; newBalance: number } | null = null
    if (Number.isFinite(body.stock)) {
      const desired = Math.round(body.stock as number)
      const bal = await store.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: updated.id })
      const previousBalance = bal?.quantityBase ?? 0
      const delta = desired - previousBalance
      if (delta !== 0) {
        await store.upsertInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: updated.id, quantityBase: desired })
        const mov = await store.addInventoryMovement({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: updated.id,
          movementType: 'ADJUSTMENT',
          quantityBase: delta,
          refType: 'MANUAL',
          refId: null,
          reason: body.stockReason?.trim() || 'Ajuste manual via edição',
          createdBy: ctx.userId,
          unitCostCents: updated.averageCostCents,
          unitRevenueCents: null,
        })
        stockMovement = { movementId: mov.id, previousBalance, newBalance: desired }
      }
    }

    await store.audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'PRODUCT_UPDATE',
      entityType: 'PRODUCT',
      entityId: updated.id,
      metadata: { sku: body.sku, name: body.name, costCents: body.costCents, priceCents: body.priceCents, stock: body.stock, stockMovement },
    })

    res.json({ product: updated, stockMovement })
  }),
)

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const store = await getStore()
    const status = (req.query.status as OrderStatus | undefined) ?? undefined
    const channel = (req.query.channel as OrderChannel | undefined) ?? undefined
    const orders = await store.listOrders({ tenantId: ctx.tenantId, branchId: ctx.branchId, status, channel })
    res.status(200).json({ items: orders })
  }),
)

router.get(
  '/orders/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const order = await store.getOrder({ tenantId: ctx.tenantId, orderId: req.params.id })
    if (!order) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })
    res.status(200).json(order)
  }),
)

router.post(
  '/orders',
  requireAuth,
  validateBody(orderCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })

    const body = req.body as {
      channel?: OrderChannel
      customerName?: string | null
      customerPhone?: string | null
      deliveryAddress?: string | null
      items?: Array<{ productId: string; unitCode?: string; quantity: number; unitPriceCents?: number }>
    }

    const channel = body.channel ?? 'WHATSAPP'
    const items = body.items ?? []
    if (items.length < 1) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Pedido sem itens' })

    const store = await getStore()
    const customerPhone = body.customerPhone?.trim() || null
    const customerName = body.customerName?.trim() || null
    const deliveryAddress = body.deliveryAddress?.trim() || null

    const out = await store.transaction(ctx.tenantId, async (tx) => {
      if (customerPhone) {
        const existing = await tx.findCustomerByPhone({ tenantId: ctx.tenantId, phone: customerPhone })
        if (!existing) {
          if (!customerName) {
            throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Nome é obrigatório para novo cliente' })
          }
          const created = await tx.createCustomer({
            tenantId: ctx.tenantId,
            name: customerName,
            phone: customerPhone,
            whatsapp: customerPhone,
            tradeName: null,
            taxId: null,
            email: null,
            address: deliveryAddress,
            city: null,
            state: null,
            zip: null,
            tags: [],
            lifecycle: 'lead',
            notes: null,
            creditLimitCents: null,
          })
          await tx.audit({
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: 'CUSTOMER_CREATE',
            entityType: 'CUSTOMER',
            entityId: created.id,
            // LGPD: metadata SEM PII (sem phone, sem name em claro)
            metadata: buildSafeAuditMeta({ lifecycle: created.lifecycle, source: 'order' }),
          })
        }
      }

      const normalizedItems = await Promise.all(
        items.map(async (it) => {
          const unitCode = it.unitCode?.trim() || 'un'
          const quantity = Math.round(it.quantity)
          if (!it.productId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Item inválido' })
          }

          const product = await tx.getProduct({ tenantId: ctx.tenantId, productId: it.productId })
          if (!product) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Produto inválido' })

          const saleUnits = await tx.getSaleUnits({ tenantId: ctx.tenantId, productId: product.id })
          const saleUnit = saleUnits.find((u) => u.unitCode === unitCode)
          if (!saleUnit) {
            throw new ApiError({
              status: 400,
              code: 'VALIDATION_ERROR',
              message: 'Unidade inválida para o produto',
              details: { productId: product.id, unitCode },
            })
          }

          const quantityBase = Math.round(quantity * saleUnit.factorToBase)
          if (quantityBase <= 0) {
            throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Quantidade inválida' })
          }

          const providedUnitPrice = Number.isFinite(it.unitPriceCents) ? Math.round(it.unitPriceCents as number) : null
          const unitPriceCents =
            providedUnitPrice ??
            (await tx.getPrice({ tenantId: ctx.tenantId, productId: product.id, channel, unitCode })) ??
            saleUnit.prices[channel]

          if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
            throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Preço inválido' })
          }

          const total = Math.round(quantity * unitPriceCents)
          return {
            id: crypto.randomUUID(),
            productId: it.productId,
            productName: product.name,
            unitCode,
            unitLabel: saleUnit.label,
            quantity,
            quantityBase,
            unitPriceCents,
            totalCents: total,
          }
        }),
      )

      const subtotalCents = normalizedItems.reduce((sum, it) => sum + it.totalCents, 0)
      const totalCents = subtotalCents

      for (const it of normalizedItems) {
        const bal = await tx.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: it.productId })
        const available = bal?.quantityBase ?? 0
        if (available < it.quantityBase) {
          throw new ApiError({
            status: 409,
            code: 'CONFLICT',
            message: 'Estoque insuficiente',
            details: { productId: it.productId, productName: it.productName, available },
          })
        }
      }

      const order = await tx.createOrder({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        channel,
        customerName,
        customerPhone,
        deliveryAddress,
        status: 'CONFIRMADO',
        subtotalCents,
        totalCents,
        createdBy: ctx.userId,
        items: normalizedItems,
      })

      for (const it of normalizedItems) {
        const bal = await tx.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: it.productId })
        const available = bal?.quantityBase ?? 0
        await tx.upsertInventoryBalance({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: it.productId,
          quantityBase: available - it.quantityBase,
        })
        // Custo médio vigente (CMV) — congelado no movimento para auditoria.
        const product = await tx.getProduct({ tenantId: ctx.tenantId, productId: it.productId })
        const cmvUnit = product?.averageCostCents ?? 0
        await tx.addInventoryMovement({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: it.productId,
          movementType: 'SALE',
          quantityBase: -it.quantityBase,
          refType: 'ORDER',
          refId: order.id,
          reason: null,
          createdBy: ctx.userId,
          unitCostCents: cmvUnit,
          unitRevenueCents: Math.round(it.totalCents / Math.max(1, it.quantityBase)),
        })
      }

      const ar = await tx.createReceivable({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        orderId: order.id,
        amountCents: order.totalCents,
        status: 'OPEN',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      await tx.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'ORDER_CREATE',
        entityType: 'ORDER',
        entityId: order.id,
        metadata: { channel: order.channel, totalCents: order.totalCents, items: order.items.length, arId: ar.id },
      })

      return { order, receivable: ar }
    })

    res.status(201).json(out)
  }),
)

router.post(
  '/orders/:id/status',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const body = req.body as { status?: OrderStatus }
    const status = body.status
    if (!status) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Status inválido' })
    const store = await getStore()
    const order = await store.getOrder({ tenantId: ctx.tenantId, orderId: req.params.id })
    if (!order) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })

    const previousStatus = order.status
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      RECEBIDO: ['CONFIRMADO', 'CANCELADO'],
      CONFIRMADO: ['EM_SEPARACAO', 'CANCELADO'],
      EM_SEPARACAO: ['SEPARADO', 'CANCELADO'],
      SEPARADO: ['SAIU_PARA_ENTREGA', 'CANCELADO'],
      SAIU_PARA_ENTREGA: ['ENTREGUE', 'CANCELADO'],
      ENTREGUE: [],
      CANCELADO: [],
    }

    const can = allowed[order.status]?.includes(status) ?? false
    if (!can) {
      throw new ApiError({ status: 409, code: 'CONFLICT', message: 'Transição de status inválida' })
    }

    const updated = await store.updateOrderStatus({ tenantId: ctx.tenantId, orderId: order.id, status })
    if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })

    await store.audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'ORDER_STATUS',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: { from: previousStatus, to: status },
    })

    res.status(200).json(updated)
  }),
)

router.get(
  '/inventory/balance',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const productId = req.query.productId as string | undefined
    if (!productId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'productId é obrigatório' })
    const store = await getStore()
    const bal = await store.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId })
    res.status(200).json({ productId, quantityBase: bal?.quantityBase ?? 0 })
  }),
)

// GET /inventory/balances?productIds=id1,id2,id3 — lista saldos em batch
// Retorna apenas os produtos com saldo > 0 (ou todos se nenhum productId for passado).
router.get(
  '/inventory/balances',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const idsParam = (req.query.productIds as string | undefined)?.trim()
    const productIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    const store = await getStore()
    const balances = await store.listInventoryBalances({ tenantId: ctx.tenantId, branchId: ctx.branchId, productIds })
    res.status(200).json({ items: balances })
  }),
)

router.get(
  '/inventory/movements',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const productId = req.query.productId as string | undefined
    const type = req.query.type as string | undefined
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined
    // PERF: paginação server-side (limit + offset) — evita carregar todas as movimentações
    // no cliente. Default 50, max 200 para evitar requests abusivos.
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? '50', 10) || 50, 1), 200)
    const offset = Math.max(parseInt((req.query.offset as string) ?? '0', 10) || 0, 0)
    const store = await getStore()
    const result = await store.listInventoryMovementsPaged({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId,
      type,
      from,
      to,
      limit,
      offset,
    })
    // Cache-Control: max-age 2s para SWR eficiente no cliente
    res.setHeader('Cache-Control', 'private, max-age=2')
    res.status(200).json(result)
  }),
)

router.post(
  '/inventory/adjustments',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'STOCK']),
  validateBody(stockMovementSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const body = req.body as { productId?: string; quantity?: number; type?: 'in' | 'out' | 'adjustment' | 'transfer' | 'loss'; reason?: string; unitCostCents?: number; unitRevenueCents?: number }
    const productId = body.productId
    const type = body.type ?? 'adjustment'
    // A direção do ajuste vem do `type`: 'in' e 'adjustment' somam; 'out', 'transfer' e 'loss' subtraem
    const sign = type === 'in' || type === 'adjustment' ? 1 : -1
    const delta = Number.isFinite(body.quantity) ? sign * Math.round(body.quantity as number) : 0
    const reason = body.reason?.trim() || null
    const unitCostCents = Number.isFinite(body.unitCostCents) ? Math.round(body.unitCostCents as number) : null
    const unitRevenueCents = Number.isFinite(body.unitRevenueCents) ? Math.round(body.unitRevenueCents as number) : null
    if (!productId || delta === 0) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Ajuste inválido' })
    }
    const store = await getStore()
    const out = await store.transaction(ctx.tenantId, async (tx) => {
      const bal = await tx.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId })
      const current = bal?.quantityBase ?? 0
      const nextQty = current + Math.round(delta)
      if (nextQty < 0) {
        throw new ApiError({ status: 409, code: 'CONFLICT', message: 'Ajuste deixaria estoque negativo' })
      }
      await tx.upsertInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId, quantityBase: nextQty })
      const mov = await tx.addInventoryMovement({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId,
        movementType: 'ADJUSTMENT',
        quantityBase: Math.round(delta),
        refType: 'MANUAL',
        refId: null,
        reason,
        createdBy: ctx.userId,
        unitCostCents,
        unitRevenueCents,
      })
      // Se for ENTRADA com custo informado, recalcula CMV (média ponderada).
      if (sign === 1 && unitCostCents != null && unitCostCents > 0) {
        await tx.updateProductAverageCost({
          tenantId: ctx.tenantId,
          productId,
          quantityIn: Math.abs(delta),
          unitCostInCents: unitCostCents,
        })
      }
      await tx.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'INVENTORY_ADJUST',
        entityType: 'PRODUCT',
        entityId: productId,
        metadata: { deltaBase: Math.round(delta), reason, unitCostCents, unitRevenueCents },
      })
      return { balance: { productId, quantityBase: nextQty }, movement: mov }
    })

    res.status(201).json(out)
  }),
)

router.post(
  '/finance/cash-sessions/open',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const body = req.body as { registerName?: string; operatorName?: string; openingCents?: number; notes?: string | null }
    const openingCents = Math.max(0, Math.round(body.openingCents ?? 0))
    const store = await getStore()
    const session = await store.transaction(ctx.tenantId, async (tx) => {
      const existing = await tx.getOpenCashSession({ tenantId: ctx.tenantId })
      if (existing) throw new ApiError({ status: 409, code: 'CONFLICT', message: 'Já existe caixa aberto' })
      const session = await tx.openCashSession({
        tenantId: ctx.tenantId,
        registerName: body.registerName ?? 'Caixa Principal',
        operatorName: body.operatorName ?? ctx.userId,
        openingCents,
        notes: body.notes ?? null,
      })
      await tx.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'CASH_OPEN',
        entityType: 'CASH_SESSION',
        entityId: session.id,
        metadata: { openingCents },
      })
      return session
    })
    res.status(201).json(session)
  }),
)

router.get(
  '/finance/cash-sessions/open',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const session = await store.getOpenCashSession({ tenantId: ctx.tenantId })
    if (!session) {
      res.status(200).json({ session: null, movements: [], totals: { salesCents: 0, supplyCents: 0, withdrawalCents: 0, tipCents: 0 } })
      return
    }
    const movements = await store.listCashMovements({ tenantId: ctx.tenantId, sessionId: session.id })
    const totals = movements.reduce(
      (acc, m) => {
        if (m.type === 'sale') acc.salesCents += m.amountCents
        if (m.type === 'supply') acc.supplyCents += m.amountCents
        if (m.type === 'withdrawal') acc.withdrawalCents += m.amountCents
        if (m.type === 'tip') acc.tipCents += m.amountCents
        return acc
      },
      { salesCents: 0, supplyCents: 0, withdrawalCents: 0, tipCents: 0 },
    )
    res.status(200).json({ session, movements, totals })
  }),
)

router.post(
  '/finance/cash-sessions/:id/close',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const body = req.body as { closingCents?: number; notes?: string | null }
    const closingCents = Math.max(0, Math.round(body.closingCents ?? 0))
    const store = await getStore()
    const session = await store.closeCashSession({
      tenantId: ctx.tenantId,
      sessionId: req.params.id,
      closingCents,
      notes: body.notes ?? null,
    })
    if (!session) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Caixa não encontrado' })
    await store.audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'CASH_CLOSE',
      entityType: 'CASH_SESSION',
      entityId: session.id,
      metadata: { closingCents, difference: session.differenceCents },
    })
    res.status(200).json(session)
  }),
)

router.get(
  '/finance/ar',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const status = (req.query.status as 'OPEN' | 'SETTLED' | 'CANCELLED' | undefined) ?? undefined
    const store = await getStore()
    const items = await store.listReceivables({ tenantId: ctx.tenantId, branchId: ctx.branchId, status })
    res.status(200).json({ items })
  }),
)

router.post(
  '/finance/ar/:id/settle',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FINANCE']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const ar = await store.transaction(ctx.tenantId, async (tx) => {
      const ar = await tx.settleReceivable({ tenantId: ctx.tenantId, receivableId: req.params.id })
      if (!ar) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Título não encontrado' })

      const session = await tx.getOpenCashSession({ tenantId: ctx.tenantId })
      if (session) {
        await tx.addCashMovement({
          tenantId: ctx.tenantId,
          sessionId: session.id,
          type: 'sale',
          amountCents: ar.amountCents,
          reason: `Recebimento AR ${ar.id}`,
          orderId: ar.orderId,
          createdBy: ctx.userId,
        })
      }

      await tx.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'AR_SETTLE',
        entityType: 'ACCOUNT_RECEIVABLE',
        entityId: ar.id,
        metadata: { amountCents: ar.amountCents, orderId: ar.orderId, cashSessionId: session?.id ?? null },
      })

      return ar
    })

    res.status(200).json(ar)
  }),
)

router.post(
  '/fiscal/documents',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FISCAL']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const body = req.body as { orderId?: string; docType?: 'NFE' | 'NFCE' }
    const orderId = body.orderId
    const docType = body.docType ?? 'NFE'
    if (!orderId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'orderId é obrigatório' })

    const store = await getStore()
    const doc = await store.transaction(ctx.tenantId, async (tx) => {
      const order = await tx.getOrder({ tenantId: ctx.tenantId, orderId })
      if (!order) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })

      const doc = await tx.createFiscalDocument({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        orderId,
        docType,
        status: 'PENDING',
        errorMessage: null,
        totalCents: order.totalCents,
      })

      await tx.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'FISCAL_REQUEST',
        entityType: 'FISCAL_DOCUMENT',
        entityId: doc.id,
        metadata: { orderId, docType },
      })

      return doc
    })

    res.status(201).json(doc)
  }),
)

router.get(
  '/fiscal/documents',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FISCAL']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
    const status = (req.query.status as 'PENDING' | 'AUTHORIZED' | 'REJECTED' | undefined) ?? undefined
    const store = await getStore()
    const items = await store.listFiscalDocuments({ tenantId: ctx.tenantId, branchId: ctx.branchId, status })
    res.status(200).json({ items })
  }),
)

router.post(
  '/fiscal/documents/:id/retry',
  requireAuth,
  requireRole(['OWNER', 'ADMIN', 'FISCAL']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const store = await getStore()
    const updated = await store.transaction(ctx.tenantId, async (tx) => {
      const doc = await tx.getFiscalDocument({ tenantId: ctx.tenantId, fiscalDocumentId: req.params.id })
      if (!doc) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Documento fiscal não encontrado' })
      const updated = await tx.updateFiscalDocument({
        tenantId: ctx.tenantId,
        fiscalDocumentId: doc.id,
        patch: { status: 'PENDING', errorMessage: null },
      })
      await tx.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'FISCAL_RETRY',
        entityType: 'FISCAL_DOCUMENT',
        entityId: doc.id,
        metadata: {},
      })
      return updated
    })

    res.status(200).json(updated)
  }),
)

router.get(
  '/audit/events',
  requireAuth,
  requireRole(['OWNER', 'ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getCtx(req)
    const entityType = (req.query.entityType as string | undefined) ?? undefined
    const entityId = (req.query.entityId as string | undefined) ?? undefined
    const store = await getStore()
    const events = await store.listAuditEvents({ tenantId: ctx.tenantId, entityType, entityId })
    // LGPD: passa o redator nos metadados antes de retornar. Mesmo que
    // algum endpoint tenha esquecido de sanitizar, o caller só verá placeholders.
    const safeEvents = events.map((e) => ({
      ...e,
      metadata: redactPii(e.metadata as unknown as Record<string, unknown>),
    }))
    res.status(200).json({ items: safeEvents })
  }),
)

export default router

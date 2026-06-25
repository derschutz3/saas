/**
 * Rotas de Pedidos de Compra (Purchase Orders).
 *
 * Fluxo:
 *   DRAFT → SENT → CONFIRMED → RECEIVED (gera entrada de estoque) | CANCELED
 *
 * Segurança:
 *   - Toda operação validada com requireAuth.
 *   - Filtros de tenant via getCtx(req).
 *   - Validação de input com Zod.
 *   - Transição RECEIVED executa entradas de estoque no `receivePurchaseOrder`.
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody, validateQuery } from '../shared/validate.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import {
  purchaseOrderCreateSchema,
  purchaseOrderUpdateSchema,
  purchaseOrderListQuerySchema,
  uuidParamSchema,
} from '../shared/schemas.js'
import { logger } from '../shared/logger.js'

const ENTITY = 'PurchaseOrder'

export const registerPurchaseRoutes = (app: Router): void => {
  const router = Router()

  // Listar pedidos de compra
  router.get(
    '/',
    requireAuth,
    validateQuery(purchaseOrderListQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const items = await store.listPurchaseOrders({
        tenantId: ctx.tenantId,
        status: req.query.status as 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELED' | 'all' | undefined,
        supplierId: req.query.supplierId as string | undefined,
      })
      res.json({ items })
    }),
  )

  // Detalhe de um pedido
  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const idParsed = uuidParamSchema.safeParse(req.params)
      if (!idParsed.success) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'ID inválido' })
      const store = await getStore()
      const order = await store.getPurchaseOrder({ tenantId: ctx.tenantId, orderId: idParsed.data.id })
      if (!order) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })
      res.json(order)
    }),
  )

  // Criar pedido (status default DRAFT)
  router.post(
    '/',
    requireAuth,
    validateBody(purchaseOrderCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      try {
        const created = await store.createPurchaseOrder({
          tenantId: ctx.tenantId,
          supplierId: req.body.supplierId,
          status: req.body.status ?? 'DRAFT',
          expectedDate: req.body.expectedDate ?? null,
          notes: req.body.notes ?? null,
          createdBy: ctx.userId,
          items: req.body.items,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: created.id,
          metadata: { status: created.status, totalCents: created.totalCents, supplier: created.supplierName },
        })
        logger.info('purchase.order.created', { traceId: ctx.traceId, orderId: created.id, total: created.totalCents })
        res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar pedido de compra'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Atualizar pedido (status, expectedDate, notes)
  router.patch(
    '/:id',
    requireAuth,
    validateBody(purchaseOrderUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const idParsed = uuidParamSchema.safeParse(req.params)
      if (!idParsed.success) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'ID inválido' })
      const store = await getStore()
      const updated = await store.updatePurchaseOrderStatus({
        tenantId: ctx.tenantId,
        orderId: idParsed.data.id,
        status: req.body.status,
        expectedDate: req.body.expectedDate,
        notes: req.body.notes,
        receivedBy: req.body.status === 'RECEIVED' ? ctx.userId : undefined,
      })
      if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'UPDATE',
        entityType: ENTITY,
        entityId: updated.id,
        metadata: { status: updated.status, expectedDate: updated.expectedDate },
      })
      res.json(updated)
    }),
  )

  // Excluir pedido (apenas DRAFT / SENT / CONFIRMED / CANCELED)
  router.delete(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const idParsed = uuidParamSchema.safeParse(req.params)
      if (!idParsed.success) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'ID inválido' })
      const store = await getStore()
      try {
        const result = await store.deletePurchaseOrder({ tenantId: ctx.tenantId, orderId: idParsed.data.id })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'DELETE',
          entityType: ENTITY,
          entityId: result.deletedId,
          metadata: {},
        })
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir pedido'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Receber pedido (CONFIRMED/SENT → RECEIVED). Gera entrada de estoque.
  router.post(
    '/:id/receive',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Selecione uma filial para receber o pedido' })
      }
      const idParsed = uuidParamSchema.safeParse(req.params)
      if (!idParsed.success) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'ID inválido' })
      const store = await getStore()
      try {
        const result = await store.receivePurchaseOrder({
          tenantId: ctx.tenantId,
          orderId: idParsed.data.id,
          branchId: ctx.branchId,
          receivedBy: ctx.userId,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: result.order.id,
          metadata: { status: 'RECEIVED', movementsCreated: result.movementsCreated, branchId: ctx.branchId },
        })
        logger.info('purchase.order.received', {
          traceId: ctx.traceId,
          orderId: result.order.id,
          movements: result.movementsCreated,
        })
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao receber pedido'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  app.use('/api/v1/purchases', router)
}

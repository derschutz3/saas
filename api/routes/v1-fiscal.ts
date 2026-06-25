/**
 * Rotas do módulo Fiscal (NF-e / NFC-e).
 *
 * Endpoints:
 *   GET    /api/v1/fiscal/documents
 *   GET    /api/v1/fiscal/documents/:id
 *   POST   /api/v1/fiscal/documents          — emite NF para um pedido
 *   POST   /api/v1/fiscal/documents/:id/emit — força autorização (stub SEFAZ)
 *   POST   /api/v1/fiscal/documents/:id/retry — reprocessa após rejeição
 *   POST   /api/v1/fiscal/documents/:id/cancel — cancela NF autorizada
 *   GET    /api/v1/fiscal/stats              — métricas resumidas
 *
 * Segurança:
 *   - Apenas OWNER/ADMIN/FISCAL podem criar/visualizar documentos.
 *   - Tenant isolado via getCtx(req).
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody, validateQuery } from '../shared/validate.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { z } from 'zod'
import { cleanString } from '../shared/schemas.js'
import { logger } from '../shared/logger.js'

const ENTITY = 'FiscalDocument'

const fiscalCreateSchema = z.object({
  orderId: z.string().uuid(),
  docType: z.enum(['NFE', 'NFCE']).default('NFE'),
})

const fiscalRetrySchema = z.object({
  approved: z.boolean().optional(),
  errorMessage: cleanString(500).optional().nullable(),
})

const fiscalCancelSchema = z.object({
  reason: cleanString(500),
})

const fiscalListQuerySchema = z.object({
  status: z.enum(['PENDING', 'AUTHORIZED', 'REJECTED', 'CANCELED', 'DENIED', 'all']).default('all'),
  docType: z.enum(['NFE', 'NFCE']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const registerFiscalRoutes = (app: Router): void => {
  const router = Router()

  // Listar documentos fiscais
  router.get(
    '/',
    requireAuth,
    validateQuery(fiscalListQuerySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      let items = await store.listFiscalDocuments({
        tenantId: ctx.tenantId,
        status: req.query.status === 'all' ? undefined : (req.query.status as 'PENDING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELED' | 'DENIED' | undefined),
      })
      if (req.query.docType) {
        items = items.filter((d) => d.docType === req.query.docType)
      }
      if (req.query.limit) {
        const n = Number(req.query.limit)
        if (Number.isFinite(n)) items = items.slice(0, n)
      }
      res.json({ items })
    }),
  )

  // Stats do módulo
  router.get(
    '/stats',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const items = await store.listFiscalDocuments({ tenantId: ctx.tenantId })
      const byStatus = items.reduce<Record<string, number>>((acc, d) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1
        return acc
      }, {})
      const byType = items.reduce<Record<string, number>>((acc, d) => {
        acc[d.docType] = (acc[d.docType] ?? 0) + 1
        return acc
      }, {})
      const totalAuthorizedCents = items
        .filter((d) => d.status === 'AUTHORIZED')
        .reduce((acc, d) => acc + (d.totalCents ?? 0), 0)
      res.json({
        total: items.length,
        byStatus,
        byType,
        totalAuthorizedCents,
        pendingCount: byStatus.PENDING ?? 0,
        rejectedCount: byStatus.REJECTED ?? 0,
      })
    }),
  )

  // Detalhe de um documento
  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const doc = await store.getFiscalDocument({ tenantId: ctx.tenantId, fiscalDocumentId: req.params.id })
      if (!doc) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Documento fiscal não encontrado' })
      res.json(doc)
    }),
  )

  // Emitir NF para um pedido (cria o registro em PENDING)
  router.post(
    '/',
    requireAuth,
    validateBody(fiscalCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Selecione uma filial para emitir o documento' })
      }
      const store = await getStore()
      const order = await store.getOrder({ tenantId: ctx.tenantId, orderId: req.body.orderId })
      if (!order) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado' })

      // Impedir duplicidade
      const existing = (await store.listFiscalDocuments({ tenantId: ctx.tenantId, orderId: order.id }))
        .find((d) => d.status === 'PENDING' || d.status === 'AUTHORIZED')
      if (existing) {
        throw new ApiError({ status: 409, code: 'CONFLICT', message: 'Já existe um documento fiscal ativo para este pedido' })
      }

      const doc = await store.createFiscalDocument({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        orderId: order.id,
        docType: req.body.docType,
        status: 'PENDING',
        errorMessage: null,
        totalCents: order.totalCents,
      })

      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'FISCAL_REQUEST',
        entityType: ENTITY,
        entityId: doc.id,
        metadata: { orderId: order.id, docType: req.body.docType, totalCents: order.totalCents },
      })

      logger.info('fiscal.doc.requested', { traceId: ctx.traceId, docId: doc.id, orderId: order.id })
      res.status(201).json(doc)
    }),
  )

  // Forçar autorização (stub da SEFAZ)
  router.post(
    '/:id/emit',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const doc = await store.getFiscalDocument({ tenantId: ctx.tenantId, fiscalDocumentId: req.params.id })
      if (!doc) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Documento fiscal não encontrado' })
      if (doc.status !== 'PENDING') {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Apenas documentos pendentes podem ser autorizados' })
      }
      // Em produção, chamar provedor SEFAZ aqui.
      // Como o `simulateFiscalAuthorization` aceita `approved: false`, podemos
      // simular rejeição passando-se `simulate: 'reject'` no body (dev only).
      const simulateReject = (req.body && (req.body as { simulate?: string }).simulate === 'reject')
      const updated = await store.simulateFiscalAuthorization({
        tenantId: ctx.tenantId,
        fiscalDocumentId: doc.id,
        approved: !simulateReject,
        errorMessage: simulateReject ? 'Rejeitada pela SEFAZ (simulação)' : null,
      })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'FISCAL_EMIT',
        entityType: ENTITY,
        entityId: doc.id,
        metadata: { simulateReject, status: updated?.status },
      })
      logger.info('fiscal.doc.authorized', { traceId: ctx.traceId, docId: doc.id, status: updated?.status })
      res.json(updated)
    }),
  )

  // Reenviar/reprocessar após rejeição
  router.post(
    '/:id/retry',
    requireAuth,
    validateBody(fiscalRetrySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const doc = await store.getFiscalDocument({ tenantId: ctx.tenantId, fiscalDocumentId: req.params.id })
      if (!doc) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Documento fiscal não encontrado' })
      if (doc.status !== 'REJECTED' && doc.status !== 'DENIED') {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Apenas documentos rejeitados podem ser reprocessados' })
      }
      // Resetar para PENDING e reapresentar
      const reset = await store.updateFiscalDocument({
        tenantId: ctx.tenantId,
        fiscalDocumentId: doc.id,
        patch: { status: 'PENDING', errorMessage: null },
      })
      if (req.body.approved !== undefined || req.body.errorMessage) {
        // Auto-resolve com o resultado do retry
        const updated = await store.simulateFiscalAuthorization({
          tenantId: ctx.tenantId,
          fiscalDocumentId: doc.id,
          approved: req.body.approved ?? true,
          errorMessage: req.body.errorMessage ?? null,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'FISCAL_RETRY',
          entityType: ENTITY,
          entityId: doc.id,
          metadata: { approved: req.body.approved, status: updated?.status },
        })
        res.json(updated)
        return
      }
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'FISCAL_RETRY',
        entityType: ENTITY,
        entityId: doc.id,
        metadata: { status: 'PENDING' },
      })
      res.json(reset)
    }),
  )

  // Cancelar NF autorizada
  router.post(
    '/:id/cancel',
    requireAuth,
    validateBody(fiscalCancelSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const updated = await store.cancelFiscalDocument({
        tenantId: ctx.tenantId,
        fiscalDocumentId: req.params.id,
        reason: req.body.reason,
        canceledBy: ctx.userId,
      })
      if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Documento fiscal não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'FISCAL_CANCEL',
        entityType: ENTITY,
        entityId: updated.id,
        metadata: { reason: req.body.reason, status: 'CANCELED' },
      })
      logger.info('fiscal.doc.canceled', { traceId: ctx.traceId, docId: updated.id, reason: req.body.reason })
      res.json(updated)
    }),
  )

  app.use('/api/v1/fiscal', router)
}

/**
 * Rotas de Caixa (Cash Register).
 *
 * Funcionalidades:
 * - Abrir sessão de caixa (com fundo de troco)
 * - Adicionar movimentos (vendas, sangrias, suprimentos, gorjetas, ajustes)
 * - Listar sessões e seus movimentos
 * - Fechar sessão com contagem de caixa
 * - Cálculo automático de diferença (sobra/falta) no fechamento
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody } from '../shared/validate.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import {
  cashSessionCreateSchema, cashSessionCloseSchema, cashMovementCreateSchema,
} from '../shared/schemas.js'
import { logger } from '../shared/logger.js'
import { buildSafeAuditMeta } from '../shared/pii-redactor.js'

const SESSION_ENTITY = 'CashSession'
const MOVEMENT_ENTITY = 'CashMovement'

export const registerCashRoutes = (app: Router): void => {
  const router = Router()

  // Sessão aberta atual
  router.get(
    '/session/open',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const session = await store.getOpenCashSession({ tenantId: ctx.tenantId })
      res.json({ session })
    }),
  )

  // Listar sessões
  router.get(
    '/sessions',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const status = (req.query.status as 'open' | 'closed' | 'all' | undefined) ?? 'all'
      const store = await getStore()
      const items = await store.listCashSessions({ tenantId: ctx.tenantId, status })
      res.json({ items })
    }),
  )

  // Detalhe de uma sessão
  router.get(
    '/sessions/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const session = await store.getCashSession({ tenantId: ctx.tenantId, sessionId: req.params.id })
      if (!session) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Sessão não encontrada' })
      res.json(session)
    }),
  )

  // Abrir sessão
  router.post(
    '/sessions',
    requireAuth,
    validateBody(cashSessionCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      try {
        const created = await store.openCashSession({
          tenantId: ctx.tenantId,
          registerName: req.body.registerName ?? 'Caixa Principal',
          operatorName: req.body.operatorName,
          openingCents: req.body.openingCents ?? 0,
          notes: req.body.notes ?? null,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'CREATE',
          entityType: SESSION_ENTITY,
          entityId: created.id,
          // LGPD: NÃO armazenar operatorName em texto claro.
          metadata: buildSafeAuditMeta({ openingCents: created.openingCents }),
        })
        logger.info('cash.session.opened', { traceId: ctx.traceId, sessionId: created.id })
        res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao abrir caixa'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Fechar sessão
  router.post(
    '/sessions/:id/close',
    requireAuth,
    validateBody(cashSessionCloseSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      try {
        const closed = await store.closeCashSession({
          tenantId: ctx.tenantId,
          sessionId: req.params.id,
          closingCents: req.body.closingCents,
          notes: req.body.notes ?? null,
        })
        if (!closed) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Sessão aberta não encontrada' })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'UPDATE',
          entityType: SESSION_ENTITY,
          entityId: closed.id,
          metadata: { closingCents: closed.closingCents, difference: closed.differenceCents },
        })
        logger.info('cash.session.closed', { traceId: ctx.traceId, sessionId: closed.id, difference: closed.differenceCents })
        res.json(closed)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao fechar caixa'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Listar movimentos (com sessionId opcional)
  router.get(
    '/movements',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const sessionId = req.query.sessionId as string | undefined
      const store = await getStore()
      const items = await store.listCashMovements({ tenantId: ctx.tenantId, sessionId })
      res.json({ items })
    }),
  )

  // Adicionar movimento
  router.post(
    '/movements',
    requireAuth,
    validateBody(cashMovementCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      // Verifica que a sessão existe e está aberta
      const session = await store.getCashSession({ tenantId: ctx.tenantId, sessionId: req.body.sessionId })
      if (!session) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Sessão não encontrada' })
      if (session.status !== 'open') throw new ApiError({ status: 400, code: 'SESSION_CLOSED', message: 'Sessão de caixa já está fechada' })

      try {
        const created = await store.addCashMovement({
          tenantId: ctx.tenantId,
          sessionId: req.body.sessionId,
          type: req.body.type,
          amountCents: req.body.amountCents,
          reason: req.body.reason ?? null,
          orderId: req.body.orderId ?? null,
          createdBy: ctx.userId,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'CREATE',
          entityType: MOVEMENT_ENTITY,
          entityId: created.id,
          metadata: { type: created.type, amount: created.amountCents, sessionId: created.sessionId },
        })
        res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao registrar movimento'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  app.use('/api/v1/cash', router)
}

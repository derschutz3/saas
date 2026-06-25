/**
 * Rotas de Configurações (Settings).
 *
 * Endpoints:
 *   GET    /api/v1/settings/me/tenant   — dados do tenant atual
 *   PATCH  /api/v1/settings/me/tenant   — atualiza businessType / dados cadastrais
 *   GET    /api/v1/settings/users
 *   POST   /api/v1/settings/users
 *   PATCH  /api/v1/settings/users/:id
 *   DELETE /api/v1/settings/users/:id
 *   GET    /api/v1/settings/branches
 *   POST   /api/v1/settings/branches
 *   PATCH  /api/v1/settings/branches/:id
 *   DELETE /api/v1/settings/branches/:id
 *
 * Permissões: apenas OWNER/ADMIN (configurações sensíveis).
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody } from '../shared/validate.js'
import { requireAuth, getCtx, requireRole } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import {
  userCreateSchema, userUpdateSchema,
  branchCreateSchema, branchUpdateSchema,
  tenantBusinessTypeUpdateSchema,
} from '../shared/schemas.js'
import { logger } from '../shared/logger.js'
import { hashPassword } from '../shared/security.js'
import { buildSafeAuditMeta } from '../shared/pii-redactor.js'

const ENTITY = 'Settings'

export const registerSettingsRoutes = (app: Router): void => {
  const router = Router()

  // ============= Tenant (dados do tenant atual) =============
  router.get(
    '/me/tenant',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const tenant = await store.getTenant(ctx.tenantId)
      if (!tenant) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Tenant não encontrado' })
      res.json(tenant)
    }),
  )

  router.patch(
    '/me/tenant',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    validateBody(tenantBusinessTypeUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const updated = await store.updateTenant(ctx.tenantId, {
        businessType: req.body.businessType,
        legalName: req.body.legalName ?? null,
        tradeName: req.body.tradeName ?? null,
        taxId: req.body.taxId ?? null,
      })
      if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Tenant não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'TENANT_UPDATE',
        entityType: 'TENANT',
        entityId: ctx.tenantId,
        metadata: { businessType: req.body.businessType },
      })
      logger.info('settings.tenant.updated', { traceId: ctx.traceId, businessType: req.body.businessType })
      res.json(updated)
    }),
  )

  // ============= Users =============
  router.get(
    '/users',
    requireAuth,
    requireRole(['OWNER', 'ADMIN', 'MANAGER']),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const items = await store.listUsers({ tenantId: ctx.tenantId, includeInactive: req.query.includeInactive === 'true' })
      res.json({ items })
    }),
  )

  router.post(
    '/users',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    validateBody(userCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      // Verificar email duplicado
      const existing = (await store.listUsers({ tenantId: ctx.tenantId, includeInactive: true }))
        .find((u) => u.email.toLowerCase() === req.body.email.toLowerCase())
      if (existing) {
        throw new ApiError({ status: 409, code: 'CONFLICT', message: 'Email já cadastrado' })
      }
      const password = await hashPassword(req.body.password)
      const created = await store.createUser({
        tenantId: ctx.tenantId,
        name: req.body.name,
        email: req.body.email,
        role: req.body.role,
        branchId: req.body.branchId ?? null,
        active: req.body.active,
        passwordSalt: password.salt,
        passwordHash: password.hash,
        // enabledModules: undefined = herda do tenant, [] = bloqueia tudo, lista = override
        enabledModules: req.body.enabledModules ?? null,
      })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'USER_CREATE',
        entityType: 'USER',
        entityId: created.id,
        // LGPD: NÃO armazenar email em claro no audit log.
        // Hash permite correlação sem expor PII.
        metadata: buildSafeAuditMeta({
          role: created.role,
          modulesCount: created.enabledModules?.length ?? 'tenant',
        }),
      })
      // LGPD: log também sem PII — só IDs e role.
      logger.info('settings.user.created', {
        traceId: ctx.traceId,
        userId: created.id,
        role: created.role,
        modulesCount: created.enabledModules?.length,
      })
      res.status(201).json({ ...created, passwordSalt: undefined, passwordHash: undefined })
    }),
  )

  router.patch(
    '/users/:id',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    validateBody(userUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const patch: Record<string, unknown> = { ...req.body }
      if (req.body.password) {
        const password = await hashPassword(req.body.password)
        patch.passwordSalt = password.salt
        patch.passwordHash = password.hash
        delete patch.password
      }
      const updated = await store.updateUser({
        tenantId: ctx.tenantId,
        userId: req.params.id,
        patch: patch as Parameters<typeof store.updateUser>[0]['patch'],
      })
      if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Usuário não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'USER_UPDATE',
        entityType: 'USER',
        entityId: updated.id,
        metadata: { ...req.body, password: req.body.password ? '***' : undefined },
      })
      res.json({ ...updated, passwordSalt: undefined, passwordHash: undefined })
    }),
  )

  router.delete(
    '/users/:id',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      if (req.params.id === ctx.userId) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Não é possível excluir o próprio usuário' })
      }
      try {
        const result = await store.deleteUser({ tenantId: ctx.tenantId, userId: req.params.id })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'USER_DELETE',
          entityType: 'USER',
          entityId: result.deletedId,
          metadata: {},
        })
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir usuário'
        if (msg.toLowerCase().includes('não encontrado')) {
          throw new ApiError({ status: 404, code: 'NOT_FOUND', message: msg })
        }
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // ============= Branches =============
  router.get(
    '/branches',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const items = await store.listBranches({ tenantId: ctx.tenantId })
      res.json({ items })
    }),
  )

  router.post(
    '/branches',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    validateBody(branchCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const created = await store.createBranch({ tenantId: ctx.tenantId, name: req.body.name })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'BRANCH_CREATE',
        entityType: 'BRANCH',
        entityId: created.id,
        metadata: { name: created.name },
      })
      logger.info('settings.branch.created', { traceId: ctx.traceId, branchId: created.id })
      res.status(201).json(created)
    }),
  )

  router.patch(
    '/branches/:id',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    validateBody(branchUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const updated = await store.updateBranch({
        tenantId: ctx.tenantId,
        branchId: req.params.id,
        patch: { name: req.body.name },
      })
      if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Filial não encontrada' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'BRANCH_UPDATE',
        entityType: 'BRANCH',
        entityId: updated.id,
        metadata: { name: updated.name },
      })
      res.json(updated)
    }),
  )

  router.delete(
    '/branches/:id',
    requireAuth,
    requireRole(['OWNER', 'ADMIN']),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      if (req.params.id === ctx.branchId) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Não é possível excluir a filial atual' })
      }
      try {
        const result = await store.deleteBranch({ tenantId: ctx.tenantId, branchId: req.params.id })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'BRANCH_DELETE',
          entityType: 'BRANCH',
          entityId: result.deletedId,
          metadata: {},
        })
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir filial'
        if (msg.toLowerCase().includes('não encontrada')) {
          throw new ApiError({ status: 404, code: 'NOT_FOUND', message: msg })
        }
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  app.use('/api/v1/settings', router)
}

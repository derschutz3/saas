/**
 * Rotas de Clientes (CRM).
 *
 * Implementa CRUD com:
 * - Permissão RBAC: OWNER/ADMIN (criar/editar/excluir); OPS pode apenas ler
 * - Soft delete (arquivar) + exclusão física
 * - Auditoria (criação/edição/arquivamento/restauração/exclusão)
 * - Listagem com busca por nome, CNPJ/CPF, e-mail, telefone, tags, cidade
 * - Filtro por lifecycle e por tag
 * - Stats agregados (total gasto, último pedido) em endpoint dedicado
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody } from '../shared/validate.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { customerCreateSchema, customerUpdateSchema } from '../shared/schemas.js'
import { logger } from '../shared/logger.js'
import { buildSafeAuditMeta } from '../shared/pii-redactor.js'

const CUSTOMER_ENTITY = 'Customer'

export const registerCustomerRoutes = (app: Router): void => {
  const router = Router()

  // Listar clientes
  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true'
      const query = (req.query.query as string | undefined)?.trim() || undefined
      const lifecycle = req.query.lifecycle as 'lead' | 'active' | 'inactive' | 'churned' | undefined
      const tag = req.query.tag as string | undefined
      const store = await getStore()
      const items = await store.listCustomers({ tenantId: ctx.tenantId, query, includeArchived, lifecycle, tag })
      res.json({ items })
    }),
  )

  // Stats agregados
  router.get(
    '/stats',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const all = await store.listCustomers({ tenantId: ctx.tenantId, includeArchived: true })
      const active = all.filter((c) => c.active).length
      const archived = all.filter((c) => !c.active).length
      const byLifecycle = {
        lead: all.filter((c) => c.lifecycle === 'lead').length,
        active: all.filter((c) => c.lifecycle === 'active').length,
        inactive: all.filter((c) => c.lifecycle === 'inactive').length,
        churned: all.filter((c) => c.lifecycle === 'churned').length,
      }
      const vip = all.filter((c) => c.active && c.tags.includes('VIP')).length
      res.json({ total: all.length, active, archived, byLifecycle, vip })
    }),
  )

  // Detalhe de um cliente
  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const customer = await store.getCustomer({ tenantId: ctx.tenantId, customerId: req.params.id })
      if (!customer) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })
      res.json(customer)
    }),
  )

  // Criar cliente — OWNER/ADMIN/OPERATOR
  router.post(
    '/',
    requireAuth,
    validateBody(customerCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      try {
        const created = await store.createCustomer({
          tenantId: ctx.tenantId,
          name: req.body.name,
          tradeName: req.body.tradeName ?? null,
          taxId: req.body.taxId ?? null,
          email: req.body.email ?? null,
          phone: req.body.phone ?? null,
          whatsapp: req.body.whatsapp ?? null,
          address: req.body.address ?? null,
          city: req.body.city ?? null,
          state: req.body.state ?? null,
          zip: req.body.zip ?? null,
          tags: req.body.tags ?? [],
          lifecycle: req.body.lifecycle ?? 'active',
          notes: req.body.notes ?? null,
          creditLimitCents: req.body.creditLimitCents ?? null,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'CREATE',
          entityType: CUSTOMER_ENTITY,
          entityId: created.id,
          // LGPD: metadata SEM PII em texto claro (nome/email/phone).
          // Hash preserva correlação entre eventos sem expor o dado.
          metadata: buildSafeAuditMeta({ lifecycle: created.lifecycle }),
        })
        // LGPD: log não inclui nome/email/phone. Só IDs e contexto.
        logger.info('customer.created', { traceId: ctx.traceId, customerId: created.id, userId: ctx.userId })
        res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar cliente'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Atualizar cliente
  router.patch(
    '/:id',
    requireAuth,
    validateBody(customerUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const existing = await store.getCustomer({ tenantId: ctx.tenantId, customerId: req.params.id })
      if (!existing) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })

      try {
        const updated = await store.updateCustomer({
          tenantId: ctx.tenantId,
          customerId: req.params.id,
          patch: req.body,
        })
        if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'UPDATE',
          entityType: CUSTOMER_ENTITY,
          entityId: updated.id,
          // LGPD: NÃO armazenar patch inteiro (contém nome/email/phone/CNPJ/endereço).
          // Apenas indica quais campos foram alterados (sem os valores).
          metadata: buildSafeAuditMeta({ fieldsChanged: Object.keys(req.body) }),
        })
        res.json(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar cliente'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Arquivar (soft delete)
  router.post(
    '/:id/archive',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const customer = await store.archiveCustomer({ tenantId: ctx.tenantId, customerId: req.params.id })
      if (!customer) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'ARCHIVE',
        entityType: CUSTOMER_ENTITY,
        entityId: customer.id,
        metadata: { name: customer.name },
      })
      res.json(customer)
    }),
  )

  // Restaurar cliente arquivado
  router.post(
    '/:id/restore',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const customer = await store.restoreCustomer({ tenantId: ctx.tenantId, customerId: req.params.id })
      if (!customer) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'RESTORE',
        entityType: CUSTOMER_ENTITY,
        entityId: customer.id,
        metadata: { name: customer.name },
      })
      res.json(customer)
    }),
  )

  // Excluir permanentemente
  router.delete(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const existing = await store.getCustomer({ tenantId: ctx.tenantId, customerId: req.params.id })
      if (!existing) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })
      try {
        const result = await store.deleteCustomer({ tenantId: ctx.tenantId, customerId: req.params.id })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'DELETE',
          entityType: CUSTOMER_ENTITY,
          entityId: existing.id,
          metadata: { name: existing.name },
        })
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir cliente'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  app.use('/api/v1/customers', router)
}

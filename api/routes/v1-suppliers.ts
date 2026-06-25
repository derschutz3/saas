/**
 * Rotas de Fornecedores.
 *
 * Implementa CRUD gerenciável pelo cliente:
 * - Permissão RBAC: OWNER/ADMIN (criar/editar/excluir); OPS pode apenas ler
 * - Soft delete (arquivar) + exclusão física
 * - Auditoria (criação/edição/arquivamento/restauração/exclusão)
 * - Listagem inclui busca por nome, documento, e-mail, contato e cidade
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody } from '../shared/validate.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { supplierCreateSchema, supplierUpdateSchema } from '../shared/schemas.js'
import { logger } from '../shared/logger.js'
import { buildSafeAuditMeta } from '../shared/pii-redactor.js'

const SUPPLIER_ENTITY = 'Supplier'

export const registerSupplierRoutes = (app: Router): void => {
  const router = Router()

  // Listar fornecedores do tenant
  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true'
      const query = (req.query.query as string | undefined)?.trim() || undefined
      const store = await getStore()
      const items = await store.listSuppliers({ tenantId: ctx.tenantId, query, includeArchived })
      res.json({ items })
    }),
  )

  // Detalhe de um fornecedor
  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const supplier = await store.getSupplier({ tenantId: ctx.tenantId, supplierId: req.params.id })
      if (!supplier) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
      res.json(supplier)
    }),
  )

  // Criar fornecedor — OWNER/ADMIN
  router.post(
    '/',
    requireAuth,
    validateBody(supplierCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente para gerenciar fornecedores' })
      }
      const store = await getStore()
      try {
        const created = await store.createSupplier({
          tenantId: ctx.tenantId,
          name: req.body.name,
          document: req.body.document ?? null,
          email: req.body.email ?? null,
          phone: req.body.phone ?? null,
          contactName: req.body.contactName ?? null,
          address: req.body.address ?? null,
          city: req.body.city ?? null,
          state: req.body.state ?? null,
          zip: req.body.zip ?? null,
          paymentTerms: req.body.paymentTerms ?? null,
          leadTimeDays: req.body.leadTimeDays ?? null,
          notes: req.body.notes ?? null,
          active: req.body.active ?? true,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'CREATE',
          entityType: SUPPLIER_ENTITY,
          entityId: created.id,
          // LGPD: NÃO armazenar nome/documento (CNPJ) em texto claro.
          metadata: buildSafeAuditMeta({}),
        })
        logger.info('supplier.created', { traceId: ctx.traceId, supplierId: created.id, userId: ctx.userId })
        res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar fornecedor'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Atualizar fornecedor — OWNER/ADMIN
  router.patch(
    '/:id',
    requireAuth,
    validateBody(supplierUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const existing = await store.getSupplier({ tenantId: ctx.tenantId, supplierId: req.params.id })
      if (!existing) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })

      try {
        const updated = await store.updateSupplier({
          tenantId: ctx.tenantId,
          supplierId: req.params.id,
          patch: req.body,
        })
        if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'UPDATE',
          entityType: SUPPLIER_ENTITY,
          entityId: updated.id,
          metadata: { patch: req.body },
        })
        logger.info('supplier.updated', { traceId: ctx.traceId, supplierId: updated.id, userId: ctx.userId })
        res.json(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar fornecedor'
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
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const supplier = await store.archiveSupplier({ tenantId: ctx.tenantId, supplierId: req.params.id })
      if (!supplier) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'ARCHIVE',
        entityType: SUPPLIER_ENTITY,
        entityId: supplier.id,
        metadata: { name: supplier.name },
      })
      res.json(supplier)
    }),
  )

  // Restaurar fornecedor arquivado
  router.post(
    '/:id/restore',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const supplier = await store.restoreSupplier({ tenantId: ctx.tenantId, supplierId: req.params.id })
      if (!supplier) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'RESTORE',
        entityType: SUPPLIER_ENTITY,
        entityId: supplier.id,
        metadata: { name: supplier.name },
      })
      res.json(supplier)
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
      const existing = await store.getSupplier({ tenantId: ctx.tenantId, supplierId: req.params.id })
      if (!existing) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
      try {
        const result = await store.deleteSupplier({ tenantId: ctx.tenantId, supplierId: req.params.id })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'DELETE',
          entityType: SUPPLIER_ENTITY,
          entityId: existing.id,
          metadata: { name: existing.name },
        })
        logger.info('supplier.deleted', { traceId: ctx.traceId, supplierId: existing.id, userId: ctx.userId })
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir fornecedor'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  app.use('/api/v1/suppliers', router)
}

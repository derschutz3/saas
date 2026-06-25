/**
 * Rotas de categorias de estoque.
 *
 * Implementa o CRUD gerenciável pelo cliente (próprio usuário final) com:
 * - Permissão RBAC: estoque.categorias.gerenciar (OWNER/ADMIN)
 * - Soft delete (arquivar) + exclusão física com fallback
 * - Reorder (drag-and-drop via array ordenado)
 * - Bulk move de produtos
 * - Auditoria (criação/edição/arquivamento/restauração/exclusão)
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { validateBody } from '../shared/validate.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { routeCache, cacheRoute } from '../shared/route-cache.js'
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryDeleteSchema,
  categoryReorderSchema,
  bulkMoveProductsSchema,
} from '../shared/schemas.js'
import { logger } from '../shared/logger.js'

const CATEGORY_ENTITY = 'Category'

export const registerCategoryRoutes = (app: Router): void => {
  const router = Router()

  // Listar categorias do tenant (com contagem de produtos)
  router.get(
    '/',
    requireAuth,
    // Cache read-only: a lista de categorias muda raramente e é lida em quase
    // toda página. Invalidada por bumpByPrefix(`categories:${tenantId}:`) em
    // qualquer escrita (create/update/delete/reorder/bulk-move).
    cacheRoute({
      ttlMs: 60_000,
      key: (req) => {
        const ctx = getCtx(req)
        if (!ctx?.tenantId) return ''
        const archived = req.query.includeArchived === '1' || req.query.includeArchived === 'true'
        return `categories:${ctx.tenantId}:list:${archived ? 'all' : 'active'}`
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true'
      const categories = await store.listCategories({ tenantId: ctx.tenantId, includeArchived })
      const counts = await Promise.all(
        categories.map(async (c) => ({
          id: c.id,
          count: await store.countProductsByCategory({ tenantId: ctx.tenantId, categoryId: c.id }),
        })),
      )
      const countMap = new Map(counts.map((c) => [c.id, c.count] as const))
      res.json({
        items: categories.map((c) => ({ ...c, productCount: countMap.get(c.id) ?? 0 })),
      })
    }),
  )

  // Detalhe de uma categoria
  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const cat = await store.getCategory({ tenantId: ctx.tenantId, categoryId: req.params.id })
      if (!cat) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Categoria não encontrada' })
      const productCount = await store.countProductsByCategory({ tenantId: ctx.tenantId, categoryId: cat.id })
      res.json({ ...cat, productCount })
    }),
  )

  // Criar categoria — requer permissão OWNER/MANAGER
  router.post(
    '/',
    requireAuth,
    validateBody(categoryCreateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente para gerenciar categorias' })
      }
      const store = await getStore()
      try {
        const created = await store.createCategory({
          tenantId: ctx.tenantId,
          name: req.body.name,
          description: req.body.description ?? null,
          color: req.body.color ?? null,
          icon: req.body.icon ?? null,
          createdBy: ctx.userId,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'CREATE',
          entityType: CATEGORY_ENTITY,
          entityId: created.id,
          metadata: { name: created.name, color: created.color, icon: created.icon },
        })
        logger.info('category.created', { traceId: ctx.traceId, categoryId: created.id, userId: ctx.userId })
        routeCache.bumpByPrefix(`categories:${ctx.tenantId}:`)
        res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar categoria'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Atualizar categoria (renomear, mudar cor/ícone/descrição/posição)
  router.patch(
    '/:id',
    requireAuth,
    validateBody(categoryUpdateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente para gerenciar categorias' })
      }
      const store = await getStore()
      const existing = await store.getCategory({ tenantId: ctx.tenantId, categoryId: req.params.id })
      if (!existing) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Categoria não encontrada' })

      try {
        const updated = await store.updateCategory({
          tenantId: ctx.tenantId,
          categoryId: req.params.id,
          patch: req.body,
          updatedBy: ctx.userId,
        })
        if (!updated) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Categoria não encontrada' })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'UPDATE',
          entityType: CATEGORY_ENTITY,
          entityId: updated.id,
          metadata: { patch: req.body, isSystem: existing.isSystem },
        })
        logger.info('category.updated', { traceId: ctx.traceId, categoryId: updated.id, userId: ctx.userId })
        routeCache.bumpByPrefix(`categories:${ctx.tenantId}:`)
        res.json(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar categoria'
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
      try {
        const cat = await store.archiveCategory({ tenantId: ctx.tenantId, categoryId: req.params.id, updatedBy: ctx.userId })
        if (!cat) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Categoria não encontrada' })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'ARCHIVE',
          entityType: CATEGORY_ENTITY,
          entityId: cat.id,
          metadata: { name: cat.name },
        })
        res.json(cat)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao arquivar'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Restaurar
  router.post(
    '/:id/restore',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const cat = await store.restoreCategory({ tenantId: ctx.tenantId, categoryId: req.params.id, updatedBy: ctx.userId })
      if (!cat) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Categoria não encontrada' })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'RESTORE',
        entityType: CATEGORY_ENTITY,
        entityId: cat.id,
        metadata: { name: cat.name },
      })
      res.json(cat)
    }),
  )

  // Excluir (permanente, com fallback opcional)
  router.delete(
    '/:id',
    requireAuth,
    validateBody(categoryDeleteSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const existing = await store.getCategory({ tenantId: ctx.tenantId, categoryId: req.params.id })
      if (!existing) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Categoria não encontrada' })
      try {
        const result = await store.deleteCategory({
          tenantId: ctx.tenantId,
          categoryId: req.params.id,
          fallbackCategoryId: req.body.fallbackCategoryId,
          updatedBy: ctx.userId,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'DELETE',
          entityType: CATEGORY_ENTITY,
          entityId: existing.id,
          metadata: {
            name: existing.name,
            movedItems: result.movedItems,
            fallbackCategoryId: req.body.fallbackCategoryId,
          },
        })
        logger.info('category.deleted', { traceId: ctx.traceId, categoryId: existing.id, movedItems: result.movedItems, userId: ctx.userId })
        routeCache.bumpByPrefix(`categories:${ctx.tenantId}:`)
        res.json(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  // Reordenar categorias (drag-and-drop)
  router.put(
    '/reorder',
    requireAuth,
    validateBody(categoryReorderSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'MANAGER') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      const categories = await store.reorderCategories({
        tenantId: ctx.tenantId,
        orderedIds: req.body.orderedIds,
        updatedBy: ctx.userId,
      })
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'REORDER',
        entityType: CATEGORY_ENTITY,
        entityId: 'bulk',
        metadata: { count: req.body.orderedIds.length },
      })
      res.json({ items: categories })
    }),
  )

  // Bulk move: mover produtos para outra categoria
  router.post(
    '/bulk-move',
    requireAuth,
    validateBody(bulkMoveProductsSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Permissão insuficiente' })
      }
      const store = await getStore()
      try {
        const moved = await store.bulkMoveProducts({
          tenantId: ctx.tenantId,
          productIds: req.body.productIds,
          targetCategoryId: req.body.targetCategoryId,
          updatedBy: ctx.userId,
        })
        await store.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'BULK_MOVE_PRODUCTS',
          entityType: 'Product',
          entityId: 'bulk',
          metadata: { count: moved, targetCategoryId: req.body.targetCategoryId },
        })
        res.json({ moved })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao mover produtos'
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: msg })
      }
    }),
  )

  app.use('/api/v1/categories', router)
}

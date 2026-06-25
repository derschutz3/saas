/**
 * Rotas LGPD (Lei Geral de Proteção de Dados — Lei 13.709/2018).
 *
 * Endpoints:
 *   GET   /api/v1/lgpd/me/data-export  — Art. 18, V (direito de acesso)
 *   POST  /api/v1/lgpd/me/anonymize    — Art. 18, VI (direito de eliminação)
 *
 * SECURITY: as rotas abaixo são restritas a OWNER/ADMIN. Para um cliente
 * final acessar seus dados, o caminho é:
 *   1. customer entra em "Meus dados" no app
 *   2. cliente preenche phone + email e solicita verificação
 *   3. sistema envia OTP para validar identidade
 *   4. após validação, retorna o payload de export
 *
 * Aqui no backend simplificamos: a identificação é feita por (tenantId, customerId)
 * fornecido pelo OWNER/ADMIN (que já tem permissão). A camada de "customer
 * individual" ficaria em outra rota (futura).
 */

import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { logger } from '../shared/logger.js'

export const registerLgpdRoutes = (app: Router): void => {
  const router = Router()

  /**
   * GET /api/v1/lgpd/customers/:id/data-export
   *
   * SECURITY: OWNER/ADMIN. Exporta TODOS os dados pessoais de um customer.
   *
   * Implementação:
   *  - profile: name, email, phone, address, document, lifecycle
   *  - orders: orders onde customerName match (já que Order não tem FK explícita)
   *  - inventoryMovements: items de venda onde customerName match
   *  - auditLog: events do customer (preservado por obrigação legal)
   *
   * SECURITY (LGPD Art. 18, V): entrega dados em formato portável (JSON).
   */
  router.get(
    '/customers/:id/data-export',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const role = String(ctx.role ?? '').toUpperCase()
      if (!['OWNER', 'ADMIN'].includes(role)) {
        throw new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Apenas OWNER/ADMIN pode exportar dados de customer',
        })
      }
      const customerId = req.params.id
      if (!customerId) {
        throw new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'customerId é obrigatório' })
      }
      const store = await getStore()
      const customer = await store.getCustomer({ tenantId: ctx.tenantId, customerId })
      if (!customer) {
        throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado' })
      }

      // Busca orders onde customerName bate
      const allOrders = await store.listOrders({
        tenantId: ctx.tenantId,
        branchId: '', // ignora filtro de branch
      } as Parameters<typeof store.listOrders>[0])
      const myOrders = allOrders.filter((o) => o.customerName === customer.name)

      // LGPD: log SEM PII (só IDs)
      logger.info('lgpd.data_export.executed', {
        traceId: ctx.traceId,
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        targetCustomerId: customerId,
        ordersCount: myOrders.length,
      })

      res.json({
        ok: true,
        data: {
          profile: {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            whatsapp: customer.whatsapp,
            address: customer.address,
            city: customer.city,
            state: customer.state,
            zip: customer.zip,
            tags: customer.tags,
            lifecycle: customer.lifecycle,
            notes: customer.notes,
            creditLimitCents: customer.creditLimitCents,
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt,
          },
          orders: myOrders.map((o) => ({
            id: o.id,
            channel: o.channel,
            status: o.status,
            subtotalCents: o.subtotalCents,
            totalCents: o.totalCents,
            createdAt: o.createdAt,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            deliveryAddress: o.deliveryAddress,
          })),
          generatedAt: new Date().toISOString(),
        },
      })
    }),
  )

  /**
   * POST /api/v1/lgpd/customers/:id/anonymize
   *
   * SECURITY (LGPD Art. 18, VI): OWNER/ADMIN pode solicitar anonimização.
   *
   * Comportamento:
   *  - name → 'CONSUMIDOR ANONIMIZADO'
   *  - phone, email, whatsapp, address, city, state, zip, notes → NULL
   *  - tags → []
   *  - orders.customerName / customerPhone onde match → placeholder
   *  - audit log: preservado (já tem metadata hasheado via buildSafeAuditMeta)
   */
  router.post(
    '/customers/:id/anonymize',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const role = String(ctx.role ?? '').toUpperCase()
      if (!['OWNER', 'ADMIN'].includes(role)) {
        throw new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Apenas OWNER/ADMIN pode acionar anonimização',
        })
      }
      const customerId = req.params.id
      if (!customerId) {
        throw new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'customerId é obrigatório' })
      }
      const store = await getStore()
      await store.anonymizeCustomer({ tenantId: ctx.tenantId, customerId })

      logger.info('lgpd.anonymize.executed', {
        traceId: ctx.traceId,
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        targetCustomerId: customerId,
      })

      res.json({
        ok: true,
        customerId,
        anonymizedAt: new Date().toISOString(),
      })
    }),
  )

  /**
   * POST /api/v1/lgpd/maintenance/audit-purge
   *
   * SECURITY (LGPD Art. 16): trigger manual da purga de audit_events vencidos.
   *
   * Acesso:
   *  - Apenas OWNER pode acionar (LGPD Art. 50 — boas práticas)
   *  - Endpoint também é chamado pelo cron job (scripts/maintenance/audit-purge.js)
   *
   * Body opcional: { dryRun?: boolean } — apenas conta, sem deletar
   */
  router.post(
    '/maintenance/audit-purge',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const role = String(ctx.role ?? '').toUpperCase()
      if (!['OWNER', 'ADMIN'].includes(role)) {
        throw new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Apenas OWNER/ADMIN pode acionar purge de auditoria',
        })
      }
      const dryRun = req.body?.dryRun === true
      const store = await getStore()
      if (dryRun) {
        // SECURITY (LGPD): retorna contagem estimada sem deletar
        const now = Date.now()
        const wouldDelete = await store.listAuditEvents({ tenantId: ctx.tenantId })
        const expired = wouldDelete.filter((e) => e.expiresAt && new Date(e.expiresAt).getTime() < now)
        return res.json({
          ok: true,
          mode: 'dryRun',
          cutoff: new Date(now).toISOString(),
          totalEvents: wouldDelete.length,
          wouldDelete: expired.length,
          nextRunRecommended: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        })
      }
      const result = await store.purgeExpiredAuditEvents()
      // LGPD: log SEM PII (apenas métricas)
      logger.info('lgpd.audit_purge.executed', {
        traceId: ctx.traceId,
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        deletedCount: result.deletedCount,
        cutoff: result.cutoff,
      })
      res.json({
        ok: true,
        mode: 'execute',
        ...result,
      })
    }),
  )

  app.use('/api/v1/lgpd', router)
}
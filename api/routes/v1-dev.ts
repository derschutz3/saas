/**
 * Endpoints de DEV — popular dados de teste para o agente de IA.
 * Em produção, as rotas não são registradas.
 */
import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../shared/http.js'
import { requireAuth, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'
import { logger } from '../shared/logger.js'

const isProd = process.env.NODE_ENV === 'production'

/**
 * POST /api/v1/dev/seed-agent
 *
 * Cria o cenário de teste:
 *  - cliente "Bar do Zé" com telefone 11999887766
 *  - 2 produtos (Cerveja A, Cerveja B)
 *  - Estoque: 80 Cerveja A, 50 Cerveja B
 *  - Order de 30 dias atrás: Bar do Zé comprou 50 Cerveja A
 *
 * Idempotente: pode ser chamado várias vezes sem duplicar.
 */
const buildRouter = (): Router => {
  const router = Router()

  router.post(
    '/seed-agent',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      const store = await getStore()
      const tenantId = ctx.tenantId
      const branchId = (req.body?.branchId as string | undefined) ?? ctx.branchId ?? 'br_default'
      const customerPhone = (req.body?.customerPhone as string | undefined) ?? '11999887766'
      const customerName = (req.body?.customerName as string | undefined) ?? 'Bar do Zé Ltda'

      // 1. Cliente
      let customer = await store.findCustomerByPhone({ tenantId, phone: customerPhone })
      if (!customer) {
        customer = await store.createCustomer({
          tenantId, name: customerName, phone: customerPhone, whatsapp: customerPhone,
          tradeName: null, taxId: null, email: null,
          address: 'Rua das Flores, 123', city: null, state: null, zip: null,
          tags: [], lifecycle: 'lead', notes: null, creditLimitCents: null,
        })
      }

      // 2. Produtos
      const products = await store.listProducts({ tenantId })
      const sysCatId = await store.getSystemCategoryId({ tenantId })
      let cervejaA = products.find((p) => p.sku === 'SKU-SEED-001')
      if (!cervejaA) {
        cervejaA = await store.createProduct({ tenantId, sku: 'SKU-SEED-001', name: 'Cerveja Pilsen 350ml (teste IA)', baseUnit: 'un', categoryId: sysCatId, active: true, averageCostCents: 0 })
      }
      let cervejaB = products.find((p) => p.sku === 'SKU-SEED-002')
      if (!cervejaB) {
        cervejaB = await store.createProduct({ tenantId, sku: 'SKU-SEED-002', name: 'Refrigerante Cola 2L (teste IA)', baseUnit: 'un', categoryId: sysCatId, active: true, averageCostCents: 0 })
      }

      // 3. Estoque (idempotente — se já existe, mantém)
      const existingBalA = await store.getInventoryBalance({ tenantId, branchId, productId: cervejaA.id })
      if (!existingBalA) {
        await store.upsertInventoryBalance({ tenantId, branchId, productId: cervejaA.id, quantityBase: 80 })
        await store.addInventoryMovement({
          tenantId, branchId, productId: cervejaA.id,
          movementType: 'TRANSFER_IN', quantityBase: 80,
          refType: 'TRANSFER', refId: null, reason: 'SEED', createdBy: 'dev-seed',
          unitCostCents: 0, unitRevenueCents: null,
        })
      }
      const existingBalB = await store.getInventoryBalance({ tenantId, branchId, productId: cervejaB.id })
      if (!existingBalB) {
        await store.upsertInventoryBalance({ tenantId, branchId, productId: cervejaB.id, quantityBase: 50 })
        await store.addInventoryMovement({
          tenantId, branchId, productId: cervejaB.id,
          movementType: 'TRANSFER_IN', quantityBase: 50,
          refType: 'TRANSFER', refId: null, reason: 'SEED', createdBy: 'dev-seed',
          unitCostCents: 0, unitRevenueCents: null,
        })
      }

      // 4. Order antiga (28 dias atrás — dentro da janela padrão de 30d do agente).
      // Importante: precisa ser ESTRITAMENTE menor que daysAgo(30) calculado no
      // momento da consulta. Usar 28 dias dá margem segura.
      const orders = await store.listOrders({ tenantId, branchId })
      const hasOldOrder = orders.some((o) => o.customerPhone === customerPhone && o.items.some((i) => i.productId === cervejaA.id))
      if (!hasOldOrder) {
        const twentyEightDaysAgo = new Date()
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28)
        const created = await store.createOrder({
          tenantId, branchId, channel: 'WHATSAPP',
          customerName, customerPhone,
          deliveryAddress: 'Rua das Flores, 123',
          status: 'ENTREGUE',
          subtotalCents: 5000, totalCents: 5000,
          createdBy: 'dev-seed',
          items: [{
            id: 'seed-item-1', productId: cervejaA.id,
            productName: cervejaA.name, unitCode: 'un', unitLabel: 'unidade',
            quantity: 50, quantityBase: 50, unitPriceCents: 100, totalCents: 5000,
          }],
        })
        // SECURITY (dev-only): forçar createdAt 28 dias atrás para garantir
        // que a order está dentro da janela de lookback padrão do agente.
        const backdated = await store.getOrder({ tenantId, orderId: created.id })
        if (backdated) {
          backdated.createdAt = twentyEightDaysAgo.toISOString()
          backdated.updatedAt = twentyEightDaysAgo.toISOString()
        }
      }

      logger.info('Dev seed do agente executado', { tenantId, branchId, cervejaA: cervejaA.id, cervejaB: cervejaB.id })

      res.status(200).json({
        ok: true,
        tenantId, branchId, customerPhone, customerName,
        products: {
          cervejaA: { id: cervejaA.id, name: cervejaA.name, sku: cervejaA.sku },
          cervejaB: { id: cervejaB.id, name: cervejaB.name, sku: cervejaB.sku },
        },
        estoque: { cervejaA: 80, cervejaB: 50 },
        ultimaCompraCervejaA: { quantityBase: 50, when: '30 dias atrás' },
        cenarioAlerta: 'Cerveja A: cliente pedindo 50 un, estoque tem 80 (=160% da compra anterior) -> ALERTA CRÍTICO',
      })
    }),
  )

  // Seed de pedidos para popular relatórios de vendas (idempotente)
  router.post(
    '/seed-sales-data',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      console.log('[DEBUG-RAW] seed-sales-data handler entered')
      logger.info('seed-sales-data start')
      const ctx = getCtx(req)
      logger.info('seed-sales-data ctx', { tenantId: ctx.tenantId, branchId: ctx.branchId })
      const store = await getStore()
      const tenantId = ctx.tenantId
      const branchId: string = (req.body?.branchId as string | undefined) ?? ctx.branchId ?? 'br_default'
      const daysBack = Math.min(Math.max(Number(req.body?.days) || 30, 1), 90)
      logger.info('seed-sales-data days', { daysBack })

      try {
        const products = await store.listProducts({ tenantId })
        logger.info('seed-sales-data products', { count: products.length })
        if (products.length === 0) {
          return res.status(400).json({ error: 'Nenhum produto. Rode /dev/seed-agent primeiro.' })
        }

        const customerNames = [
          'Maria Silva', 'João Santos', 'Padaria do Bairro', 'Restaurante Sabor & Arte',
          'Café da Esquina', 'Mercado Boa Vista', 'Lanchonete Express', 'Bar do Zé',
        ]
        const channels: Array<'WHATSAPP' | 'IFOOD' | 'APP' | 'BALCAO' | 'MERCADO_LIVRE'> = [
          'WHATSAPP', 'IFOOD', 'APP', 'BALCAO',
        ]

        let createdCount = 0
        for (let dayOffset = daysBack - 1; dayOffset >= 0; dayOffset--) {
          const ordersToday = 2 + Math.floor(Math.random() * 3)
          for (let o = 0; o < ordersToday; o++) {
            const product = products[Math.floor(Math.random() * products.length)]!
            const qty = 1 + Math.floor(Math.random() * 5)
            const unitCents = 500 + Math.floor(Math.random() * 5000)
            const subtotalCents = unitCents * qty
            const channel = channels[Math.floor(Math.random() * channels.length)]!
            const customerName = customerNames[Math.floor(Math.random() * customerNames.length)]!
            const customerPhone = `119${String(Math.floor(10000000 + Math.random() * 89999999))}`

            const orderDate = new Date()
            orderDate.setDate(orderDate.getDate() - dayOffset)
            orderDate.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0)

            const orderItems = [{
              id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              productId: product.id,
              productName: product.name,
              unitCode: product.baseUnit ?? 'un',
              unitLabel: product.baseUnit ?? 'un',
              quantity: qty,
              quantityBase: qty,
              unitPriceCents: unitCents,
              totalCents: subtotalCents,
            }]
            const order = await store.createOrder({
              tenantId, branchId, channel,
              customerName, customerPhone,
              deliveryAddress: null,
              status: 'ENTREGUE',
              subtotalCents, totalCents: subtotalCents,
              createdBy: 'dev-seed',
              items: orderItems,
            } as any)
            order.createdAt = orderDate.toISOString()
            order.updatedAt = orderDate.toISOString()
            createdCount++
          }
        }
        logger.info('seed-sales-data done', { created: createdCount })
        res.json({ ok: true, created: createdCount })
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
        logger.error('seed-sales-data inner failed', { err: msg, stack: innerErr instanceof Error ? innerErr.stack : undefined })
        res.status(500).json({ error: msg })
      }
    }),
  )

  return router
}

export function registerDevRoutes(app: import('express').Application): void {
  if (isProd) {
    logger.warn('Dev routes NÃO registradas em produção', { env: process.env.NODE_ENV ?? 'undefined' })
    return
  }
  app.use('/api/v1/dev', buildRouter())
}

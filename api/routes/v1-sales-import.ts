/**
 * Rotas de Importação de Vendas e Saída Avulsa.
 *
 * Endpoints:
 * - POST /api/v1/inventory/sales-import  → importa planilha de vendas (CSV/JSON)
 *   Cada linha vira um movimento SALE com unitCostCents (= CMV médio) e
 *   unitRevenueCents (= preço de venda). Não gera Order/Receivable — é um
 *   caminho alternativo para clientes sem PDV.
 * - POST /api/v1/inventory/exits         → saída avulsa (venda sem NF, perda, quebra, consumo)
 *
 * Ambos exigem role OWNER/ADMIN/STOCK/OPS.
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { requireAuth, requireRole, getCtx } from '../shared/middleware.js'
import { getStore } from '../infra/store.js'

export function registerInventoryExitRoutes(app: import('express').Application): void {
  const router = Router()

  // ============================================================
  // POST /api/v1/inventory/sales-import
  // body: {
  //   rows: Array<{
  //     sku: string
  //     quantityBase: number     // qtd na unidade-base
  //     unitPriceCents: number   // receita unitária
  //     soldAt?: string          // ISO date — default now
  //     channel?: string         // ex: 'balcao', 'planilha', 'mercadolivre'
  //     nfNumber?: string|null
  //   }>
  //   dryRun?: boolean           // só valida, não grava
  // }
  // ============================================================
  router.post(
    '/inventory/sales-import',
    requireAuth,
    requireRole(['OWNER', 'ADMIN', 'STOCK', 'OPS']),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
      const body = req.body as { rows?: Array<Record<string, unknown>>; dryRun?: boolean }
      const rows = Array.isArray(body.rows) ? body.rows : []
      if (rows.length === 0) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Nenhuma linha para importar' })
      }
      const dryRun = body.dryRun === true
      const store = await getStore()

      // Validação preliminar: produtos existem? saldos suficientes?
      const allProducts = await store.listProducts({ tenantId: ctx.tenantId })
      const skuMap = new Map(allProducts.map((p) => [p.sku.toLowerCase(), p]))
      const preview: Array<{ sku: string; status: 'ok' | 'missing_sku' | 'insufficient_stock'; available?: number; name?: string }> = []
      const valid: Array<{ productId: string; quantityBase: number; unitPriceCents: number; soldAt: string; channel: string | null; nfNumber: string | null }> = []
      const consumed = new Map<string, number>() // productId -> qtd consumida nesta importação
      for (const r of rows) {
        const sku = String(r.sku ?? '').trim()
        const qty = Number(r.quantityBase ?? r.quantity ?? 0)
        const priceCents = Math.round(Number(r.unitPriceCents ?? r.unitPrice ?? r.priceCents ?? 0))
        if (!sku || qty <= 0) {
          preview.push({ sku, status: 'missing_sku' })
          continue
        }
        const p = skuMap.get(sku.toLowerCase())
        if (!p) {
          preview.push({ sku, status: 'missing_sku' })
          continue
        }
        const bal = await store.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: p.id })
        const available = (bal?.quantityBase ?? 0) - (consumed.get(p.id) ?? 0)
        if (available < qty) {
          preview.push({ sku, status: 'insufficient_stock', available, name: p.name })
          continue
        }
        consumed.set(p.id, (consumed.get(p.id) ?? 0) + qty)
        preview.push({ sku, status: 'ok', available, name: p.name })
        valid.push({
          productId: p.id,
          quantityBase: Math.round(qty),
          unitPriceCents: priceCents,
          soldAt: String(r.soldAt ?? new Date().toISOString()),
          channel: r.channel ? String(r.channel) : 'planilha',
          nfNumber: r.nfNumber ? String(r.nfNumber) : null,
        })
      }
      if (dryRun) {
        return res.json({ dryRun: true, total: rows.length, valid: valid.length, preview })
      }
      if (valid.length === 0) {
        return res.status(400).json({ error: 'Nenhuma linha válida', preview })
      }
      // Cria um batchId para agrupar todos os movimentos deste import.
      const batchId = `sales-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      let created = 0
      for (const v of valid) {
        const cmv = (await store.getProduct({ tenantId: ctx.tenantId, productId: v.productId }))?.averageCostCents ?? 0
        const bal = await store.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: v.productId })
        const available = bal?.quantityBase ?? 0
        await store.upsertInventoryBalance({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: v.productId,
          quantityBase: available - v.quantityBase,
        })
        await store.addInventoryMovement({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: v.productId,
          movementType: 'SALE',
          quantityBase: -v.quantityBase,
          refType: 'SALES_IMPORT',
          refId: batchId,
          reason: v.nfNumber ? `Import planilha — NF ${v.nfNumber}` : `Import planilha — canal ${v.channel ?? 'planilha'}`,
          createdBy: ctx.userId,
          unitCostCents: cmv,
          unitRevenueCents: v.unitPriceCents,
        })
        created++
      }
      await store.audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'SALES_IMPORT',
        entityType: 'PRODUCT',
        entityId: batchId,
        metadata: { batchId, count: created, channel: 'planilha' },
      })
      return res.status(201).json({ batchId, created, total: rows.length, valid: valid.length, preview })
    }),
  )

  // ============================================================
  // POST /api/v1/inventory/exits
  // body: {
  //   productId: string
  //   quantityBase: number
  //   reason: 'venda_sem_nf' | 'consumo_interno' | 'perda' | 'quebra' | 'bonificacao' | 'vencimento' | 'amostragem' | string
  //   unitPriceCents?: number    // se for venda sem NF
  //   unitCostCents?: number     // opcional — para fins de auditoria
  //   notes?: string
  // }
  // ============================================================
  router.post(
    '/inventory/exits',
    requireAuth,
    requireRole(['OWNER', 'ADMIN', 'STOCK', 'OPS']),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
      const body = req.body as {
        productId?: string
        quantityBase?: number
        reason?: string
        unitPriceCents?: number
        unitCostCents?: number
        notes?: string
      }
      const productId = body.productId
      const quantity = Math.round(Number(body.quantityBase ?? 0))
      const reason = body.reason?.trim() || 'outros'
      const unitPriceCents = Number.isFinite(body.unitPriceCents) ? Math.round(body.unitPriceCents as number) : null
      const unitCostCents = Number.isFinite(body.unitCostCents) ? Math.round(body.unitCostCents as number) : null
      if (!productId || quantity <= 0) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'productId e quantityBase > 0 são obrigatórios' })
      }
      // venda_sem_nf exige unitPriceCents; perdas/quebras não
      if (reason === 'venda_sem_nf' && (unitPriceCents == null || unitPriceCents <= 0)) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Venda sem NF exige unitPriceCents > 0' })
      }
      const store = await getStore()
      const product = await store.getProduct({ tenantId: ctx.tenantId, productId })
      if (!product) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Produto não encontrado' })
      const out = await store.transaction(ctx.tenantId, async (tx) => {
        const bal = await tx.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId })
        const available = bal?.quantityBase ?? 0
        if (available < quantity) {
          throw new ApiError({ status: 409, code: 'CONFLICT', message: 'Estoque insuficiente', details: { available } })
        }
        await tx.upsertInventoryBalance({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId,
          quantityBase: available - quantity,
        })
        // Para saída avulsa com venda: é SALE (afeta relatórios de venda/CMV).
        // Para perdas/quebras/etc: é ADJUSTMENT negativo (não conta como venda).
        const isSale = reason === 'venda_sem_nf'
        const mov = await tx.addInventoryMovement({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId,
          movementType: isSale ? 'SALE' : 'ADJUSTMENT',
          quantityBase: -quantity,
          refType: 'MANUAL',
          refId: null,
          reason: `${reason}${body.notes ? ' — ' + body.notes : ''}`,
          createdBy: ctx.userId,
          unitCostCents: unitCostCents ?? product.averageCostCents,
          unitRevenueCents: isSale ? unitPriceCents : null,
        })
        await tx.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'INVENTORY_EXIT',
          entityType: 'PRODUCT',
          entityId: productId,
          metadata: { reason, quantity, unitPriceCents, unitCostCents, notes: body.notes ?? null },
        })
        return { movement: mov, balance: { productId, quantityBase: available - quantity } }
      })
      res.status(201).json(out)
    }),
  )

  // ============================================================
  // POST /api/v1/inventory/exits/batch
  // body: {
  //   reason: ExitReason
  //   notes?: string
  //   lines: Array<{
  //     productId: string
  //     quantityBase: number
  //     unitPriceCents?: number  // se venda_sem_nf
  //     unitCostCents?: number
  //   }>
  // }
  //
  // Atômico: ou grava todas as linhas, ou nenhuma. Valida saldo total por produto
  // (somando todas as linhas do batch) antes de aplicar. Retorna lista de movimentos
  // criados + saldos novos.
  // ============================================================
  router.post(
    '/inventory/exits/batch',
    requireAuth,
    requireRole(['OWNER', 'ADMIN', 'STOCK', 'OPS']),
    asyncHandler(async (req: Request, res: Response) => {
      const ctx = getCtx(req)
      if (!ctx.branchId) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Branch não selecionada' })
      const body = req.body as {
        reason?: string
        notes?: string
        lines?: Array<{ productId?: string; quantityBase?: number; unitPriceCents?: number; unitCostCents?: number }>
      }
      const reason = body.reason?.trim() || 'outros'
      const rawLines = Array.isArray(body.lines) ? body.lines : []
      if (rawLines.length === 0) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Inclua ao menos uma linha' })
      }
      const isSale = reason === 'venda_sem_nf'
      const store = await getStore()
      // 1) valida + normaliza linhas
      const normalized: Array<{ productId: string; quantityBase: number; unitPriceCents: number | null; unitCostCents: number | null; product: Awaited<ReturnType<typeof store.getProduct>> }> = []
      for (const r of rawLines) {
        const productId = r.productId
        const qty = Math.round(Number(r.quantityBase ?? 0))
        if (!productId || qty <= 0) continue
        const product = await store.getProduct({ tenantId: ctx.tenantId, productId })
        if (!product) {
          throw new ApiError({ status: 404, code: 'NOT_FOUND', message: `Produto ${productId} não encontrado` })
        }
        if (isSale) {
          const up = Math.round(Number(r.unitPriceCents ?? 0))
          if (!Number.isFinite(up) || up <= 0) {
            throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: `Preço de venda obrigatório para "${product.name}"` })
          }
          normalized.push({ productId, quantityBase: qty, unitPriceCents: up, unitCostCents: Number.isFinite(r.unitCostCents) ? Math.round(r.unitCostCents as number) : product.averageCostCents, product })
        } else {
          normalized.push({ productId, quantityBase: qty, unitPriceCents: null, unitCostCents: Number.isFinite(r.unitCostCents) ? Math.round(r.unitCostCents as number) : product.averageCostCents, product })
        }
      }
      if (normalized.length === 0) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Nenhuma linha válida' })
      }
      // 2) transação atômica
      const result = await store.transaction(ctx.tenantId, async (tx) => {
        // soma consumo por produto e valida saldo
        const consumption = new Map<string, number>()
        for (const n of normalized) {
          consumption.set(n.productId, (consumption.get(n.productId) ?? 0) + n.quantityBase)
        }
        for (const [pid, qty] of consumption) {
          const bal = await tx.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: pid })
          const available = bal?.quantityBase ?? 0
          if (available < qty) {
            const p = normalized.find((n) => n.productId === pid)?.product
            throw new ApiError({
              status: 409,
              code: 'CONFLICT',
              message: `Estoque insuficiente para "${p?.name ?? pid}"`,
              details: { available, requested: qty },
            })
          }
        }
        // aplica
        const created: Array<{ movement: Awaited<ReturnType<typeof tx.addInventoryMovement>>; balance: { productId: string; quantityBase: number } }> = []
        for (const n of normalized) {
          const bal = await tx.getInventoryBalance({ tenantId: ctx.tenantId, branchId: ctx.branchId, productId: n.productId })
          const available = bal?.quantityBase ?? 0
          await tx.upsertInventoryBalance({
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            productId: n.productId,
            quantityBase: available - n.quantityBase,
          })
          const mov = await tx.addInventoryMovement({
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            productId: n.productId,
            movementType: isSale ? 'SALE' : 'ADJUSTMENT',
            quantityBase: -n.quantityBase,
            refType: 'MANUAL',
            refId: null,
            reason: body.notes ? `${reason} — ${body.notes}` : reason,
            createdBy: ctx.userId,
            unitCostCents: n.unitCostCents,
            unitRevenueCents: n.unitPriceCents,
          })
          created.push({ movement: mov, balance: { productId: n.productId, quantityBase: available - n.quantityBase } })
        }
        await tx.audit({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'INVENTORY_EXIT_BATCH',
          entityType: 'PRODUCT',
          entityId: `batch-${Date.now()}`,
          metadata: { reason, notes: body.notes ?? null, lines: normalized.length, totalQty: normalized.reduce((a, n) => a + n.quantityBase, 0) },
        })
        return created
      })
      const totalRevenue = result.reduce((acc, r) => acc + (r.movement.unitRevenueCents ?? 0) * Math.abs(r.movement.quantityBase), 0)
      res.status(201).json({ created: result, count: result.length, totalRevenueCents: totalRevenue })
    }),
  )

  app.use('/api/v1', router)
}
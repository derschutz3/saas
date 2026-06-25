'use client'

/**
 * Cliente HTTP para import de vendas e saída avulsa.
 *
 * Endpoints:
 *   POST /api/v1/inventory/sales-import  — body: { rows, dryRun? }
 *   POST /api/v1/inventory/exits         — body: { productId, quantityBase, reason, ... }
 *
 * Para o caso "cliente sem PDV", permite registrar vendas importadas de planilha
 * e saídas manuais (perdas, quebras, consumo) que viram movimentos SALE ou
 * ADJUSTMENT no estoque, alimentando relatórios de CMV e prejuízo.
 */

export type SalesImportRow = {
  sku: string
  quantityBase: number
  unitPriceCents: number
  soldAt?: string
  channel?: string
  nfNumber?: string | null
}

export type SalesImportPreview = {
  sku: string
  status: 'ok' | 'missing_sku' | 'insufficient_stock'
  available?: number
  name?: string
}

export type SalesImportResult = {
  dryRun?: boolean
  total: number
  valid: number
  batchId?: string
  created?: number
  preview: SalesImportPreview[]
}

export async function salesImport(rows: SalesImportRow[], dryRun = false): Promise<SalesImportResult> {
  const res = await fetch('/api/v1/inventory/sales-import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, dryRun }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`sales-import falhou (${res.status}): ${text}`)
  }
  return res.json() as Promise<SalesImportResult>
}

export type ExitReason =
  | 'venda_sem_nf'
  | 'consumo_interno'
  | 'perda'
  | 'quebra'
  | 'bonificacao'
  | 'vencimento'
  | 'amostragem'
  | 'outros'

export type ExitResult = {
  movement: {
    id: string
    productId: string
    quantityBase: number
    movementType: 'SALE' | 'ADJUSTMENT'
    reason: string
    unitCostCents: number | null
    unitRevenueCents: number | null
    createdAt: string
  }
  balance: { productId: string; quantityBase: number }
}

export async function inventoryExit(params: {
  productId: string
  quantityBase: number
  reason: ExitReason
  unitPriceCents?: number
  unitCostCents?: number
  notes?: string
}): Promise<ExitResult> {
  const res = await fetch('/api/v1/inventory/exits', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`exit falhou (${res.status}): ${text}`)
  }
  return res.json() as Promise<ExitResult>
}

export type ExitBatchLine = {
  productId: string
  quantityBase: number
  unitPriceCents?: number
  unitCostCents?: number
}

export type ExitBatchResult = {
  count: number
  totalRevenueCents: number
  created: Array<{
    movement: {
      id: string
      productId: string
      quantityBase: number
      movementType: 'SALE' | 'ADJUSTMENT'
      reason: string
      unitCostCents: number | null
      unitRevenueCents: number | null
      createdAt: string
    }
    balance: { productId: string; quantityBase: number }
  }>
}

/**
 * Registra várias saídas com o mesmo motivo numa transação atômica.
 *
 * Útil para venda de múltiplos produtos no balcão (venda_sem_nf) — calcula
 * a receita total automaticamente e gera 1 movimento por produto.
 *
 * Se qualquer linha tiver saldo insuficiente, nenhuma linha é gravada (rollback).
 */
export async function inventoryExitBatch(params: {
  reason: ExitReason
  notes?: string
  lines: ExitBatchLine[]
}): Promise<ExitBatchResult> {
  const res = await fetch('/api/v1/inventory/exits/batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`exit-batch falhou (${res.status}): ${text}`)
  }
  return res.json() as Promise<ExitBatchResult>
}
/**
 * Seed para testar o agente de IA
 * Cria:
 *  - cliente "Bar do Zé" com telefone
 *  - 2 produtos (Cerveja A e Cerveja B)
 *  - Estoque inicial: 100 Cerveja A, 50 Cerveja B
 *  - Order de 30 dias atrás: Bar do Zé comprou 50 Cerveja A
 *  - Order 15 dias atrás: vendeu 20 Cerveja A (reduziu estoque para 80)
 *  - Estoque atual: 80 Cerveja A (60% da compra anterior = 30, mas 80 > 30 → ALERTA)
 *
 * Para simular:
 *  - GET /api/v1/agent/insights → Cerveja A deve aparecer como HIGH ou OVERSTOCK
 *  - GET /api/v1/agent/customers/<phone>/recurring → Cerveja A
 *  - POST /api/v1/agent/orders/check-alert com items de 50 un → ALERTA
 */
import { store } from './infra/store.js'
import { logger } from './shared/logger.js'

const tenantId = process.env.SEED_TENANT_ID ?? 'tnt_default'
const branchId = process.env.SEED_BRANCH_ID ?? 'br_default'
const customerPhone = process.env.SEED_CUSTOMER_PHONE ?? '11999887766'
const customerName = 'Bar do Zé Ltda'

async function findOrCreateCustomer(): Promise<string> {
  const found = await store.findCustomerByPhone({ tenantId, phone: customerPhone })
  if (found) return found.id
  const c = await store.createCustomer({
    tenantId, name: customerName, phone: customerPhone, whatsapp: customerPhone,
    tradeName: null, taxId: null, email: null,
    address: 'Rua das Flores, 123', city: null, state: null, zip: null,
    tags: [], lifecycle: 'lead', notes: null, creditLimitCents: null,
  })
  return c.id
}

async function findOrCreateProduct(sku: string, name: string): Promise<string> {
  const products = await store.listProducts({ tenantId })
  const existing = products.find((p) => p.sku === sku)
  if (existing) return existing.id
  const sysCatId = await store.getSystemCategoryId({ tenantId })
  const p = await store.createProduct({ tenantId, sku, name, baseUnit: 'un', categoryId: sysCatId, active: true, averageCostCents: 0 })
  return p.id
}

async function ensureStock(productId: string, qty: number): Promise<void> {
  const bal = await store.getInventoryBalance({ tenantId, branchId, productId })
  if (!bal) {
    await store.upsertInventoryBalance({ tenantId, branchId, productId, quantityBase: qty })
    await store.addInventoryMovement({
      tenantId,
      branchId,
      productId,
      movementType: 'TRANSFER_IN',
      quantityBase: qty,
      refType: 'TRANSFER',
      refId: null,
      reason: 'SEED',
      createdBy: 'seed-script',
      unitCostCents: 0,
      unitRevenueCents: null,
    })
  }
}

async function main(): Promise<void> {
  logger.info('SEED: iniciando', { tenantId, branchId, customerPhone })

  // 1. Cliente
  const customerId = await findOrCreateCustomer()
  logger.info('Cliente pronto', { customerId, customerName })

  // 2. Produtos
  const cervejaAId = await findOrCreateProduct('SKU-SEED-001', 'Cerveja Pilsen 350ml (teste IA)')
  const cervejaBId = await findOrCreateProduct('SKU-SEED-002', 'Refrigerante Cola 2L (teste IA)')
  logger.info('Produtos prontos', { cervejaAId, cervejaBId })

  // 3. Estoque inicial (Cerveja A: 80, Cerveja B: 50)
  await ensureStock(cervejaAId, 80)
  await ensureStock(cervejaBId, 50)

  // 4. Cria order de 30 dias atrás com 50 un de Cerveja A (última compra)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const oldOrder = await store.createOrder({
    tenantId,
    branchId,
    channel: 'WHATSAPP',
    customerName,
    customerPhone,
    deliveryAddress: 'Rua das Flores, 123',
    status: 'ENTREGUE',
    subtotalCents: 5000,
    totalCents: 5000,
    createdBy: 'seed-script',
    items: [
      {
        id: 'seed-item-1',
        productId: cervejaAId,
        productName: 'Cerveja Pilsen 350ml (teste IA)',
        unitCode: 'un',
        unitLabel: 'unidade',
        quantity: 50,
        quantityBase: 50,
        unitPriceCents: 100,
        totalCents: 5000,
      },
    ],
  } as Parameters<typeof store.createOrder>[0])
  logger.info('Order antiga criada', { orderId: oldOrder.id, when: thirtyDaysAgo.toISOString() })

  // 5. Resumo
  const summary = {
    tenantId,
    branchId,
    customerPhone,
    customerName,
    products: { cervejaAId, cervejaBId },
    estoqueAtual: { cervejaA: 80, cervejaB: 50 },
    ultimaCompraCervejaA: { quantityBase: 50, when: thirtyDaysAgo.toISOString() },
    cenarioAlerta: 'Cerveja A: cliente pedindo 50 un, estoque tem 80 (=160% da compra anterior) → ALERTA CRÍTICO',
  }
  console.log('SEED OK:')
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SEED FALHOU:', err)
    process.exit(1)
  })

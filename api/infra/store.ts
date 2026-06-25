import crypto from 'crypto'
import { hashPassword } from '../shared/security.js'
import { getPool } from './db.js'
import { PostgresStore } from './postgresStore.js'
import type { IntegrationCredentials, IntegrationProvider } from '../integrations/types.js'
import type { BusinessType, ModuleId } from '../../apps/erp-web/types/modules.js'

export type Role = 'OWNER' | 'ADMIN' | 'OPS' | 'STOCK' | 'FINANCE' | 'FISCAL' | 'DELIVERY'
export type OrderChannel = 'BALCAO' | 'WHATSAPP' | 'CATALOGO' | 'DELIVERY'
export type OrderStatus =
  | 'RECEBIDO'
  | 'CONFIRMADO'
  | 'EM_SEPARACAO'
  | 'SEPARADO'
  | 'SAIU_PARA_ENTREGA'
  | 'ENTREGUE'
  | 'CANCELADO'

export type Tenant = {
  id: string
  name: string
  businessType: BusinessType
  enabledModules: ModuleId[]
  legalName: string | null
  tradeName: string | null
  taxId: string | null
  createdAt: string
}
export type Branch = { id: string; tenantId: string; name: string }
export type User = {
  id: string
  tenantId: string
  branchId: string | null
  name: string
  email: string
  role: Role
  passwordSalt: string
  passwordHash: string
  active: boolean
  /**
   * Override por usuário dos módulos permitidos.
   * - undefined / null: herda dos módulos do tenant
   * - [] explícito: bloqueia tudo (sem módulos)
   * - lista explícita: restringe aos módulos listados
   */
  enabledModules: string[] | null
}

/** Linha crua da tabela user_module_permissions. */
export type UserModulePermission = {
  userId: string
  tenantId: string
  moduleId: string
}

export type Customer = {
  id: string
  tenantId: string
  name: string
  tradeName: string | null
  taxId: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  tags: string[]
  lifecycle: 'lead' | 'active' | 'inactive' | 'churned'
  notes: string | null
  creditLimitCents: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CashMovementType = 'sale' | 'withdrawal' | 'supply' | 'tip' | 'adjustment'

export type CashSession = {
  id: string
  tenantId: string
  registerName: string
  operatorName: string
  openingCents: number
  closingCents: number | null
  expectedCents: number
  differenceCents: number | null
  status: 'open' | 'closed'
  notes: string | null
  openedAt: string
  closedAt: string | null
}

export type CashMovement = {
  id: string
  tenantId: string
  sessionId: string
  type: CashMovementType
  amountCents: number // positivo=entrada, negativo=saída
  reason: string | null
  orderId: string | null
  createdAt: string
  createdBy: string | null
}

/**
 * Fornecedor.
 *
 * - `document`: CNPJ/CPF (com pontuação opcional).
 * - `paymentTerms`: texto livre ("30/60/90 DDL", "à vista", etc.).
 * - `leadTimeDays`: prazo médio de entrega em dias (usado pelo agente IA).
 * - `active=false` arquiva o fornecedor, mas preserva histórico de compras.
 */
export type Supplier = {
  id: string
  tenantId: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  contactName: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  paymentTerms: string | null
  leadTimeDays: number | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type Product = {
  id: string
  tenantId: string
  sku: string
  name: string
  baseUnit: string
  categoryId: string | null
  active: boolean
  averageCostCents: number
  createdAt: string
}

/**
 * Pedido de compra (Purchase Order).
 *
 * Status: DRAFT → SENT → CONFIRMED → RECEIVED | CANCELED.
 *
 * - `items[].productName`/`sku` são snapshots no momento da criação (defesa contra
 *   renomeação/exclusão do produto no catálogo).
 * - `totalCents` é recomputado no servidor a partir dos items.
 * - `receivedAt`/`receivedBy` preenchidos quando o pedido vira RECEIVED.
 */
export type PurchaseOrderItem = {
  productId: string
  productName: string
  sku: string
  unitCode: string
  quantity: number
  unitCostCents: number
  totalCents: number
}

export type PurchaseOrder = {
  id: string
  tenantId: string
  supplierId: string
  supplierName: string // snapshot
  status: 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELED'
  items: PurchaseOrderItem[]
  totalCents: number
  expectedDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  receivedAt: string | null
  receivedBy: string | null
  createdBy: string
}

/**
 * Categoria de produto (estoque).
 *
 * - `isSystem=true` indica categoria padrão gerada pelo sistema ("Sem categoria"),
 *   não pode ser renomeada, arquivada nem excluída pelo usuário.
 * - Soft delete via `archivedAt` (preserva integridade referencial).
 */
export type Category = {
  id: string
  tenantId: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  position: number
  isSystem: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Unit = {
  tenantId: string
  code: string
  label: string
  createdAt: string
}

export type UnitConversion = {
  tenantId: string
  productId: string
  unitCode: string
  factorToBase: number
}

export type Price = {
  tenantId: string
  productId: string
  channel: OrderChannel
  unitCode: string
  priceCents: number
}

export type SaleUnit = {
  unitCode: string
  label: string
  factorToBase: number
  prices: Record<OrderChannel, number>
}

export type InventoryBalance = {
  tenantId: string
  branchId: string
  productId: string
  quantityBase: number
  updatedAt: string
}

export type InventoryMovement = {
  id: string
  tenantId: string
  branchId: string
  productId: string
  movementType: 'SALE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  quantityBase: number
  // Custo unitário congelado no momento do movimento (em centavos).
  // - Em ENTRADAS (TRANSFER_IN/ADJUSTMENT+): é o custo de aquisição.
  // - Em SAÍDAS (SALE): é o custo médio vigente (CMV) — gravado para auditoria.
  // Null em transferências puras sem custo conhecido.
  unitCostCents: number | null
  // Receita unitária (em centavos) — preenchido em saídas com venda (SALE).
  // Null em perdas/quebras/ajustes sem receita.
  unitRevenueCents: number | null
  refType: 'ORDER' | 'ADJUSTMENT' | 'TRANSFER' | 'SALES_IMPORT' | 'NFE' | 'MANUAL' | 'INTEGRATION' | 'CANCEL' | null
  refId: string | null
  reason: string | null
  createdAt: string
  createdBy: string
}

export type OrderItem = {
  id: string
  productId: string
  productName: string
  unitCode: string
  unitLabel: string
  quantity: number
  quantityBase: number
  unitPriceCents: number
  totalCents: number
}

export type Order = {
  id: string
  tenantId: string
  branchId: string
  channel: OrderChannel
  customerName: string | null
  customerPhone: string | null
  deliveryAddress: string | null
  status: OrderStatus
  subtotalCents: number
  totalCents: number
  createdAt: string
  updatedAt: string
  createdBy: string
  items: OrderItem[]
}

export type AccountReceivable = {
  id: string
  tenantId: string
  branchId: string
  orderId: string
  amountCents: number
  status: 'OPEN' | 'SETTLED' | 'CANCELLED'
  dueDate: string
  createdAt: string
  settledAt: string | null
}

export type FiscalDocument = {
  id: string
  tenantId: string
  branchId: string
  orderId: string
  docType: 'NFE' | 'NFCE'
  status: 'PENDING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELED' | 'DENIED'
  /** Número da NF (sequencial). Atribuído quando a NF é autorizada. */
  numero: string | null
  /** Série da NF. */
  serie: string | null
  /** Chave de acesso (44 dígitos). */
  accessKey: string | null
  /** Protocolo de autorização. */
  protocol: string | null
  /** Data/hora da autorização. */
  authorizedAt: string | null
  /** URL do XML (em produção, retornado pelo provedor). */
  xmlUrl: string | null
  /** URL do PDF/DANFE. */
  pdfUrl: string | null
  /** Mensagem de erro retornada pela SEFAZ. */
  errorMessage: string | null
  /** Valor total da NF. */
  totalCents: number | null
  createdAt: string
  updatedAt: string
}

export type AuditEvent = {
  id: string
  tenantId: string
  userId: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  metadata: Record<string, unknown>
  /**
   * LGPD Art. 16: prazo de retenção. Definido por tipo de evento:
   *  - 5 anos: eventos financeiros/fiscais (obrigação legal)
   *  - 1 ano: autenticação e criação/alteração de usuário
   *  - 2 anos: demais eventos (necessidade)
   * Após esta data, o evento pode ser purgado pelo job de manutenção.
   */
  expiresAt: string
}

/**
 * SECURITY (LGPD Art. 16): define expires_at conforme a natureza do evento.
 * Espelha a função SQL `audit_events_set_expires_at()` em 0006_audit_retention.sql.
 */
function computeExpiresAt(action: string, createdAt: Date): Date {
  const FINANCIAL = new Set([
    'ORDER_PAID', 'ORDER_CANCELLED',
    'CASH_SESSION_OPENED', 'CASH_SESSION_CLOSED', 'CASH_MOVEMENT',
    'FISCAL_DOC_ISSUED', 'FISCAL_DOC_CANCELLED',
    'PURCHASE_ORDER_CREATED', 'PURCHASE_ORDER_RECEIVED',
    'ACCOUNT_RECEIVABLE_CREATED', 'ACCOUNT_RECEIVABLE_PAID',
    'INTEGRATION_CREDENTIAL_ROTATED',
  ])
  const AUTH = new Set([
    'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_TOKEN_REFRESH',
    'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  ])
  const expires = new Date(createdAt)
  if (FINANCIAL.has(action)) {
    expires.setFullYear(expires.getFullYear() + 5)
  } else if (AUTH.has(action) || action.startsWith('AUTH_')) {
    expires.setFullYear(expires.getFullYear() + 1)
  } else {
    expires.setFullYear(expires.getFullYear() + 2)
  }
  return expires
}

type StoreState = {
  tenants: Tenant[]
  branches: Branch[]
  users: User[]
  // Override por usuário dos módulos permitidos (FK para users).
  // Vazio = herda do tenant.
  userModulePermissions: UserModulePermission[]
  customers: Customer[]
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  cashSessions: CashSession[]
  cashMovements: CashMovement[]
  products: Product[]
  categories: Category[]
  units: Unit[]
  unitConversions: UnitConversion[]
  prices: Price[]
  orders: Order[]
  inventoryBalances: InventoryBalance[]
  inventoryMovements: InventoryMovement[]
  accountsReceivable: AccountReceivable[]
  fiscalDocuments: FiscalDocument[]
  auditEvents: AuditEvent[]
  integrations: IntegrationCredentials[]
}

/** Constante — ID determinístico para a categoria "Sem categoria" (per-tenant). */
const SYSTEM_CATEGORY_SLUG = '__system_uncategorized__'

export type Store = {
  transaction<T>(tenantId: string, fn: (tx: Store) => Promise<T>): Promise<T>
  getDefaultTenantId(): Promise<string | null>

  audit(event: Omit<AuditEvent, 'id' | 'createdAt' | 'expiresAt'>): Promise<void>
  listAuditEvents(params: { tenantId: string; entityType?: string; entityId?: string }): Promise<AuditEvent[]>
  /** LGPD Art. 16: purge de audit_events vencidos. Idempotente. */
  purgeExpiredAuditEvents(): Promise<{ deletedCount: number; cutoff: string }>

  listPendingFiscalDocuments(params: { tenantId: string }): Promise<FiscalDocument[]>

  findUserByEmail(params: { tenantId: string; email: string }): Promise<User | undefined>
  getUser(params: { tenantId: string; userId: string }): Promise<User | undefined>

  // ===== Customers =====
  listCustomers(params: { tenantId: string; query?: string; includeArchived?: boolean; lifecycle?: 'lead' | 'active' | 'inactive' | 'churned'; tag?: string }): Promise<Customer[]>
  getCustomer(params: { tenantId: string; customerId: string }): Promise<Customer | null>
  findCustomerByPhone(params: { tenantId: string; phone: string }): Promise<Customer | null>
  createCustomer(params: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'active'>): Promise<Customer>
  updateCustomer(params: { tenantId: string; customerId: string; patch: Partial<Omit<Customer, 'id' | 'tenantId' | 'createdAt'>> }): Promise<Customer | null>
  archiveCustomer(params: { tenantId: string; customerId: string }): Promise<Customer | null>
  restoreCustomer(params: { tenantId: string; customerId: string }): Promise<Customer | null>
  deleteCustomer(params: { tenantId: string; customerId: string }): Promise<{ deletedId: string }>
  /** LGPD Art. 18, VI: anonimiza dados do customer preservando integridade referencial. */
  anonymizeCustomer(params: { tenantId: string; customerId: string }): Promise<void>

  // ===== Suppliers =====
  listSuppliers(params: { tenantId: string; query?: string; includeArchived?: boolean }): Promise<Supplier[]>
  getSupplier(params: { tenantId: string; supplierId: string }): Promise<Supplier | null>
  createSupplier(params: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<Supplier>
  updateSupplier(params: { tenantId: string; supplierId: string; patch: Partial<Omit<Supplier, 'id' | 'tenantId' | 'createdAt'>> }): Promise<Supplier | null>
  archiveSupplier(params: { tenantId: string; supplierId: string }): Promise<Supplier | null>
  restoreSupplier(params: { tenantId: string; supplierId: string }): Promise<Supplier | null>
  deleteSupplier(params: { tenantId: string; supplierId: string }): Promise<{ deletedId: string }>

  // ===== Purchase Orders (Compras) =====
  listPurchaseOrders(params: { tenantId: string; status?: 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELED' | 'all'; supplierId?: string }): Promise<PurchaseOrder[]>
  getPurchaseOrder(params: { tenantId: string; orderId: string }): Promise<PurchaseOrder | null>
  createPurchaseOrder(params: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'totalCents' | 'receivedAt' | 'receivedBy' | 'supplierName'> & { items: Array<Omit<PurchaseOrderItem, 'productName' | 'sku' | 'totalCents'>> }): Promise<PurchaseOrder>
  updatePurchaseOrderStatus(params: { tenantId: string; orderId: string; status: PurchaseOrder['status']; expectedDate?: string | null; notes?: string | null; receivedBy?: string | null }): Promise<PurchaseOrder | null>
  deletePurchaseOrder(params: { tenantId: string; orderId: string }): Promise<{ deletedId: string }>
  receivePurchaseOrder(params: { tenantId: string; orderId: string; branchId: string; receivedBy: string }): Promise<{ order: PurchaseOrder; movementsCreated: number }>

  // ===== Cash Register =====
  listCashSessions(params: { tenantId: string; status?: 'open' | 'closed' | 'all' }): Promise<CashSession[]>
  getOpenCashSession(params: { tenantId: string }): Promise<CashSession | null>
  getCashSession(params: { tenantId: string; sessionId: string }): Promise<CashSession | null>
  openCashSession(params: Omit<CashSession, 'id' | 'openedAt' | 'closedAt' | 'status' | 'closingCents' | 'differenceCents' | 'expectedCents'>): Promise<CashSession>
  closeCashSession(params: { tenantId: string; sessionId: string; closingCents: number; notes?: string | null }): Promise<CashSession | null>
  listCashMovements(params: { tenantId: string; sessionId?: string }): Promise<CashMovement[]>
  addCashMovement(params: Omit<CashMovement, 'id' | 'createdAt'>): Promise<CashMovement>
  computeCashExpectedCents(params: { tenantId: string; sessionId: string }): Promise<number>

  listProducts(params: { tenantId: string; query?: string; categoryId?: string | null; includeArchived?: boolean }): Promise<Product[]>
  // Versão paginada para o endpoint HTTP — retorna { items, total }.
  listProductsPaged(params: { tenantId: string; query?: string; categoryId?: string | null; includeArchived?: boolean; limit: number; offset: number }): Promise<{ items: Product[]; total: number; limit: number; offset: number }>
  listUnits(params: { tenantId: string }): Promise<Unit[]>
  getSaleUnits(params: { tenantId: string; productId: string }): Promise<SaleUnit[]>
  /** Retorna Map<productId, SaleUnit[]> num único scan — substitui N+1 do /products. */
  getSaleUnitsBatch(params: { tenantId: string; productIds: string[] }): Promise<Map<string, SaleUnit[]>>
  getPrice(params: { tenantId: string; productId: string; channel: OrderChannel; unitCode: string }): Promise<number | null>
  upsertPrice(params: { tenantId: string; productId: string; unitCode: string; channel: OrderChannel; priceCents: number }): Promise<void>
  getUnit(params: { tenantId: string; code: string }): Promise<Unit | null>
  createUnit(params: { tenantId: string; code: string; label: string }): Promise<Unit>
  upsertUnitConversion(params: { tenantId: string; productId: string; unitCode: string; factorToBase: number }): Promise<void>
  createProduct(params: Omit<Product, 'id' | 'createdAt'>): Promise<Product>
  updateProduct(params: { tenantId: string; productId: string; patch: Partial<Pick<Product, 'name' | 'baseUnit' | 'categoryId' | 'active' | 'sku' | 'averageCostCents'>> }): Promise<Product | null>
  getProduct(params: { tenantId: string; productId: string }): Promise<Product | undefined>
  countProductsByCategory(params: { tenantId: string; categoryId: string | null }): Promise<number>

  // ===== Categorias =====
  listCategories(params: { tenantId: string; includeArchived?: boolean }): Promise<Category[]>
  getCategory(params: { tenantId: string; categoryId: string }): Promise<Category | null>
  getSystemCategoryId(params: { tenantId: string }): Promise<string | null>
  createCategory(params: { tenantId: string; name: string; description?: string | null; color?: string | null; icon?: string | null; createdBy: string }): Promise<Category>
  updateCategory(params: { tenantId: string; categoryId: string; patch: Partial<Pick<Category, 'name' | 'description' | 'color' | 'icon' | 'position'>>; updatedBy: string }): Promise<Category | null>
  archiveCategory(params: { tenantId: string; categoryId: string; updatedBy: string }): Promise<Category | null>
  restoreCategory(params: { tenantId: string; categoryId: string; updatedBy: string }): Promise<Category | null>
  deleteCategory(params: { tenantId: string; categoryId: string; fallbackCategoryId: string | null; updatedBy: string }): Promise<{ deletedId: string; movedItems: number }>
  reorderCategories(params: { tenantId: string; orderedIds: string[]; updatedBy: string }): Promise<Category[]>
  bulkMoveProducts(params: { tenantId: string; productIds: string[]; targetCategoryId: string | null; updatedBy: string }): Promise<number>

  getInventoryBalance(params: { tenantId: string; branchId: string; productId: string }): Promise<InventoryBalance | null>
  upsertInventoryBalance(params: { tenantId: string; branchId: string; productId: string; quantityBase: number }): Promise<InventoryBalance>
  addInventoryMovement(m: Omit<InventoryMovement, 'id' | 'createdAt'>): Promise<InventoryMovement>
  listInventoryMovements(params: { tenantId: string; branchId: string; productId?: string; from?: string; to?: string }): Promise<InventoryMovement[]>
  // Versão paginada para o endpoint HTTP — retorna { items, total }.
  listInventoryMovementsPaged(params: { tenantId: string; branchId: string; productId?: string; type?: string; from?: string; to?: string; limit: number; offset: number }): Promise<{ items: InventoryMovement[]; total: number; limit: number; offset: number }>
  listInventoryBalances(params: { tenantId: string; branchId: string; productIds?: string[] }): Promise<Array<{ productId: string; quantityBase: number }>>

  // Recalcula e persiste o custo médio ponderado do produto após uma entrada.
  // Fórmula: cmv_novo = (saldo_qty * cmv_atual + entrada_qty * custo_entrada) / (saldo_qty + entrada_qty)
  updateProductAverageCost(params: { tenantId: string; productId: string; quantityIn: number; unitCostInCents: number }): Promise<{ averageCostCents: number }>

  createOrder(o: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>
  getOrder(params: { tenantId: string; orderId: string }): Promise<Order | null>
  updateOrderStatus(params: { tenantId: string; orderId: string; status: OrderStatus }): Promise<Order | null>
  listOrders(params: { tenantId: string; branchId: string; status?: OrderStatus; channel?: OrderChannel }): Promise<Order[]>
  listAllOrdersForTenant(params: { tenantId: string; status?: OrderStatus; channel?: OrderChannel; limit?: number }): Promise<Order[]>

  createReceivable(params: Omit<AccountReceivable, 'id' | 'createdAt' | 'settledAt'>): Promise<AccountReceivable>
  listReceivables(params: { tenantId: string; branchId: string; status?: AccountReceivable['status'] }): Promise<AccountReceivable[]>
  settleReceivable(params: { tenantId: string; receivableId: string }): Promise<AccountReceivable | null>

  createFiscalDocument(params: Omit<FiscalDocument, 'id' | 'createdAt' | 'updatedAt' | 'numero' | 'serie' | 'accessKey' | 'protocol' | 'authorizedAt' | 'xmlUrl' | 'pdfUrl'> & Partial<Pick<FiscalDocument, 'numero' | 'serie' | 'accessKey' | 'protocol' | 'authorizedAt' | 'xmlUrl' | 'pdfUrl' | 'totalCents'>>): Promise<FiscalDocument>
  getFiscalDocument(params: { tenantId: string; fiscalDocumentId: string }): Promise<FiscalDocument | null>
  listFiscalDocuments(params: { tenantId: string; branchId?: string; status?: FiscalDocument['status']; orderId?: string }): Promise<FiscalDocument[]>
  updateFiscalDocument(params: { tenantId: string; fiscalDocumentId: string; patch: Partial<Omit<FiscalDocument, 'id' | 'tenantId' | 'createdAt'>> }): Promise<FiscalDocument | null>
  simulateFiscalAuthorization(params: { tenantId: string; fiscalDocumentId: string; approved?: boolean; errorMessage?: string | null }): Promise<FiscalDocument | null>
  cancelFiscalDocument(params: { tenantId: string; fiscalDocumentId: string; reason: string; canceledBy: string }): Promise<FiscalDocument | null>

  getIntegrations(tenantId: string): IntegrationCredentials[]
  saveIntegration(credentials: IntegrationCredentials): boolean
  updateIntegration(tenantId: string, provider: IntegrationProvider, credentials: Partial<IntegrationCredentials>): boolean
  deleteIntegration(tenantId: string, provider: IntegrationProvider): boolean

  getTenant(tenantId: string): Promise<Tenant | null>
  updateTenant(tenantId: string, patch: Partial<Tenant>): Promise<Tenant | null>
  setTenantModules(tenantId: string, modules: ModuleId[]): Promise<Tenant | null>

  // ===== Settings: Users =====
  listUsers(params: { tenantId: string; includeInactive?: boolean }): Promise<User[]>
  getUserById(params: { tenantId: string; userId: string }): Promise<User | null>
  createUser(params: Omit<User, 'id'>): Promise<User>
  updateUser(params: { tenantId: string; userId: string; patch: Partial<Omit<User, 'id' | 'tenantId'>> }): Promise<User | null>
  deleteUser(params: { tenantId: string; userId: string }): Promise<{ deletedId: string }>
  /** Lista overrides de módulos do usuário (sem resolver herança do tenant). */
  listUserModulePermissions(params: { tenantId: string; userId: string }): Promise<string[]>
  /** Resolve módulos efetivos — 'tenant' significa herdar do tenant, lista = override. */
  resolveUserEnabledModules(params: { tenantId: string; userId: string }): Promise<string[] | 'tenant'>

  // ===== Settings: Branches =====
  listBranches(params: { tenantId: string }): Promise<Branch[]>
  createBranch(params: { tenantId: string; name: string }): Promise<Branch>
  updateBranch(params: { tenantId: string; branchId: string; patch: { name?: string } }): Promise<Branch | null>
  deleteBranch(params: { tenantId: string; branchId: string }): Promise<{ deletedId: string }>
  enableModule(tenantId: string, moduleId: ModuleId): Promise<Tenant | null>
  disableModule(tenantId: string, moduleId: ModuleId): Promise<Tenant | null>
}

const nowIso = () => new Date().toISOString()
const id = () => crypto.randomUUID()

export class InMemoryStore {
  private state: StoreState

  constructor(initial: StoreState) {
    this.state = initial
  }

  async transaction<T>(_tenantId: string, fn: (tx: InMemoryStore) => Promise<T>) {
    return fn(this)
  }

  async getDefaultTenantId() {
    return this.state.tenants[0]?.id ?? null
  }

  async audit(event: Omit<AuditEvent, 'id' | 'createdAt' | 'expiresAt'>) {
    const createdAt = nowIso()
    this.state.auditEvents.unshift({
      id: id(),
      createdAt,
      expiresAt: computeExpiresAt(event.action, new Date(createdAt)).toISOString(),
      ...event,
    })
  }

  async listAuditEvents(params: { tenantId: string; entityType?: string; entityId?: string }) {
    const rows = this.state.auditEvents.filter(
      (e) =>
        e.tenantId === params.tenantId &&
        (!params.entityType || e.entityType === params.entityType) &&
        (!params.entityId || e.entityId === params.entityId),
    )
    return rows.slice(0, 200)
  }

  /**
   * LGPD Art. 16 — purge de audit_events vencidos.
   *
   * Implementação equivalente à função SQL `purge_expired_audit_events()`:
   * deleta audit_events com expires_at < now. Idempotente.
   *
   * SECURITY: log SEM PII (apenas métricas).
   */
  async purgeExpiredAuditEvents(): Promise<{ deletedCount: number; cutoff: string }> {
    const now = new Date()
    const before = this.state.auditEvents.length
    this.state.auditEvents = this.state.auditEvents.filter(
      (e) => !e.expiresAt || new Date(e.expiresAt) >= now,
    )
    const deletedCount = before - this.state.auditEvents.length
    return { deletedCount, cutoff: now.toISOString() }
  }

  async listPendingFiscalDocuments(params: { tenantId: string }) {
    return this.state.fiscalDocuments.filter((d) => d.tenantId === params.tenantId && d.status === 'PENDING').slice(0, 50)
  }

  async findUserByEmail(params: { tenantId: string; email: string }) {
    return this.state.users.find(
      (u) => u.tenantId === params.tenantId && u.email.toLowerCase() === params.email.toLowerCase(),
    )
  }

  async getUser(params: { tenantId: string; userId: string }) {
    return this.state.users.find((u) => u.tenantId === params.tenantId && u.id === params.userId)
  }

  // ===== Customers — implementações =====
  async listCustomers(params: { tenantId: string; query?: string; includeArchived?: boolean; lifecycle?: 'lead' | 'active' | 'inactive' | 'churned'; tag?: string }) {
    const q = params.query?.trim().toLowerCase()
    let rows = this.state.customers.filter((c) => c.tenantId === params.tenantId)
    if (!params.includeArchived) rows = rows.filter((c) => c.active)
    if (params.lifecycle) rows = rows.filter((c) => c.lifecycle === params.lifecycle)
    if (params.tag) rows = rows.filter((c) => c.tags.includes(params.tag!))
    if (!q) {
      rows.sort((a, b) => a.name.localeCompare(b.name))
      return rows
    }
    const filtered = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tradeName ?? '').toLowerCase().includes(q) ||
        (c.taxId ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.city ?? '').toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    )
    filtered.sort((a, b) => a.name.localeCompare(b.name))
    return filtered
  }

  async getCustomer(params: { tenantId: string; customerId: string }) {
    return (
      this.state.customers.find(
        (c) => c.tenantId === params.tenantId && c.id === params.customerId,
      ) ?? null
    )
  }

  async findCustomerByPhone(params: { tenantId: string; phone: string }) {
    const digits = params.phone.replace(/\D/g, '')
    if (!digits) return null
    return (
      this.state.customers.find(
        (c) =>
          c.tenantId === params.tenantId &&
          ((c.phone && c.phone.replace(/\D/g, '').endsWith(digits)) ||
            (c.whatsapp && c.whatsapp.replace(/\D/g, '').endsWith(digits))),
      ) ?? null
    )
  }

  async createCustomer(params: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'active'>) {
    const name = params.name.trim()
    if (!name) throw new Error('Nome do cliente é obrigatório')
    const row: Customer = {
      ...params,
      name,
      tags: (params.tags ?? []).map((t) => t.trim()).filter(Boolean),
      id: id(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      active: true,
    }
    this.state.customers.unshift(row)
    return row
  }

  async updateCustomer(params: { tenantId: string; customerId: string; patch: Partial<Omit<Customer, 'id' | 'tenantId' | 'createdAt'>> }) {
    const row = this.state.customers.find(
      (c) => c.tenantId === params.tenantId && c.id === params.customerId,
    )
    if (!row) return null
    for (const k of Object.keys(params.patch) as (keyof typeof params.patch)[]) {
      if (params.patch[k] === undefined) continue
      if (k === 'tags' && Array.isArray(params.patch.tags)) {
        row.tags = params.patch.tags.map((t) => t.trim()).filter(Boolean)
      } else {
        ;(row as unknown as Record<string, unknown>)[k] = params.patch[k]
      }
    }
    row.updatedAt = nowIso()
    return row
  }

  async archiveCustomer(params: { tenantId: string; customerId: string }) {
    const row = this.state.customers.find(
      (c) => c.tenantId === params.tenantId && c.id === params.customerId,
    )
    if (!row) return null
    row.active = false
    row.updatedAt = nowIso()
    return row
  }

  async restoreCustomer(params: { tenantId: string; customerId: string }) {
    const row = this.state.customers.find(
      (c) => c.tenantId === params.tenantId && c.id === params.customerId,
    )
    if (!row) return null
    row.active = true
    row.updatedAt = nowIso()
    return row
  }

  async deleteCustomer(params: { tenantId: string; customerId: string }): Promise<{ deletedId: string }> {
    const idx = this.state.customers.findIndex(
      (c) => c.tenantId === params.tenantId && c.id === params.customerId,
    )
    if (idx === -1) throw new Error('Cliente não encontrado')
    this.state.customers.splice(idx, 1)
    return { deletedId: params.customerId }
  }

  /**
   * LGPD Art. 18, VI: anonimiza customer preservando integridade referencial.
   *
   * Comportamento:
   *  - name → 'CONSUMIDOR ANONIMIZADO'
   *  - phone, email, address, document → NULL
   *  - notes → NULL
   *  - orders.items[].customerName → '' (remove snapshot PII)
   *  - audit log: preservado (já tem metadata hasheado via buildSafeAuditMeta)
   *
   * SECURITY: idempotente. Se já anonimizado, não faz nada.
   */
  async anonymizeCustomer(params: { tenantId: string; customerId: string }): Promise<void> {
    const customer = this.state.customers.find(
      (c) => c.tenantId === params.tenantId && c.id === params.customerId,
    )
    if (!customer) throw new Error('Cliente não encontrado')
    // Skip se já anonimizado
    if (customer.name === 'CONSUMIDOR ANONIMIZADO') return
    const oldName = customer.name
    const oldPhone = customer.phone
    customer.name = 'CONSUMIDOR ANONIMIZADO'
    customer.phone = null
    customer.whatsapp = null
    customer.email = null
    customer.address = null
    customer.city = null
    customer.state = null
    customer.zip = null
    customer.notes = null
    customer.tags = []
    customer.taxId = null
    // SECURITY (LGPD): sanitiza orders que referenciam este customer
    // (matching por nome antigo ou phone antigo).
    for (const order of this.state.orders) {
      if (order.tenantId !== params.tenantId) continue
      let touched = false
      if (order.customerName === oldName) {
        order.customerName = 'CONSUMIDOR ANONIMIZADO'
        touched = true
      }
      if (oldPhone && order.customerPhone === oldPhone) {
        order.customerPhone = null
        touched = true
      }
      if (touched && order.deliveryAddress) {
        // Remove endereço de entrega também (LGPD)
        order.deliveryAddress = null
      }
    }
  }

  // ===== Suppliers — implementações =====
  async listSuppliers(params: { tenantId: string; query?: string; includeArchived?: boolean }) {
    const q = params.query?.trim().toLowerCase()
    let rows = this.state.suppliers.filter((s) => s.tenantId === params.tenantId)
    if (!params.includeArchived) rows = rows.filter((s) => s.active)
    if (!q) {
      rows.sort((a, b) => a.name.localeCompare(b.name))
      return rows
    }
    const filtered = rows.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.document ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.contactName ?? '').toLowerCase().includes(q) ||
        (s.city ?? '').toLowerCase().includes(q),
    )
    filtered.sort((a, b) => a.name.localeCompare(b.name))
    return filtered
  }

  async getSupplier(params: { tenantId: string; supplierId: string }) {
    return (
      this.state.suppliers.find(
        (s) => s.tenantId === params.tenantId && s.id === params.supplierId,
      ) ?? null
    )
  }

  async createSupplier(params: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) {
    const name = params.name.trim()
    if (!name) throw new Error('Nome do fornecedor é obrigatório')

    // Unicidade por tenant (case-insensitive, apenas ativos)
    const dup = this.state.suppliers.find(
      (s) =>
        s.tenantId === params.tenantId &&
        s.active &&
        s.name.toLowerCase() === name.toLowerCase(),
    )
    if (dup) throw new Error(`Já existe um fornecedor com o nome "${name}"`)

    const row: Supplier = {
      ...params,
      name,
      id: id(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    this.state.suppliers.unshift(row)
    return row
  }

  async updateSupplier(params: { tenantId: string; supplierId: string; patch: Partial<Omit<Supplier, 'id' | 'tenantId' | 'createdAt'>> }) {
    const row = this.state.suppliers.find(
      (s) => s.tenantId === params.tenantId && s.id === params.supplierId,
    )
    if (!row) return null
    if (params.patch.name !== undefined) {
      const name = params.patch.name.trim()
      if (!name) throw new Error('Nome do fornecedor é obrigatório')
      const dup = this.state.suppliers.find(
        (s) =>
          s.tenantId === params.tenantId &&
          s.id !== params.supplierId &&
          s.active &&
          s.name.toLowerCase() === name.toLowerCase(),
      )
      if (dup) throw new Error(`Já existe um fornecedor com o nome "${name}"`)
      row.name = name
    }
    if (params.patch.document !== undefined) row.document = params.patch.document
    if (params.patch.email !== undefined) row.email = params.patch.email
    if (params.patch.phone !== undefined) row.phone = params.patch.phone
    if (params.patch.contactName !== undefined) row.contactName = params.patch.contactName
    if (params.patch.address !== undefined) row.address = params.patch.address
    if (params.patch.city !== undefined) row.city = params.patch.city
    if (params.patch.state !== undefined) row.state = params.patch.state
    if (params.patch.zip !== undefined) row.zip = params.patch.zip
    if (params.patch.paymentTerms !== undefined) row.paymentTerms = params.patch.paymentTerms
    if (params.patch.leadTimeDays !== undefined) row.leadTimeDays = params.patch.leadTimeDays
    if (params.patch.notes !== undefined) row.notes = params.patch.notes
    if (params.patch.active !== undefined) row.active = params.patch.active
    row.updatedAt = nowIso()
    return row
  }

  async archiveSupplier(params: { tenantId: string; supplierId: string }) {
    const row = this.state.suppliers.find(
      (s) => s.tenantId === params.tenantId && s.id === params.supplierId,
    )
    if (!row) return null
    row.active = false
    row.updatedAt = nowIso()
    return row
  }

  async restoreSupplier(params: { tenantId: string; supplierId: string }) {
    const row = this.state.suppliers.find(
      (s) => s.tenantId === params.tenantId && s.id === params.supplierId,
    )
    if (!row) return null
    row.active = true
    row.updatedAt = nowIso()
    return row
  }

  async deleteSupplier(params: { tenantId: string; supplierId: string }): Promise<{ deletedId: string }> {
    const idx = this.state.suppliers.findIndex(
      (s) => s.tenantId === params.tenantId && s.id === params.supplierId,
    )
    if (idx === -1) throw new Error('Fornecedor não encontrado')
    this.state.suppliers.splice(idx, 1)
    return { deletedId: params.supplierId }
  }

  // ===== Purchase Orders — implementações =====
  async listPurchaseOrders(params: { tenantId: string; status?: 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELED' | 'all'; supplierId?: string }) {
    let rows = this.state.purchaseOrders.filter((o) => o.tenantId === params.tenantId)
    if (params.status && params.status !== 'all') rows = rows.filter((o) => o.status === params.status)
    if (params.supplierId) rows = rows.filter((o) => o.supplierId === params.supplierId)
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return rows
  }

  async getPurchaseOrder(params: { tenantId: string; orderId: string }) {
    return this.state.purchaseOrders.find((o) => o.tenantId === params.tenantId && o.id === params.orderId) ?? null
  }

  async createPurchaseOrder(
    params: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'totalCents' | 'receivedAt' | 'receivedBy' | 'supplierName'> & {
      items: Array<Omit<PurchaseOrderItem, 'productName' | 'sku' | 'totalCents'>>
    },
  ) {
    const supplier = this.state.suppliers.find((s) => s.tenantId === params.tenantId && s.id === params.supplierId)
    if (!supplier) throw new Error('Fornecedor não encontrado')

    // Snapshots de nome/sku (defesa contra renomeação posterior do produto)
    const items: PurchaseOrderItem[] = params.items.map((it) => {
      const product = this.state.products.find((p) => p.tenantId === params.tenantId && p.id === it.productId)
      const productName = it.productName ?? product?.name ?? 'Produto'
      const sku = it.sku ?? product?.sku ?? ''
      const totalCents = Math.round(it.quantity * it.unitCostCents)
      return {
        productId: it.productId,
        productName,
        sku,
        unitCode: it.unitCode,
        quantity: it.quantity,
        unitCostCents: it.unitCostCents,
        totalCents,
      }
    })
    const totalCents = items.reduce((acc, it) => acc + it.totalCents, 0)

    const row: PurchaseOrder = {
      id: id(),
      tenantId: params.tenantId,
      supplierId: params.supplierId,
      supplierName: supplier.name,
      status: params.status,
      items,
      totalCents,
      expectedDate: params.expectedDate ?? null,
      notes: params.notes ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      receivedAt: null,
      receivedBy: null,
      createdBy: params.createdBy,
    }
    this.state.purchaseOrders.unshift(row)
    return row
  }

  async updatePurchaseOrderStatus(params: {
    tenantId: string
    orderId: string
    status: PurchaseOrder['status']
    expectedDate?: string | null
    notes?: string | null
    receivedBy?: string | null
  }) {
    const row = this.state.purchaseOrders.find(
      (o) => o.tenantId === params.tenantId && o.id === params.orderId,
    )
    if (!row) return null
    row.status = params.status
    if (params.expectedDate !== undefined) row.expectedDate = params.expectedDate
    if (params.notes !== undefined) row.notes = params.notes
    if (params.status === 'RECEIVED') {
      row.receivedAt = nowIso()
      row.receivedBy = params.receivedBy ?? row.receivedBy
    }
    row.updatedAt = nowIso()
    return row
  }

  async deletePurchaseOrder(params: { tenantId: string; orderId: string }) {
    const idx = this.state.purchaseOrders.findIndex(
      (o) => o.tenantId === params.tenantId && o.id === params.orderId,
    )
    if (idx === -1) throw new Error('Pedido de compra não encontrado')
    if (this.state.purchaseOrders[idx].status === 'RECEIVED') {
      throw new Error('Pedido recebido não pode ser excluído (já impactou estoque)')
    }
    this.state.purchaseOrders.splice(idx, 1)
    return { deletedId: params.orderId }
  }

  async receivePurchaseOrder(params: { tenantId: string; orderId: string; branchId: string; receivedBy: string }) {
    const order = this.state.purchaseOrders.find(
      (o) => o.tenantId === params.tenantId && o.id === params.orderId,
    )
    if (!order) throw new Error('Pedido de compra não encontrado')
    if (order.status === 'RECEIVED') throw new Error('Pedido já foi recebido')
    if (order.status === 'CANCELED') throw new Error('Pedido cancelado não pode ser recebido')

    let movementsCreated = 0
    for (const it of order.items) {
      // Encontra a unidade-base do produto para converter (1:1 por padrão)
      const product = this.state.products.find((p) => p.tenantId === params.tenantId && p.id === it.productId)
      const conv = this.state.unitConversions.find(
        (c) => c.tenantId === params.tenantId && c.productId === it.productId && c.unitCode === it.unitCode,
      )
      const factor = conv?.factorToBase ?? 1
      const quantityBase = it.quantity * factor

      // Atualiza saldo de estoque
      const existing = this.state.inventoryBalances.find(
        (b) => b.tenantId === params.tenantId && b.branchId === params.branchId && b.productId === it.productId,
      )
      if (existing) {
        existing.quantityBase += quantityBase
        existing.updatedAt = nowIso()
      } else {
        this.state.inventoryBalances.push({
          tenantId: params.tenantId,
          branchId: params.branchId,
          productId: it.productId,
          quantityBase,
          updatedAt: nowIso(),
        })
      }

      // Lançamento de estoque
      this.state.inventoryMovements.unshift({
        id: id(),
        tenantId: params.tenantId,
        branchId: params.branchId,
        productId: it.productId,
        movementType: 'TRANSFER_IN',
        quantityBase,
        refType: 'TRANSFER',
        refId: order.id,
        reason: `Recebimento PO ${order.id}`,
        createdAt: nowIso(),
        createdBy: params.receivedBy,
        unitCostCents: it.unitCostCents,
        unitRevenueCents: null,
      })
      movementsCreated++

      // Recalcula custo médio ponderado (CMV) do produto.
      if (product) {
        const currentAvg = product.averageCostCents ?? 0
        const currentStock = this.state.inventoryBalances
          .filter((b) => b.tenantId === params.tenantId && b.productId === it.productId)
          .reduce((acc, b) => acc + b.quantityBase, 0)
        const totalQty = currentStock + quantityBase
        product.averageCostCents = totalQty > 0
          ? Math.round((currentStock * currentAvg + quantityBase * it.unitCostCents) / totalQty)
          : it.unitCostCents
      }

      // Marca o produto como ativo se não estava (recebimento = confirmação de uso)
      if (product && !product.active) product.active = true
    }

    order.status = 'RECEIVED'
    order.receivedAt = nowIso()
    order.receivedBy = params.receivedBy
    order.updatedAt = order.receivedAt
    return { order, movementsCreated }
  }

  // ===== Cash Register — implementações =====
  async listCashSessions(params: { tenantId: string; status?: 'open' | 'closed' | 'all' }) {
    let rows = this.state.cashSessions.filter((s) => s.tenantId === params.tenantId)
    if (params.status && params.status !== 'all') {
      rows = rows.filter((s) => s.status === params.status)
    }
    rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    return rows
  }

  async getOpenCashSession(params: { tenantId: string }) {
    return this.state.cashSessions.find((s) => s.tenantId === params.tenantId && s.status === 'open') ?? null
  }

  async getCashSession(params: { tenantId: string; sessionId: string }) {
    return (
      this.state.cashSessions.find(
        (s) => s.tenantId === params.tenantId && s.id === params.sessionId,
      ) ?? null
    )
  }

  async openCashSession(params: Omit<CashSession, 'id' | 'openedAt' | 'closedAt' | 'status' | 'closingCents' | 'differenceCents' | 'expectedCents'>) {
    const open = await this.getOpenCashSession({ tenantId: params.tenantId })
    if (open) throw new Error('Já existe uma sessão de caixa aberta')
    const row: CashSession = {
      ...params,
      id: id(),
      openedAt: nowIso(),
      closedAt: null,
      status: 'open',
      closingCents: null,
      differenceCents: null,
      expectedCents: params.openingCents,
    }
    this.state.cashSessions.unshift(row)
    return row
  }

  async closeCashSession(params: { tenantId: string; sessionId: string; closingCents: number; notes?: string | null }) {
    const row = this.state.cashSessions.find(
      (s) => s.tenantId === params.tenantId && s.id === params.sessionId && s.status === 'open',
    )
    if (!row) return null
    const expected = await this.computeCashExpectedCents({ tenantId: params.tenantId, sessionId: row.id })
    row.expectedCents = expected
    row.closingCents = params.closingCents
    row.differenceCents = params.closingCents - expected
    row.status = 'closed'
    row.closedAt = nowIso()
    if (params.notes) row.notes = (row.notes ? row.notes + '\n' : '') + `[Fechamento] ${params.notes}`
    return row
  }

  async listCashMovements(params: { tenantId: string; sessionId?: string }) {
    let rows = this.state.cashMovements.filter((m) => m.tenantId === params.tenantId)
    if (params.sessionId) rows = rows.filter((m) => m.sessionId === params.sessionId)
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return rows
  }

  async addCashMovement(params: Omit<CashMovement, 'id' | 'createdAt'>) {
    const row: CashMovement = {
      ...params,
      id: id(),
      createdAt: nowIso(),
    }
    this.state.cashMovements.unshift(row)
    // Recalcula expectedCents da sessão
    if (params.type === 'sale' || params.type === 'supply' || params.type === 'tip') {
      const session = this.state.cashSessions.find((s) => s.id === params.sessionId)
      if (session && session.status === 'open') {
        const expected = await this.computeCashExpectedCents({ tenantId: params.tenantId, sessionId: session.id })
        session.expectedCents = expected
      }
    } else if (params.type === 'withdrawal') {
      const session = this.state.cashSessions.find((s) => s.id === params.sessionId)
      if (session && session.status === 'open') {
        const expected = await this.computeCashExpectedCents({ tenantId: params.tenantId, sessionId: session.id })
        session.expectedCents = expected
      }
    }
    return row
  }

  async computeCashExpectedCents(params: { tenantId: string; sessionId: string }): Promise<number> {
    const session = this.state.cashSessions.find(
      (s) => s.tenantId === params.tenantId && s.id === params.sessionId,
    )
    if (!session) return 0
    const moves = this.state.cashMovements.filter(
      (m) => m.tenantId === params.tenantId && m.sessionId === params.sessionId,
    )
    const sumMoves = moves.reduce((acc, m) => acc + m.amountCents, 0)
    return session.openingCents + sumMoves
  }

  async listProducts(params: { tenantId: string; query?: string; categoryId?: string | null; includeArchived?: boolean }) {
    const q = params.query?.trim().toLowerCase()
    let rows = this.state.products.filter((p) => p.tenantId === params.tenantId)
    if (!params.includeArchived) rows = rows.filter((p) => p.active)
    if (params.categoryId !== undefined) {
      if (params.categoryId === null) rows = rows.filter((p) => p.categoryId === null)
      else rows = rows.filter((p) => p.categoryId === params.categoryId)
    }
    if (!q) return rows
    // SECURITY (perf): FTS-like — busca por nome/SKU OU nome da categoria
    return rows.filter((p) => {
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) return true
      if (p.categoryId) {
        const cat = this.state.categories.find((c) => c.id === p.categoryId)
        if (cat && cat.name.toLowerCase().includes(q)) return true
      }
      return false
    })
  }

  // PERF: versão paginada — filtra, conta e pagina em um único scan.
  // O(N) no pior caso, mas N é tipicamente pequeno (<500 produtos).
  async listProductsPaged(params: { tenantId: string; query?: string; categoryId?: string | null; includeArchived?: boolean; limit: number; offset: number }) {
    const q = params.query?.trim().toLowerCase()
    let rows = this.state.products.filter((p) => p.tenantId === params.tenantId)
    if (!params.includeArchived) rows = rows.filter((p) => p.active)
    if (params.categoryId !== undefined) {
      if (params.categoryId === null) rows = rows.filter((p) => p.categoryId === null)
      else rows = rows.filter((p) => p.categoryId === params.categoryId)
    }
    if (q) {
      rows = rows.filter((p) => {
        if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) return true
        if (p.categoryId) {
          const cat = this.state.categories.find((c) => c.id === p.categoryId)
          if (cat && cat.name.toLowerCase().includes(q)) return true
        }
        return false
      })
    }
    // Ordena por createdAt DESC (mais recente primeiro) — UX padrão de listas
    rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    const total = rows.length
    const items = rows.slice(params.offset, params.offset + params.limit)
    return { items, total, limit: params.limit, offset: params.offset }
  }

  async listUnits(params: { tenantId: string }) {
    return this.state.units.filter((u) => u.tenantId === params.tenantId)
  }

  async getSaleUnits(params: { tenantId: string; productId: string }) {
    const product = await this.getProduct(params)
    if (!product) return []

    const units = this.state.units.filter((u) => u.tenantId === params.tenantId)
    const conversions = this.state.unitConversions.filter(
      (c) => c.tenantId === params.tenantId && c.productId === params.productId,
    )
    const unitIndex = new Map(units.map((u) => [u.code, u] as const))
    const unitCodes = [product.baseUnit, ...conversions.map((c) => c.unitCode)]
    const uniqueCodes = Array.from(new Set(unitCodes))

    const getFactor = (unitCode: string) => {
      if (unitCode === product.baseUnit) return 1
      const conv = conversions.find((c) => c.unitCode === unitCode)
      return conv?.factorToBase ?? null
    }

    const getPrices = (unitCode: string): Record<OrderChannel, number> => {
      const channels: OrderChannel[] = ['BALCAO', 'WHATSAPP', 'CATALOGO', 'DELIVERY']
      const out: Record<OrderChannel, number> = {
        BALCAO: 0,
        WHATSAPP: 0,
        CATALOGO: 0,
        DELIVERY: 0,
      }
      for (const ch of channels) {
        const p = this.state.prices.find(
          (x) =>
            x.tenantId === params.tenantId &&
            x.productId === params.productId &&
            x.unitCode === unitCode &&
            x.channel === ch,
        )
        out[ch] = p?.priceCents ?? 0
      }
      return out
    }

    const saleUnits: SaleUnit[] = []
    for (const code of uniqueCodes) {
      const u = unitIndex.get(code)
      const factor = getFactor(code)
      if (!u || !factor) continue
      saleUnits.push({ unitCode: code, label: u.label, factorToBase: factor, prices: getPrices(code) })
    }
    return saleUnits
  }

  async getSaleUnitsBatch(params: { tenantId: string; productIds: string[] }) {
    const idSet = new Set(params.productIds)
    const map = new Map<string, SaleUnit[]>()
    for (const id of params.productIds) map.set(id, [])

    // agrupa conversions por produto em um único scan
    const conversionsByProduct = new Map<string, UnitConversion[]>()
    for (const c of this.state.unitConversions) {
      if (c.tenantId !== params.tenantId || !idSet.has(c.productId)) continue
      const arr = conversionsByProduct.get(c.productId) ?? []
      arr.push(c)
      conversionsByProduct.set(c.productId, arr)
    }
    // produtos (precisamos de baseUnit)
    const products = this.state.products.filter((p) => idSet.has(p.id) && p.tenantId === params.tenantId)
    const productById = new Map(products.map((p) => [p.id, p] as const))

    // unidades por tenant
    const units = this.state.units.filter((u) => u.tenantId === params.tenantId)
    const unitByCode = new Map(units.map((u) => [u.code, u] as const))

    // preços indexados por productId+unitCode
    const priceIndex = new Map<string, Record<OrderChannel, number>>()
    for (const p of this.state.prices) {
      if (p.tenantId !== params.tenantId || !idSet.has(p.productId)) continue
      const k = `${p.productId}:${p.unitCode}`
      if (!priceIndex.has(k)) priceIndex.set(k, { BALCAO: 0, WHATSAPP: 0, CATALOGO: 0, DELIVERY: 0 })
      priceIndex.get(k)![p.channel] = p.priceCents
    }

    for (const product of products) {
      const conversions = conversionsByProduct.get(product.id) ?? []
      const unitCodes = Array.from(new Set([product.baseUnit, ...conversions.map((c) => c.unitCode)]))
      const saleUnits: SaleUnit[] = []
      for (const code of unitCodes) {
        const u = unitByCode.get(code)
        const factor = code === product.baseUnit ? 1 : conversions.find((c) => c.unitCode === code)?.factorToBase
        if (!u || !factor) continue
        saleUnits.push({
          unitCode: code,
          label: u.label,
          factorToBase: factor,
          prices: priceIndex.get(`${product.id}:${code}`) ?? { BALCAO: 0, WHATSAPP: 0, CATALOGO: 0, DELIVERY: 0 },
        })
      }
      map.set(product.id, saleUnits)
    }
    return map
  }

  async getPrice(params: { tenantId: string; productId: string; channel: OrderChannel; unitCode: string }) {
    const row = this.state.prices.find(
      (p) =>
        p.tenantId === params.tenantId &&
        p.productId === params.productId &&
        p.channel === params.channel &&
        p.unitCode === params.unitCode,
    )
    return row?.priceCents ?? null
  }

  async upsertPrice(params: { tenantId: string; productId: string; unitCode: string; channel: OrderChannel; priceCents: number }) {
    const idx = this.state.prices.findIndex(
      (p) =>
        p.tenantId === params.tenantId &&
        p.productId === params.productId &&
        p.channel === params.channel &&
        p.unitCode === params.unitCode,
    )
    if (idx >= 0) {
      this.state.prices[idx].priceCents = params.priceCents
    } else {
      this.state.prices.push({
        tenantId: params.tenantId,
        productId: params.productId,
        unitCode: params.unitCode,
        channel: params.channel,
        priceCents: params.priceCents,
      })
    }
  }

  async getUnit(params: { tenantId: string; code: string }) {
    return this.state.units.find((u) => u.tenantId === params.tenantId && u.code === params.code) ?? null
  }

  async createUnit(params: { tenantId: string; code: string; label: string }) {
    const unit: Unit = { ...params, createdAt: nowIso() }
    this.state.units.push(unit)
    return unit
  }

  async upsertUnitConversion(params: { tenantId: string; productId: string; unitCode: string; factorToBase: number }) {
    const idx = this.state.unitConversions.findIndex(
      (uc) =>
        uc.tenantId === params.tenantId &&
        uc.productId === params.productId &&
        uc.unitCode === params.unitCode,
    )
    if (idx >= 0) {
      this.state.unitConversions[idx].factorToBase = params.factorToBase
    } else {
      this.state.unitConversions.push({ ...params })
    }
  }

  async createProduct(params: Omit<Product, 'id' | 'createdAt'>) {
    const product: Product = { ...params, id: id(), createdAt: nowIso() }
    this.state.products.unshift(product)
    return product
  }

  async updateProduct(params: { tenantId: string; productId: string; patch: Partial<Pick<Product, 'name' | 'baseUnit' | 'categoryId' | 'active' | 'sku'>> }) {
    const row = this.state.products.find((p) => p.tenantId === params.tenantId && p.id === params.productId)
    if (!row) return null
    Object.assign(row, params.patch)
    return row
  }

  async getProduct(params: { tenantId: string; productId: string }) {
    return this.state.products.find((p) => p.tenantId === params.tenantId && p.id === params.productId)
  }

  async countProductsByCategory(params: { tenantId: string; categoryId: string | null }) {
    return this.state.products.filter((p) => {
      if (p.tenantId !== params.tenantId || !p.active) return false
      if (params.categoryId === null) return p.categoryId === null
      return p.categoryId === params.categoryId
    }).length
  }

  async countProductsByCategoryBatch(params: { tenantId: string }) {
    const map = new Map<string | null, number>()
    for (const p of this.state.products) {
      if (p.tenantId !== params.tenantId || !p.active) continue
      map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + 1)
    }
    return map
  }

  // ===== Categorias — implementações =====
  ensureSystemCategory(tenantId: string): Category {
    // Cria (idempotente) a categoria "Sem categoria" para o tenant
    const existing = this.state.categories.find(
      (c) => c.tenantId === tenantId && c.isSystem,
    )
    if (existing) return existing
    const sys: Category = {
      id: `${SYSTEM_CATEGORY_SLUG}-${tenantId}`,
      tenantId,
      name: 'Sem categoria',
      description: 'Itens sem categoria definida',
      color: '#64748b',
      icon: 'Package',
      position: -1,
      isSystem: true,
      archivedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    this.state.categories.push(sys)
    return sys
  }

  async listCategories(params: { tenantId: string; includeArchived?: boolean }) {
    this.ensureSystemCategory(params.tenantId)
    const rows = this.state.categories.filter((c) => c.tenantId === params.tenantId)
    const filtered = params.includeArchived ? rows : rows.filter((c) => c.archivedAt === null)
    return filtered.sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1 // system sempre por último
      if (a.position !== b.position) return a.position - b.position
      return a.name.localeCompare(b.name)
    })
  }

  async getCategory(params: { tenantId: string; categoryId: string }) {
    this.ensureSystemCategory(params.tenantId)
    return this.state.categories.find((c) => c.tenantId === params.tenantId && c.id === params.categoryId) ?? null
  }

  async getSystemCategoryId(params: { tenantId: string }): Promise<string | null> {
    return this.ensureSystemCategory(params.tenantId).id
  }

  async createCategory(params: { tenantId: string; name: string; description?: string | null; color?: string | null; icon?: string | null; createdBy: string }) {
    this.ensureSystemCategory(params.tenantId)
    const name = params.name.trim()
    if (!name) throw new Error('Nome da categoria é obrigatório')
    if (name.length > 80) throw new Error('Nome da categoria muito longo (máx 80)')

    // Unicidade por tenant (case-insensitive, não-arquivada)
    const dup = this.state.categories.find(
      (c) =>
        c.tenantId === params.tenantId &&
        c.archivedAt === null &&
        c.name.toLowerCase() === name.toLowerCase(),
    )
    if (dup) throw new Error(`Já existe uma categoria com o nome "${name}"`)

    const positions = this.state.categories
      .filter((c) => c.tenantId === params.tenantId && !c.isSystem && c.archivedAt === null)
      .map((c) => c.position)
    const maxPos = positions.length ? Math.max(...positions) : 0
    const row: Category = {
      id: id(),
      tenantId: params.tenantId,
      name,
      description: params.description ?? null,
      color: params.color ?? null,
      icon: params.icon ?? null,
      position: maxPos + 1,
      isSystem: false,
      archivedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    this.state.categories.push(row)
    return row
  }

  async updateCategory(params: { tenantId: string; categoryId: string; patch: Partial<Pick<Category, 'name' | 'description' | 'color' | 'icon' | 'position'>>; updatedBy: string }) {
    const row = this.state.categories.find(
      (c) => c.tenantId === params.tenantId && c.id === params.categoryId,
    )
    if (!row) return null
    if (row.isSystem) {
      // Categoria de sistema: somente descrição/cor/ícone editáveis; nome e posição travados
      const allowed: Partial<Category> = {}
      if (params.patch.description !== undefined) allowed.description = params.patch.description
      if (params.patch.color !== undefined) allowed.color = params.patch.color
      if (params.patch.icon !== undefined) allowed.icon = params.patch.icon
      Object.assign(row, allowed, { updatedAt: nowIso() })
      return row
    }
    if (params.patch.name !== undefined) {
      const name = params.patch.name.trim()
      if (!name) throw new Error('Nome da categoria é obrigatório')
      if (name.length > 80) throw new Error('Nome da categoria muito longo (máx 80)')
      const dup = this.state.categories.find(
        (c) =>
          c.tenantId === params.tenantId &&
          c.id !== params.categoryId &&
          c.archivedAt === null &&
          c.name.toLowerCase() === name.toLowerCase(),
      )
      if (dup) throw new Error(`Já existe uma categoria com o nome "${name}"`)
      row.name = name
    }
    if (params.patch.description !== undefined) row.description = params.patch.description
    if (params.patch.color !== undefined) row.color = params.patch.color
    if (params.patch.icon !== undefined) row.icon = params.patch.icon
    if (params.patch.position !== undefined) row.position = params.patch.position
    row.updatedAt = nowIso()
    return row
  }

  async archiveCategory(params: { tenantId: string; categoryId: string; updatedBy: string }) {
    const row = this.state.categories.find(
      (c) => c.tenantId === params.tenantId && c.id === params.categoryId,
    )
    if (!row) return null
    if (row.isSystem) throw new Error('Categoria padrão do sistema não pode ser arquivada')
    if (row.archivedAt) return row // já arquivada
    row.archivedAt = nowIso()
    row.updatedAt = row.archivedAt
    return row
  }

  async restoreCategory(params: { tenantId: string; categoryId: string; updatedBy: string }) {
    const row = this.state.categories.find(
      (c) => c.tenantId === params.tenantId && c.id === params.categoryId,
    )
    if (!row) return null
    if (!row.archivedAt) return row
    row.archivedAt = null
    row.updatedAt = nowIso()
    return row
  }

  async deleteCategory(params: { tenantId: string; categoryId: string; fallbackCategoryId: string | null; updatedBy: string }): Promise<{ deletedId: string; movedItems: number }> {
    const row = this.state.categories.find(
      (c) => c.tenantId === params.tenantId && c.id === params.categoryId,
    )
    if (!row) throw new Error('Categoria não encontrada')
    if (row.isSystem) throw new Error('Categoria padrão do sistema não pode ser excluída')

    // Regra: pelo menos 1 categoria não-arquivada e não-sistema deve restar
    const activeNonSystem = this.state.categories.filter(
      (c) =>
        c.tenantId === params.tenantId &&
        c.id !== params.categoryId &&
        !c.isSystem &&
        c.archivedAt === null,
    )
    if (activeNonSystem.length === 0) {
      throw new Error('Não é possível excluir a única categoria restante. Crie outra antes.')
    }

    // Mover itens vinculados para a categoria de fallback (ou null = "Sem categoria")
    const productsToMove = this.state.products.filter(
      (p) => p.tenantId === params.tenantId && p.categoryId === params.categoryId,
    )
    let movedItems = 0
    for (const p of productsToMove) {
      if (params.fallbackCategoryId === null) {
        // fallback para "Sem categoria" = a categoria de sistema
        const sysId = this.ensureSystemCategory(params.tenantId).id
        p.categoryId = sysId
      } else {
        // validar que a categoria de fallback existe e pertence ao tenant
        const fb = this.state.categories.find(
          (c) => c.tenantId === params.tenantId && c.id === params.fallbackCategoryId,
        )
        if (!fb) throw new Error('Categoria de fallback inválida')
        p.categoryId = fb.id
      }
      movedItems++
    }

    this.state.categories = this.state.categories.filter((c) => c.id !== params.categoryId)
    return { deletedId: params.categoryId, movedItems }
  }

  async reorderCategories(params: { tenantId: string; orderedIds: string[]; updatedBy: string }) {
    let pos = 0
    for (const id of params.orderedIds) {
      const row = this.state.categories.find(
        (c) => c.tenantId === params.tenantId && c.id === id && !c.isSystem,
      )
      if (!row) continue
      row.position = pos++
      row.updatedAt = nowIso()
    }
    return this.listCategories({ tenantId: params.tenantId })
  }

  async bulkMoveProducts(params: { tenantId: string; productIds: string[]; targetCategoryId: string | null; updatedBy: string }): Promise<number> {
    if (params.targetCategoryId !== null) {
      const cat = this.state.categories.find(
        (c) => c.tenantId === params.tenantId && c.id === params.targetCategoryId && c.archivedAt === null,
      )
      if (!cat) throw new Error('Categoria destino inválida ou arquivada')
    } else {
      // null = "Sem categoria" = categoria de sistema
      params.targetCategoryId = this.ensureSystemCategory(params.tenantId).id
    }
    let moved = 0
    for (const productId of params.productIds) {
      const p = this.state.products.find(
        (x) => x.tenantId === params.tenantId && x.id === productId,
      )
      if (!p) continue
      p.categoryId = params.targetCategoryId
      moved++
    }
    return moved
  }

  async getInventoryBalance(params: { tenantId: string; branchId: string; productId: string }) {
    return (
      this.state.inventoryBalances.find(
        (b) => b.tenantId === params.tenantId && b.branchId === params.branchId && b.productId === params.productId,
      ) ?? null
    )
  }

  async upsertInventoryBalance(params: { tenantId: string; branchId: string; productId: string; quantityBase: number }) {
    const existing = await this.getInventoryBalance(params)
    if (!existing) {
      const row: InventoryBalance = { ...params, updatedAt: nowIso() }
      this.state.inventoryBalances.push(row)
      return row
    }
    existing.quantityBase = params.quantityBase
    existing.updatedAt = nowIso()
    return existing
  }

  async addInventoryMovement(m: Omit<InventoryMovement, 'id' | 'createdAt'>) {
    const row: InventoryMovement = { ...m, id: id(), createdAt: nowIso() }
    this.state.inventoryMovements.unshift(row)
    return row
  }

  async listInventoryMovements(params: { tenantId: string; branchId: string; productId?: string; from?: string; to?: string }) {
    return this.state.inventoryMovements.filter(
      (m) =>
        m.tenantId === params.tenantId &&
        m.branchId === params.branchId &&
        (!params.productId || m.productId === params.productId) &&
        (!params.from || m.createdAt >= params.from) &&
        (!params.to || m.createdAt <= params.to),
    )
  }

  // PERF: paginação server-side — filtra e pagina em um único scan.
  // Returns { items, total, limit, offset } onde total = total de itens que batem o filtro (antes do paginate).
  async listInventoryMovementsPaged(params: { tenantId: string; branchId: string; productId?: string; type?: string; from?: string; to?: string; limit: number; offset: number }) {
    const all = this.state.inventoryMovements.filter(
      (m) =>
        m.tenantId === params.tenantId &&
        m.branchId === params.branchId &&
        (!params.productId || m.productId === params.productId) &&
        (!params.type || m.movementType === params.type) &&
        (!params.from || m.createdAt >= params.from) &&
        (!params.to || m.createdAt <= params.to),
    )
    // Mantém ordem por createdAt DESC (movimentações mais recentes primeiro)
    all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    const total = all.length
    const items = all.slice(params.offset, params.offset + params.limit)
    return { items, total, limit: params.limit, offset: params.offset }
  }

  async listInventoryBalances(params: { tenantId: string; branchId: string; productIds?: string[] }) {
    const ids = params.productIds ? new Set(params.productIds) : null
    return this.state.inventoryBalances
      .filter((b) => b.tenantId === params.tenantId && b.branchId === params.branchId && (!ids || ids.has(b.productId)))
      .map((b) => ({ productId: b.productId, quantityBase: b.quantityBase }))
  }

  async updateProductAverageCost(params: { tenantId: string; productId: string; quantityIn: number; unitCostInCents: number }) {
    const product = this.state.products.find((p) => p.tenantId === params.tenantId && p.id === params.productId)
    if (!product) throw new Error('PRODUCT_NOT_FOUND')
    const currentAvg = product.averageCostCents ?? 0
    const allBalances = this.state.inventoryBalances.filter((b) => b.tenantId === params.tenantId && b.productId === params.productId)
    const currentStock = allBalances.reduce((acc, b) => acc + b.quantityBase, 0)
    const inQty = params.quantityIn
    const costIn = params.unitCostInCents
    // média ponderada
    const totalQty = currentStock + inQty
    const newAvg = totalQty > 0 ? Math.round((currentStock * currentAvg + inQty * costIn) / totalQty) : costIn
    product.averageCostCents = newAvg
    return { averageCostCents: newAvg }
  }

  async createOrder(o: Omit<Order, 'id' | 'createdAt' | 'updatedAt'> | (Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'items'> & { items?: OrderItem[] })) {
    const items = (o as any).items ?? []
    const row: Order = { ...(o as any), items, id: id(), createdAt: nowIso(), updatedAt: nowIso() }
    this.state.orders.unshift(row)
    return row
  }

  async getOrder(params: { tenantId: string; orderId: string }) {
    return this.state.orders.find((o) => o.tenantId === params.tenantId && o.id === params.orderId) ?? null
  }

  async updateOrderStatus(params: { tenantId: string; orderId: string; status: OrderStatus }) {
    const order = await this.getOrder(params)
    if (!order) return null
    order.status = params.status
    order.updatedAt = nowIso()
    return order
  }

  async listOrders(params: { tenantId: string; branchId: string; status?: OrderStatus; channel?: OrderChannel }) {
    return this.state.orders.filter(
      (o) =>
        o.tenantId === params.tenantId &&
        o.branchId === params.branchId &&
        (!params.status || o.status === params.status) &&
        (!params.channel || o.channel === params.channel),
    )
  }

  async listAllOrdersForTenant(params: { tenantId: string; status?: OrderStatus; channel?: OrderChannel; limit?: number }) {
    const filtered = this.state.orders.filter(
      (o) =>
        o.tenantId === params.tenantId &&
        (!params.status || o.status === params.status) &&
        (!params.channel || o.channel === params.channel),
    )
    filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    if (params.limit && params.limit > 0) return filtered.slice(0, params.limit)
    return filtered
  }

  async createReceivable(params: Omit<AccountReceivable, 'id' | 'createdAt' | 'settledAt'>) {
    const row: AccountReceivable = { ...params, id: id(), createdAt: nowIso(), settledAt: null }
    this.state.accountsReceivable.unshift(row)
    return row
  }

  async listReceivables(params: { tenantId: string; branchId: string; status?: AccountReceivable['status'] }) {
    return this.state.accountsReceivable.filter(
      (r) =>
        r.tenantId === params.tenantId &&
        r.branchId === params.branchId &&
        (!params.status || r.status === params.status),
    )
  }

  async settleReceivable(params: { tenantId: string; receivableId: string }) {
    const row = this.state.accountsReceivable.find((r) => r.tenantId === params.tenantId && r.id === params.receivableId)
    if (!row) return null
    row.status = 'SETTLED'
    row.settledAt = nowIso()
    return row
  }

  async createFiscalDocument(params: Omit<FiscalDocument, 'id' | 'createdAt' | 'updatedAt' | 'numero' | 'serie' | 'accessKey' | 'protocol' | 'authorizedAt' | 'xmlUrl' | 'pdfUrl'> & Partial<Pick<FiscalDocument, 'numero' | 'serie' | 'accessKey' | 'protocol' | 'authorizedAt' | 'xmlUrl' | 'pdfUrl' | 'totalCents'>>) {
    const row: FiscalDocument = {
      id: id(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      numero: params.numero ?? null,
      serie: params.serie ?? null,
      accessKey: params.accessKey ?? null,
      protocol: params.protocol ?? null,
      authorizedAt: params.authorizedAt ?? null,
      xmlUrl: params.xmlUrl ?? null,
      pdfUrl: params.pdfUrl ?? null,
      totalCents: params.totalCents ?? null,
      tenantId: params.tenantId,
      branchId: params.branchId,
      orderId: params.orderId,
      docType: params.docType,
      status: params.status,
      errorMessage: params.errorMessage,
    }
    this.state.fiscalDocuments.unshift(row)
    return row
  }

  async getFiscalDocument(params: { tenantId: string; fiscalDocumentId: string }) {
    return this.state.fiscalDocuments.find(
      (d) => d.tenantId === params.tenantId && d.id === params.fiscalDocumentId,
    ) ?? null
  }

  async listFiscalDocuments(params: { tenantId: string; branchId?: string; status?: FiscalDocument['status']; orderId?: string }) {
    return this.state.fiscalDocuments
      .filter((d) => d.tenantId === params.tenantId)
      .filter((d) => !params.branchId || d.branchId === params.branchId)
      .filter((d) => !params.status || d.status === params.status)
      .filter((d) => !params.orderId || d.orderId === params.orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async updateFiscalDocument(params: { tenantId: string; fiscalDocumentId: string; patch: Partial<Omit<FiscalDocument, 'id' | 'tenantId' | 'createdAt'>> }) {
    const row = this.state.fiscalDocuments.find(
      (d) => d.tenantId === params.tenantId && d.id === params.fiscalDocumentId,
    )
    if (!row) return null
    Object.assign(row, params.patch, { updatedAt: nowIso() })
    return row
  }

  /**
   * Simula a autorização da NF-e (stub para ambiente de desenvolvimento).
   *
   * Em produção, este método seria substituído por uma chamada real à SEFAZ
   * (via provedor como Enotas, NFe.io, FocusNFe, etc.) e o método receberia
   * os dados retornados.
   */
  async simulateFiscalAuthorization(params: { tenantId: string; fiscalDocumentId: string; approved?: boolean; errorMessage?: string | null }) {
    const row = this.state.fiscalDocuments.find(
      (d) => d.tenantId === params.tenantId && d.id === params.fiscalDocumentId,
    )
    if (!row) return null
    if (row.status !== 'PENDING') return row
    const approved = params.approved ?? true
    if (approved) {
      const numero = String(Math.floor(Math.random() * 100000) + 1).padStart(6, '0')
      const serie = '1'
      const accessKey = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('')
      const protocol = String(Math.floor(Math.random() * 1000000000) + 1)
      Object.assign(row, {
        status: 'AUTHORIZED' as const,
        numero,
        serie,
        accessKey,
        protocol,
        authorizedAt: nowIso(),
        errorMessage: null,
        updatedAt: nowIso(),
      })
    } else {
      Object.assign(row, {
        status: 'REJECTED' as const,
        errorMessage: params.errorMessage ?? 'Rejeitada pela SEFAZ (simulação)',
        updatedAt: nowIso(),
      })
    }
    return row
  }

  /**
   * Cancela uma NF-e autorizada.
   * Em produção, dispara evento de cancelamento na SEFAZ (até 24h após autorização).
   */
  async cancelFiscalDocument(params: { tenantId: string; fiscalDocumentId: string; reason: string; canceledBy: string }) {
    const row = this.state.fiscalDocuments.find(
      (d) => d.tenantId === params.tenantId && d.id === params.fiscalDocumentId,
    )
    if (!row) return null
    if (row.status !== 'AUTHORIZED') return row
    Object.assign(row, {
      status: 'CANCELED' as const,
      errorMessage: `Cancelada: ${params.reason}`,
      updatedAt: nowIso(),
    })
    return row
  }

  getIntegrations(tenantId: string): IntegrationCredentials[] {
    return this.state.integrations.filter(i => i.tenantId === tenantId)
  }

  saveIntegration(credentials: IntegrationCredentials): boolean {
    this.state.integrations.push(credentials)
    return true
  }

  updateIntegration(tenantId: string, provider: IntegrationProvider, credentials: Partial<IntegrationCredentials>): boolean {
    const index = this.state.integrations.findIndex(
      i => i.tenantId === tenantId && i.provider === provider
    )
    if (index === -1) return false
    Object.assign(this.state.integrations[index], {
      ...credentials,
      updatedAt: nowIso()
    })
    return true
  }

  deleteIntegration(tenantId: string, provider: IntegrationProvider): boolean {
    const index = this.state.integrations.findIndex(
      i => i.tenantId === tenantId && i.provider === provider
    )
    if (index === -1) return false
    this.state.integrations.splice(index, 1)
    return true
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.state.tenants.find(t => t.id === tenantId) || null
  }

  async updateTenant(tenantId: string, patch: Partial<Tenant>): Promise<Tenant | null> {
    const index = this.state.tenants.findIndex(t => t.id === tenantId)
    if (index === -1) return null
    Object.assign(this.state.tenants[index], patch)
    return this.state.tenants[index]
  }

  async setTenantModules(tenantId: string, modules: ModuleId[]): Promise<Tenant | null> {
    return this.updateTenant(tenantId, { enabledModules: modules })
  }

  async enableModule(tenantId: string, moduleId: ModuleId): Promise<Tenant | null> {
    const tenant = await this.getTenant(tenantId)
    if (!tenant) return null
    if (!tenant.enabledModules.includes(moduleId)) {
      return this.updateTenant(tenantId, { 
        enabledModules: [...tenant.enabledModules, moduleId] 
      })
    }
    return tenant
  }

  async disableModule(tenantId: string, moduleId: ModuleId): Promise<Tenant | null> {
    const tenant = await this.getTenant(tenantId)
    if (!tenant) return null
    return this.updateTenant(tenantId, { 
      enabledModules: tenant.enabledModules.filter(m => m !== moduleId) 
    })
  }

  // ===== Settings: Users =====
  async listUsers(params: { tenantId: string; includeInactive?: boolean }) {
    let rows = this.state.users.filter((u) => u.tenantId === params.tenantId)
    if (!params.includeInactive) rows = rows.filter((u) => u.active)
    rows.sort((a, b) => a.name.localeCompare(b.name))
    return rows
  }

  async getUserById(params: { tenantId: string; userId: string }) {
    return this.state.users.find((u) => u.tenantId === params.tenantId && u.id === params.userId) ?? null
  }

  async createUser(params: Omit<User, 'id'>) {
    const row: User = { ...params, id: id() }
    this.state.users.push(row)
    this.syncUserModules(row)
    return row
  }

  async updateUser(params: { tenantId: string; userId: string; patch: Partial<Omit<User, 'id' | 'tenantId'>> }) {
    const row = this.state.users.find((u) => u.tenantId === params.tenantId && u.id === params.userId)
    if (!row) return null
    Object.assign(row, params.patch)
    this.syncUserModules(row)
    return row
  }

  async deleteUser(params: { tenantId: string; userId: string }) {
    const idx = this.state.users.findIndex((u) => u.tenantId === params.tenantId && u.id === params.userId)
    if (idx === -1) throw new Error('Usuário não encontrado')
    const [removed] = this.state.users.splice(idx, 1)
    // Remove permissões órfãs
    this.state.userModulePermissions = this.state.userModulePermissions.filter(
      (p) => p.userId !== removed.id,
    )
    return { deletedId: params.userId }
  }

  /**
   * Sincroniza a tabela userModulePermissions com base em User.enabledModules.
   * - Se enabledModules === null → remove todas as permissões (herda do tenant)
   * - Se enabledModules === []  → mantém estado vazio explícito (sem módulos)
   * - Se lista explícita       → substitui pelo novo conjunto
   */
  private syncUserModules(user: User): void {
    const others = this.state.userModulePermissions.filter((p) => p.userId !== user.id)
    if (user.enabledModules === null) {
      this.state.userModulePermissions = others
      return
    }
    this.state.userModulePermissions = [
      ...others,
      ...user.enabledModules.map((moduleId) => ({ userId: user.id, tenantId: user.tenantId, moduleId })),
    ]
  }

  /** Lista overrides de módulos por usuário (sem resolver herança). */
  async listUserModulePermissions(params: { tenantId: string; userId: string }): Promise<string[]> {
    return this.state.userModulePermissions
      .filter((p) => p.tenantId === params.tenantId && p.userId === params.userId)
      .map((p) => p.moduleId)
  }

  /**
   * Resolve módulos efetivos para um usuário.
   * - Se enabledModules === null → usa os do tenant
   * - Senão → usa o override (mesmo que vazio)
   */
  async resolveUserEnabledModules(params: { tenantId: string; userId: string }): Promise<string[] | 'tenant'> {
    const u = await this.getUserById({ tenantId: params.tenantId, userId: params.userId })
    if (!u) return 'tenant'
    if (u.enabledModules === null) return 'tenant'
    return u.enabledModules
  }

  // ===== Settings: Branches =====
  async listBranches(params: { tenantId: string }) {
    return this.state.branches.filter((b) => b.tenantId === params.tenantId)
  }

  async createBranch(params: { tenantId: string; name: string }) {
    const row: Branch = { id: id(), tenantId: params.tenantId, name: params.name }
    this.state.branches.push(row)
    return row
  }

  async updateBranch(params: { tenantId: string; branchId: string; patch: { name?: string } }) {
    const row = this.state.branches.find((b) => b.tenantId === params.tenantId && b.id === params.branchId)
    if (!row) return null
    if (params.patch.name !== undefined) row.name = params.patch.name
    return row
  }

  async deleteBranch(params: { tenantId: string; branchId: string }) {
    const idx = this.state.branches.findIndex((b) => b.tenantId === params.tenantId && b.id === params.branchId)
    if (idx === -1) throw new Error('Filial não encontrada')
    this.state.branches.splice(idx, 1)
    return { deletedId: params.branchId }
  }
}

const seed = async (): Promise<StoreState> => {
  const tenantId = id()
  const branchId = id()
  const ownerId = id()

  const ownerPwd = process.env.SEED_OWNER_PASSWORD ?? 'admin123'
  const ownerHash = await hashPassword(ownerPwd)

  const units: Array<Omit<Unit, 'createdAt'>> = [
    { tenantId, code: 'un', label: 'Unidade' },
    { tenantId, code: 'cx12', label: 'Caixa (12)' },
    { tenantId, code: 'fd6', label: 'Fardo (6)' },
  ]

  const products: Array<Omit<Product, 'id' | 'createdAt'>> = [
    { tenantId, sku: 'HEINEKEN-350', name: 'Heineken Lata 350ml', baseUnit: 'un', categoryId: null, active: true, averageCostCents: 0 },
    { tenantId, sku: 'BRAHMA-350', name: 'Brahma Lata 350ml', baseUnit: 'un', categoryId: null, active: true, averageCostCents: 0 },
    { tenantId, sku: 'COCA-2L', name: 'Coca-Cola 2L', baseUnit: 'un', categoryId: null, active: true, averageCostCents: 0 },
    { tenantId, sku: 'AGUA-500', name: 'Água Mineral 500ml', baseUnit: 'un', categoryId: null, active: true, averageCostCents: 0 },
  ]

  const productRows = products.map((p) => ({ ...p, id: id(), createdAt: nowIso() }))
  const unitRows: Unit[] = units.map((u) => ({ ...u, createdAt: nowIso() }))

  const beerIds = productRows
    .filter((p) => p.sku === 'HEINEKEN-350' || p.sku === 'BRAHMA-350')
    .map((p) => p.id)

  const unitConversions: UnitConversion[] = beerIds.flatMap((productId) => [
    { tenantId, productId, unitCode: 'cx12', factorToBase: 12 },
    { tenantId, productId, unitCode: 'fd6', factorToBase: 6 },
  ])

  const prices: Price[] = productRows.flatMap((p) => {
    const base = p.sku === 'COCA-2L' ? 1200 : p.sku === 'AGUA-500' ? 250 : 600
    const delivery = Math.round(base * 1.08)
    const catalogo = Math.round(base * 1.03)
    const balcao = Math.round(base * 0.92)

    const baseRows: Price[] = [
      { tenantId, productId: p.id, unitCode: 'un', channel: 'WHATSAPP', priceCents: base },
      { tenantId, productId: p.id, unitCode: 'un', channel: 'DELIVERY', priceCents: delivery },
      { tenantId, productId: p.id, unitCode: 'un', channel: 'CATALOGO', priceCents: catalogo },
      { tenantId, productId: p.id, unitCode: 'un', channel: 'BALCAO', priceCents: balcao },
    ]

    const isBeer = beerIds.includes(p.id)
    if (!isBeer) return baseRows

    const cx12 = base * 12 - 300
    const fd6 = base * 6 - 120

    return [
      ...baseRows,
      { tenantId, productId: p.id, unitCode: 'cx12', channel: 'WHATSAPP', priceCents: cx12 },
      { tenantId, productId: p.id, unitCode: 'cx12', channel: 'DELIVERY', priceCents: cx12 + 150 },
      { tenantId, productId: p.id, unitCode: 'cx12', channel: 'CATALOGO', priceCents: cx12 + 60 },
      { tenantId, productId: p.id, unitCode: 'cx12', channel: 'BALCAO', priceCents: cx12 - 100 },
      { tenantId, productId: p.id, unitCode: 'fd6', channel: 'WHATSAPP', priceCents: fd6 },
      { tenantId, productId: p.id, unitCode: 'fd6', channel: 'DELIVERY', priceCents: fd6 + 60 },
      { tenantId, productId: p.id, unitCode: 'fd6', channel: 'CATALOGO', priceCents: fd6 + 30 },
      { tenantId, productId: p.id, unitCode: 'fd6', channel: 'BALCAO', priceCents: fd6 - 40 },
    ]
  })

  const balances: InventoryBalance[] = productRows.map((p) => ({
    tenantId,
    branchId,
    productId: p.id,
    quantityBase: p.sku === 'AGUA-500' ? 240 : p.sku === 'COCA-2L' ? 80 : 240,
    updatedAt: nowIso(),
  }))

  return {
    tenants: [{
      id: tenantId,
      name: 'Depósito Demo',
      businessType: 'delivery' as const,
      enabledModules: ['dashboard', 'orders', 'queue', 'marketplace', 'inventory', 'purchases', 'customers', 'cash', 'fiscal', 'reports', 'integrations', 'settings'],
      legalName: null,
      tradeName: null,
      taxId: null,
      createdAt: nowIso()
    }],
    branches: [{ id: branchId, tenantId, name: 'Matriz' }],
    users: [
      {
        id: ownerId,
        tenantId,
        branchId,
        name: 'Admin Demo',
        email: 'admin@demo.com',
        role: 'OWNER',
        passwordSalt: ownerHash.salt,
        passwordHash: ownerHash.hash,
        active: true,
        // Owner sem override — herda módulos do tenant.
        enabledModules: null,
      },
      {
        id: id(),
        tenantId,
        branchId,
        name: 'Maria Cliente',
        email: 'cliente@demo.com',
        role: 'OPS',
        passwordSalt: ownerHash.salt,
        passwordHash: ownerHash.hash,
        active: true,
        // Maria (cliente) tem override restrito — só vê estoque e dashboard.
        enabledModules: ['dashboard', 'inventory'],
      },
      {
        id: id(),
        tenantId,
        branchId,
        name: 'Admin SaaS',
        email: 'saas@admin.com',
        role: 'OWNER',
        passwordSalt: ownerHash.salt,
        passwordHash: ownerHash.hash,
        active: true,
        enabledModules: null,
      },
    ],
    // Lista de overrides por usuário. Owner/Admin SaaS não estão aqui (herdam do tenant).
    userModulePermissions: [
      // Maria Cliente: já registrada inline no User acima via enabledModules,
      // mas mantemos redundância aqui para sincronia com Postgres.
    ],
    customers: [
      { id: id(), tenantId, name: 'Bar do Zé', tradeName: null, taxId: '11.222.333/0001-11', email: 'compras@bardoze.com.br', phone: '11999990001', whatsapp: '11999990001', address: 'Rua A, 123', city: 'São Paulo', state: 'SP', zip: '01000-000', tags: ['VIP', 'Bebidas'], lifecycle: 'active', notes: 'Cliente prioritário, paga em dia.', creditLimitCents: 500000, active: true, createdAt: nowIso(), updatedAt: nowIso() },
      { id: id(), tenantId, name: 'Conveniência Central', tradeName: null, taxId: '22.333.444/0001-22', email: null, phone: '11999990002', whatsapp: null, address: 'Av. B, 456', city: 'Guarulhos', state: 'SP', zip: '07000-000', tags: ['Atacado'], lifecycle: 'active', notes: null, creditLimitCents: null, active: true, createdAt: nowIso(), updatedAt: nowIso() },
      { id: id(), tenantId, name: 'Cliente Delivery', tradeName: null, taxId: null, email: 'cliente.delivery@example.com', phone: '11999990003', whatsapp: '11999990003', address: 'Rua C, 789', city: 'Osasco', state: 'SP', zip: '06000-000', tags: ['Delivery'], lifecycle: 'lead', notes: null, creditLimitCents: null, active: true, createdAt: nowIso(), updatedAt: nowIso() },
    ],
    suppliers: [
      {
        id: id(), tenantId,
        name: 'Distribuidora Atlas',
        document: '12.345.678/0001-90',
        email: 'vendas@atlas.com.br',
        phone: '1133334444',
        contactName: 'Roberto Silva',
        address: 'Av. Industrial, 1500',
        city: 'São Paulo',
        state: 'SP',
        zip: '01100-000',
        paymentTerms: '30/60/90 DDL',
        leadTimeDays: 5,
        notes: 'Fornecedor principal de bebidas.',
        active: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: id(), tenantId,
        name: 'Indústria Polos Norte',
        document: '98.765.432/0001-10',
        email: 'contato@polosnorte.com.br',
        phone: '1144445555',
        contactName: 'Fernanda Lima',
        address: 'Rod. Anhanguera, km 30',
        city: 'Cajamar',
        state: 'SP',
        zip: '07750-000',
        paymentTerms: 'À vista',
        leadTimeDays: 3,
        notes: 'Especialista em produtos frios.',
        active: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
    purchaseOrders: [],
    cashSessions: [],
    cashMovements: [],
    products: productRows,
    categories: [
      {
        id: `${SYSTEM_CATEGORY_SLUG}-${tenantId}`,
        tenantId,
        name: 'Sem categoria',
        description: 'Itens sem categoria definida',
        color: '#64748b',
        icon: 'Package',
        position: -1,
        isSystem: true,
        archivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
    units: unitRows,
    unitConversions,
    prices,
    orders: [],
    inventoryBalances: balances,
    inventoryMovements: [],
    accountsReceivable: [],
    fiscalDocuments: [],
    auditEvents: [],
    integrations: [],
  }
}

const createInMemoryStore = async (): Promise<Store> => seed().then((s) => new InMemoryStore(s))

const createStore = async (): Promise<Store> => {
  const backend = (process.env.STORE_BACKEND ?? 'auto').toLowerCase()

  if (backend === 'memory') return createInMemoryStore()

  const pool = getPool()
  if (!pool) {
    if (backend === 'postgres') throw new Error('DATABASE_URL não configurada')
    return createInMemoryStore()
  }

  try {
    await pool.query('SELECT 1')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new PostgresStore({ pool }) as unknown as Store
  } catch (err) {
    if (backend === 'postgres') throw err
    return createInMemoryStore()
  }
}

let storePromiseV2: Promise<Store> | null = null

export const getStore = async (): Promise<Store> => {
  if (!storePromiseV2) {
    storePromiseV2 = createStore()
  }
  return storePromiseV2
}

let syncStore: InMemoryStore | null = null

const initSyncStore = async (): Promise<InMemoryStore> => {
  const state = await seed()
  return new InMemoryStore(state)
}

initSyncStore().then(s => { syncStore = s })

export const store: Store = {
  transaction: async <T>(_tenantId: string, fn: (tx: Store) => Promise<T>) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.transaction(_tenantId, fn as (tx: InMemoryStore) => Promise<T>)
  },
  getDefaultTenantId: async () => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getDefaultTenantId()
  },
  audit: async (event) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.audit(event)
  },
  listAuditEvents: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listAuditEvents(params)
  },
  purgeExpiredAuditEvents: async () => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.purgeExpiredAuditEvents()
  },
  listPendingFiscalDocuments: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listPendingFiscalDocuments(params)
  },
  findUserByEmail: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.findUserByEmail(params)
  },
  getUser: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getUser(params)
  },
  listCustomers: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listCustomers(params)
  },
  getCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getCustomer(params)
  },
  findCustomerByPhone: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.findCustomerByPhone(params)
  },
  createCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createCustomer(params)
  },
  updateCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateCustomer(params)
  },
  archiveCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.archiveCustomer(params)
  },
  restoreCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.restoreCustomer(params)
  },
  deleteCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.deleteCustomer(params)
  },
  anonymizeCustomer: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.anonymizeCustomer(params)
  },
  listSuppliers: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listSuppliers(params)
  },
  getSupplier: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getSupplier(params)
  },
  createSupplier: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createSupplier(params)
  },
  updateSupplier: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateSupplier(params)
  },
  archiveSupplier: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.archiveSupplier(params)
  },
  restoreSupplier: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.restoreSupplier(params)
  },
  deleteSupplier: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.deleteSupplier(params)
  },
  listPurchaseOrders: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listPurchaseOrders(params)
  },
  getPurchaseOrder: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getPurchaseOrder(params)
  },
  createPurchaseOrder: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createPurchaseOrder(params)
  },
  updatePurchaseOrderStatus: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updatePurchaseOrderStatus(params)
  },
  deletePurchaseOrder: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.deletePurchaseOrder(params)
  },
  receivePurchaseOrder: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.receivePurchaseOrder(params)
  },
  listCashSessions: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listCashSessions(params)
  },
  getOpenCashSession: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getOpenCashSession(params)
  },
  getCashSession: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getCashSession(params)
  },
  openCashSession: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.openCashSession(params)
  },
  closeCashSession: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.closeCashSession(params)
  },
  listCashMovements: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listCashMovements(params)
  },
  addCashMovement: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.addCashMovement(params)
  },
  computeCashExpectedCents: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.computeCashExpectedCents(params)
  },
  listProducts: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listProducts(params)
  },
  listProductsPaged: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listProductsPaged(params)
  },
  listUnits: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listUnits(params)
  },
  getSaleUnits: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getSaleUnits(params)
  },
  getPrice: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getPrice(params)
  },
  upsertPrice: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.upsertPrice(params)
  },
  getUnit: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getUnit(params)
  },
  createUnit: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createUnit(params)
  },
  upsertUnitConversion: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.upsertUnitConversion(params)
  },
  createProduct: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createProduct(params)
  },
  updateProduct: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateProduct(params)
  },
  getProduct: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getProduct(params)
  },
  getInventoryBalance: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getInventoryBalance(params)
  },
  upsertInventoryBalance: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.upsertInventoryBalance(params)
  },
  addInventoryMovement: async (m) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.addInventoryMovement(m)
  },
  listInventoryMovements: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listInventoryMovements(params)
  },
  listInventoryMovementsPaged: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listInventoryMovementsPaged(params)
  },
  listInventoryBalances: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listInventoryBalances(params)
  },
  updateProductAverageCost: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateProductAverageCost(params)
  },
  createOrder: async (o) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createOrder(o)
  },
  getOrder: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getOrder(params)
  },
  updateOrderStatus: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateOrderStatus(params)
  },
  listOrders: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listOrders(params)
  },
  createReceivable: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createReceivable(params)
  },
  listReceivables: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listReceivables(params)
  },
  settleReceivable: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.settleReceivable(params)
  },
  createFiscalDocument: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createFiscalDocument(params)
  },
  listFiscalDocuments: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listFiscalDocuments(params)
  },
  getFiscalDocument: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getFiscalDocument(params)
  },
  updateFiscalDocument: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateFiscalDocument(params)
  },
  simulateFiscalAuthorization: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.simulateFiscalAuthorization(params)
  },
  cancelFiscalDocument: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.cancelFiscalDocument(params)
  },
  getIntegrations: (tenantId: string) => {
    if (!syncStore) return []
    return syncStore!.getIntegrations(tenantId)
  },
  saveIntegration: (credentials) => {
    if (!syncStore) return false
    return syncStore!.saveIntegration(credentials)
  },
  updateIntegration: (tenantId, provider, credentials) => {
    if (!syncStore) return false
    return syncStore!.updateIntegration(tenantId, provider, credentials)
  },
  deleteIntegration: (tenantId, provider) => {
    if (!syncStore) return false
    return syncStore!.deleteIntegration(tenantId, provider)
  },
  getTenant: async (tenantId) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getTenant(tenantId)
  },
  updateTenant: async (tenantId, patch) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateTenant(tenantId, patch)
  },
  setTenantModules: async (tenantId, modules) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.setTenantModules(tenantId, modules)
  },
  enableModule: async (tenantId, moduleId) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.enableModule(tenantId, moduleId)
  },
  disableModule: async (tenantId, moduleId) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.disableModule(tenantId, moduleId)
  },
  listUsers: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listUsers(params)
  },
  getUserById: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.getUserById(params)
  },
  createUser: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createUser(params)
  },
  updateUser: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateUser(params)
  },
  deleteUser: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.deleteUser(params)
  },
  listUserModulePermissions: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listUserModulePermissions(params)
  },
  resolveUserEnabledModules: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.resolveUserEnabledModules(params)
  },
  listBranches: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.listBranches(params)
  },
  createBranch: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.createBranch(params)
  },
  updateBranch: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.updateBranch(params)
  },
  deleteBranch: async (params) => {
    if (!syncStore) await initSyncStore().then(s => { syncStore = s })
    return syncStore!.deleteBranch(params)
  },
} as Store

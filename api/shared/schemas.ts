/**
 * Schemas Zod para validação de input em endpoints.
 *
 * SECURITY (A3 do relatório): schemas explícitos evitam:
 * - NoSQL injection (tipo forçado)
 * - XSS stored (length/sanitização)
 * - Campos inesperados
 * - Bypass de regras de negócio
 */
import { z } from 'zod'

/** Helper para sanitizar string (trim + remove null bytes) */
export const cleanString = (max = 200) =>
  z.string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/\0/g, ''))

/** Schema comum para paginação */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  q: cleanString(100).optional(),
})

/** Schema para filtros de data */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

// ===== Auth =====
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  password: z.string().min(1, 'Senha obrigatória').max(200),
})

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(200),
  name: cleanString(120),
  tenantName: cleanString(120).optional(),
})

// ===== Product =====
export const productCreateSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  name: cleanString(200),
  baseUnit: z.enum(['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct', 'm', 'm2', 'm3']).default('un'),
  barcode: z.string().trim().max(60).optional(),
  categoryId: z.string().uuid().optional(),
  costCents: z.number().int().nonnegative().max(10_000_000_00).optional(),
  priceCents: z.number().int().nonnegative().max(10_000_000_00).optional(),
  stock: z.number().nonnegative().default(0),
  minStock: z.number().nonnegative().default(0),
  active: z.boolean().default(true),
})

export const productUpdateSchema = productCreateSchema.partial()

// ===== Category =====
/** Cor em formato hex (#RRGGBB) — validado para evitar injection. */
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u, 'Cor deve estar no formato #RRGGBB')
  .max(7)

/** Ícone — nome de componente lucide-react. Sanitizado por whitelist. */
const iconSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/u, 'Ícone inválido')

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(80).transform((s) => s.replace(/\0/g, '')),
  description: cleanString(300).optional().nullable(),
  color: hexColorSchema.optional().nullable(),
  icon: iconSchema.optional().nullable(),
})

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).transform((s) => s.replace(/\0/g, '')).optional(),
  description: cleanString(300).optional().nullable(),
  color: hexColorSchema.optional().nullable(),
  icon: iconSchema.optional().nullable(),
  position: z.number().int().nonnegative().optional(),
})

export const categoryDeleteSchema = z.object({
  fallbackCategoryId: z.string().uuid().nullable(), // null = mover para "Sem categoria"
})

export const categoryReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
})

export const bulkMoveProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos 1 item').max(500),
  targetCategoryId: z.string().uuid().nullable(),
})

// ===== Order =====
export const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(10_000),
  unitPriceCents: z.number().int().nonnegative(),
  notes: cleanString(300).optional(),
})

export const orderCreateSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: cleanString(160).optional(),
  customerPhone: z.string().trim().regex(/^[\d\s()+-]*$/, 'Telefone inválido').max(30).optional(),
  channel: z.enum(['balcao', 'ifood', 'rappi', '99eats', 'whatsapp', 'site']).default('balcao'),
  items: z.array(orderItemSchema).min(1, 'Pedido precisa de ao menos 1 item'),
  notes: cleanString(500).optional(),
  deliveryAddress: cleanString(300).optional(),
  deliveryFeeCents: z.number().int().nonnegative().default(0),
})

// ===== Customer =====
export const customerSchema = z.object({
  name: cleanString(160),
  document: z.string().trim().regex(/^[\d.\-/]*$/).max(20).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().regex(/^[\d\s()+-]*$/).max(30).optional(),
  address: cleanString(300).optional(),
  city: cleanString(80).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  zip: z.string().trim().regex(/^[\d-]*$/).max(10).optional(),
  notes: cleanString(500).optional(),
})

// ===== Tenant (admin) =====
export const tenantCreateSchema = z.object({
  name: cleanString(120),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'slug deve ter apenas letras minúsculas, números e hífens'),
  businessType: z.enum(['delivery', 'mercado', 'restaurante', 'varejo', 'farmacia', 'escritorio', 'obra', 'beleza', 'academia', 'escola', 'generico']),
  planId: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
  email: z.string().trim().toLowerCase().email(),
})

// ===== Inventory =====
export const stockMovementSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(100_000),
  type: z.enum(['in', 'out', 'adjustment', 'transfer', 'loss']),
  reason: cleanString(200).optional(),
})

// ===== Supplier =====
/**
 * Fornecedor.
 *
 * - `document` aceita CNPJ (14 dígitos) ou CPF (11 dígitos), com pontuação opcional.
 * - `paymentTerms` descreve condições comerciais em texto livre (ex: "30/60/90 DDL").
 * - `leadTimeDays` é usado pelo agente IA para sugerir pedidos de compra.
 * - `active=false` arquiva o fornecedor sem perder histórico de compras.
 */
export const supplierCreateSchema = z.object({
  name: cleanString(160),
  document: z.string().trim().regex(/^[\d.\-/]*$/, 'Documento inválido').max(20).optional().nullable(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254).optional().nullable(),
  phone: z.string().trim().regex(/^[\d\s()+-]*$/, 'Telefone inválido').max(30).optional().nullable(),
  contactName: cleanString(120).optional().nullable(),
  address: cleanString(300).optional().nullable(),
  city: cleanString(80).optional().nullable(),
  state: z.string().trim().length(2).toUpperCase().optional().nullable(),
  zip: z.string().trim().regex(/^[\d-]*$/).max(10).optional().nullable(),
  paymentTerms: cleanString(200).optional().nullable(),
  leadTimeDays: z.number().int().nonnegative().max(365).optional().nullable(),
  notes: cleanString(500).optional().nullable(),
  active: z.boolean().default(true),
})

export const supplierUpdateSchema = supplierCreateSchema.partial()

// ===== Customer =====
/**
 * Cliente.
 *
 * - `name` é o nome principal (razão social ou nome fantasia).
 * - `taxId`: CNPJ/CPF opcional.
 * - `email`/`phone` validados; pelo menos um contato é recomendado.
 * - `tags` é uma lista de tags curtas (ex: "VIP", "Inadimplente").
 * - `lifecycle`: lead | active | inactive | churned.
 * - `notes` é texto livre para contexto comercial.
 * - `creditLimitCents` permite liberar limite de fiado (opcional).
 */
export const customerCreateSchema = z.object({
  name: cleanString(160),
  tradeName: cleanString(160).optional().nullable(),
  taxId: z.string().trim().regex(/^[\d.\-/]*$/, 'CNPJ/CPF inválido').max(20).optional().nullable(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254).optional().nullable(),
  phone: z.string().trim().regex(/^[\d\s()+-]*$/, 'Telefone inválido').max(30).optional().nullable(),
  whatsapp: z.string().trim().regex(/^[\d\s()+-]*$/, 'WhatsApp inválido').max(30).optional().nullable(),
  address: cleanString(300).optional().nullable(),
  city: cleanString(80).optional().nullable(),
  state: z.string().trim().length(2).toUpperCase().optional().nullable(),
  zip: z.string().trim().regex(/^[\d-]*$/).max(10).optional().nullable(),
  tags: z.array(cleanString(40)).max(20).optional().default([]),
  lifecycle: z.enum(['lead', 'active', 'inactive', 'churned']).default('active'),
  notes: cleanString(1000).optional().nullable(),
  creditLimitCents: z.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  active: z.boolean().default(true),
})

export const customerUpdateSchema = customerCreateSchema.partial()

// ===== Cash Register (Caixa) =====
/**
 * Sessão de caixa.
 *
 * - `openingCents` é o valor inicial (fundo de troco).
 * - `closingCents` é o valor contado no fechamento.
 * - `expectedCents` é o esperado pelo sistema (= opening + sum(movements)).
 * - `differenceCents` = closing - expected (positivo = sobra, negativo = falta).
 * - `status`: 'open' | 'closed'.
 * - `closedAt` é null enquanto aberta.
 */
export const cashSessionCreateSchema = z.object({
  registerName: cleanString(80).default('Caixa Principal'),
  operatorName: cleanString(80),
  openingCents: z.number().int().nonnegative().default(0),
  notes: cleanString(500).optional().nullable(),
})

export const cashSessionCloseSchema = z.object({
  closingCents: z.number().int().nonnegative(),
  notes: cleanString(500).optional().nullable(),
})

/**
 * Movimento de caixa.
 *
 * Tipos:
 * - `sale` — entrada por venda (referência ao pedido)
 * - `withdrawal` — sangria (saída)
 * - `supply` — suprimento (entrada)
 * - `tip` — gorjeta
 * - `adjustment` — ajuste manual
 */
export const cashMovementCreateSchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum(['sale', 'withdrawal', 'supply', 'tip', 'adjustment']),
  amountCents: z.number().int(), // positivo=entrada, negativo=saída
  reason: cleanString(200).optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
})

// ===== Generic ID params =====
export const uuidParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
})

// ===== Purchase Order (Compras) =====
/**
 * Pedido de compra.
 *
 * - `status`: DRAFT → SENT → CONFIRMED → RECEIVED → CANCELED.
 *   - DRAFT: ainda em montagem, sem impacto no estoque.
 *   - SENT: enviado ao fornecedor.
 *   - CONFIRMED: fornecedor confirmou; sem recebimento parcial.
 *   - RECEIVED: mercadoria recebida (gera entrada de estoque).
 *   - CANCELED: cancelado.
 * - `expectedDate`: previsão de entrega (ISO date).
 * - `totalCents`: soma dos items (unitCost * quantity) — recomputado no servidor.
 * - `receivedAt` preenchido quando status passa a RECEIVED.
 */
export const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid(),
  productName: cleanString(200).optional(), // snapshot no momento da criação
  sku: cleanString(60).optional(),
  unitCode: cleanString(10).default('un'),
  quantity: z.number().positive().max(100_000),
  unitCostCents: z.number().int().nonnegative().max(10_000_000_00),
})

export const purchaseOrderCreateSchema = z.object({
  supplierId: z.string().uuid(),
  status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'RECEIVED', 'CANCELED']).default('DRAFT'),
  expectedDate: z.string().optional().nullable(),
  items: z.array(purchaseOrderItemSchema).min(1, 'Pedido precisa de ao menos 1 item').max(500),
  notes: cleanString(500).optional().nullable(),
})

export const purchaseOrderUpdateSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'RECEIVED', 'CANCELED']).optional(),
  expectedDate: z.string().optional().nullable(),
  notes: cleanString(500).optional().nullable(),
})

/** Filtros para listagem. */
export const purchaseOrderListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'RECEIVED', 'CANCELED', 'all']).default('all'),
  supplierId: z.string().uuid().optional(),
})

// ===== Settings: Users =====
export const userRoleSchema = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'STOCK', 'FISCAL', 'KITCHEN', 'DELIVERY', 'VIEWER'])
export const businessTypeSchema = z.enum(['RESTAURANT', 'PIZZARIA', 'BAR', 'BAKERY', 'GROCERY', 'MARKET', 'PHARMACY', 'OTHER'])

// Lista de módulos válidos — espelha o frontend (types/modules.ts).
// Validamos no backend para evitar que o cliente envie módulos inexistentes.
export const moduleIdSchema = z.enum([
  'dashboard', 'orders', 'queue', 'marketplace', 'inventory',
  'purchases', 'customers', 'cash', 'fiscal', 'reports',
  'integrations', 'settings',
  'employees', 'projects', 'appointments', 'subscriptions',
  'production', 'services',
])
export const userModulesSchema = z.array(moduleIdSchema).max(64)

export const userCreateSchema = z.object({
  name: cleanString(200),
  email: z.string().email().max(200),
  password: z.string().min(6).max(100),
  role: userRoleSchema.default('CASHIER'),
  branchId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
  // Módulos permitidos para este usuário.
  // - undefined / [] = herda do tenant (sem restrição por usuário)
  // - lista explícita = restringe aos módulos listados
  enabledModules: userModulesSchema.optional(),
})

export const userUpdateSchema = z.object({
  name: cleanString(200).optional(),
  email: z.string().email().max(200).optional(),
  password: z.string().min(6).max(100).optional(),
  role: userRoleSchema.optional(),
  branchId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
  // null = herdar do tenant (limpa override por usuário)
  // [] explícito = bloqueia tudo (sem módulos)
  // lista explícita = restringe aos módulos listados
  enabledModules: userModulesSchema.nullable().optional(),
})

// ===== Settings: Branches =====
export const branchCreateSchema = z.object({
  name: cleanString(200),
})

export const branchUpdateSchema = z.object({
  name: cleanString(200).optional(),
})

// ===== Settings: Tenant =====
export const tenantBusinessTypeUpdateSchema = z.object({
  businessType: businessTypeSchema,
  legalName: cleanString(200).optional().nullable(),
  tradeName: cleanString(200).optional().nullable(),
  taxId: cleanString(20).optional().nullable(),
})

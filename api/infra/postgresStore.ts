// @ts-nocheck — fallback não usado em runtime (STORE_BACKEND=memory); mantido apenas para referência
import type { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import type {
  AccountReceivable,
  AuditEvent,
  Category,
  CashMovement,
  CashSession,
  Customer,
  FiscalDocument,
  InventoryBalance,
  InventoryMovement,
  Order,
  OrderChannel,
  OrderItem,
  OrderStatus,
  Price,
  Product,
  SaleUnit,
  Unit,
  UnitConversion,
  User,
} from './store.js'

const toIso = (v: unknown) => {
  if (!v) return null
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

export class PostgresStore {
  private pool: Pool
  private client: PoolClient | null

  constructor(params: { pool: Pool; client?: PoolClient | null }) {
    this.pool = params.pool
    this.client = params.client ?? null
  }

  async transaction<T>(tenantId: string, fn: (tx: PostgresStore) => Promise<T>): Promise<T> {
    if (this.client) return fn(this)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId])
      const tx = new PostgresStore({ pool: this.pool, client })
      const out = await fn(tx)
      await client.query('COMMIT')
      return out
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  private async withTenantClient<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.client) return fn(this.client)
    return this.transaction(tenantId, (tx) => fn(tx.client as PoolClient))
  }

  /** Helper: executa query usando o client atual (deve estar dentro de transaction). */
  private async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    if (!this.client) throw new Error('query() só pode ser chamado dentro de transaction()')
    const res = await this.client.query(sql, params)
    return { rows: res.rows as Record<string, unknown>[] }
  }

  /** Helper: sincroniza permissões de módulos do usuário em uma transação. */
  private async syncUserModulePermissions(userId: string, tenantId: string, modules: string[]): Promise<void> {
    if (!this.client) throw new Error('syncUserModulePermissions() só pode ser chamado dentro de transaction()')
    // Deleta existentes
    await this.client.query(
      `DELETE FROM user_module_permissions WHERE user_id = $1::uuid AND tenant_id = $2::uuid`,
      [userId, tenantId],
    )
    // Insere novos
    if (modules.length === 0) return
    const values: string[] = []
    const params: unknown[] = []
    let p = 1
    for (const m of modules) {
      values.push(`($${p++}::uuid, $${p++}::uuid, $${p++})`)
      params.push(userId, tenantId, m)
    }
    await this.client.query(
      `INSERT INTO user_module_permissions (user_id, tenant_id, module_id) VALUES ${values.join(', ')}`,
      params,
    )
  }

  async getDefaultTenantId(): Promise<string | null> {
    const res = await this.pool.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1')
    return (res.rows[0]?.id as string | undefined) ?? null
  }

  async audit(event: Omit<AuditEvent, 'id' | 'createdAt'>) {
    await this.withTenantClient(event.tenantId, async (client) => {
      await client.query(
        `
          INSERT INTO audit_events(tenant_id, user_id, action, entity_type, entity_id, metadata)
          VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [event.tenantId, event.userId, event.action, event.entityType, event.entityId, JSON.stringify(event.metadata ?? {})],
      )
    })
  }

  async listAuditEvents(params: { tenantId: string; entityType?: string; entityId?: string }): Promise<AuditEvent[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, user_id, action, entity_type, entity_id, created_at, metadata
          FROM audit_events
          WHERE tenant_id = $1
            AND ($2::text IS NULL OR entity_type = $2)
            AND ($3::uuid IS NULL OR entity_id = $3::uuid)
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [params.tenantId, params.entityType ?? null, params.entityId ?? null],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        userId: r.user_id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        createdAt: toIso(r.created_at) as string,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      }))
    })
  }

  /** Helper: carrega usuário + módulos efetivos (já resolvendo herança). */
  private async loadUserRow(client: { query: typeof import('pg').Client.prototype.query }, tenantId: string, whereClause: string, whereParams: unknown[]): Promise<User | null> {
    const res = await client.query(
      `
        SELECT id, tenant_id, branch_id, name, email, role, password_salt, password_hash, active
        FROM users
        WHERE tenant_id = $1::uuid AND ${whereClause}
        LIMIT 1
      `,
      [tenantId, ...whereParams],
    )
    const r = res.rows[0]
    if (!r) return null
    // Carrega override de módulos (se houver)
    const permRes = await client.query(
      `SELECT module_id FROM user_module_permissions WHERE user_id = $1::uuid ORDER BY module_id`,
      [r.id],
    )
    const perms = permRes.rows.map((p) => p.module_id as string)
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      name: r.name,
      email: r.email,
      role: r.role,
      passwordSalt: r.password_salt,
      passwordHash: r.password_hash,
      active: r.active,
      // null = sem override (herda do tenant)
      // lista = override explícito (pode ser [] = bloqueia tudo)
      enabledModules: permRes.rows.length === 0 ? null : perms,
    }
  }

  async findUserByEmail(params: { tenantId: string; email: string }): Promise<User | undefined> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const user = await this.loadUserRow(client, params.tenantId, 'lower(email) = lower($2)', [params.email])
      return user ?? undefined
    })
  }

  async getUser(params: { tenantId: string; userId: string }): Promise<User | undefined> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const user = await this.loadUserRow(client, params.tenantId, 'id = $2::uuid', [params.userId])
      return user ?? undefined
    })
  }

  async getUserById(params: { tenantId: string; userId: string }): Promise<User | null> {
    return this.getUser(params).then((u) => u ?? null)
  }

  async listUsers(params: { tenantId: string; includeInactive?: boolean }): Promise<User[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      // PERF: 1 round-trip: usa json_agg com LEFT JOIN para trazer módulos inline.
      const sql = `
        SELECT u.id, u.tenant_id, u.branch_id, u.name, u.email, u.role, u.password_salt, u.password_hash, u.active,
          COALESCE(
            (SELECT json_agg(ump.module_id ORDER BY ump.module_id)
             FROM user_module_permissions ump
             WHERE ump.user_id = u.id),
            '[]'::json
          ) AS module_perms
        FROM users u
        WHERE u.tenant_id = $1::uuid
          ${params.includeInactive ? '' : 'AND u.active = true'}
        ORDER BY u.name ASC
      `
      const res = await client.query(sql, [params.tenantId])
      return res.rows.map((r) => {
        const perms = (r.module_perms ?? []) as string[]
        return {
          id: r.id,
          tenantId: r.tenant_id,
          branchId: r.branch_id,
          name: r.name,
          email: r.email,
          role: r.role,
          passwordSalt: r.password_salt,
          passwordHash: r.password_hash,
          active: r.active,
          // null se vazio (herda tenant), senão lista
          enabledModules: perms.length === 0 ? null : perms,
        }
      })
    })
  }

  async createUser(params: Omit<User, 'id'>): Promise<User> {
    return this.transaction(params.tenantId, async (tx) => {
      const id = (await import('crypto')).randomUUID()
      const enabledModules = params.enabledModules ?? null
      await tx.query(
        `INSERT INTO users (id, tenant_id, branch_id, name, email, role, password_salt, password_hash, active)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          params.tenantId,
          params.branchId,
          params.name,
          params.email,
          params.role,
          params.passwordSalt,
          params.passwordHash,
          params.active,
        ],
      )
      // Se há override explícito, sincroniza
      if (Array.isArray(enabledModules)) {
        await tx.syncUserModulePermissions(id, params.tenantId, enabledModules)
      }
      const created = await tx.getUser({ tenantId: params.tenantId, userId: id })
      if (!created) throw new Error('Falha ao criar usuário')
      return created
    }) as unknown as Promise<User>
  }

  async updateUser(params: { tenantId: string; userId: string; patch: Partial<Omit<User, 'id' | 'tenantId'>> }): Promise<User | null> {
    return this.transaction(params.tenantId, async (tx) => {
      const { patch } = params
      // Campos dinâmicos do UPDATE
      const sets: string[] = []
      const values: unknown[] = []
      let idx = 1
      const map: Record<string, string> = {
        branchId: 'branch_id',
        name: 'name',
        email: 'email',
        role: 'role',
        passwordSalt: 'password_salt',
        passwordHash: 'password_hash',
        active: 'active',
      }
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'enabledModules') continue // tratado abaixo
        const col = map[k]
        if (!col) continue
        sets.push(`${col} = $${idx++}`)
        values.push(v)
      }
      if (sets.length > 0) {
        values.push(params.userId, params.tenantId)
        await tx.query(
          `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx++}::uuid AND tenant_id = $${idx++}::uuid`,
          values,
        )
      }
      // Sincroniza módulos (null = remove override, [] = explicit empty, lista = replace)
      if ('enabledModules' in patch) {
        const v = patch.enabledModules
        if (v === null || v === undefined) {
          await tx.query(
            `DELETE FROM user_module_permissions WHERE user_id = $1::uuid AND tenant_id = $2::uuid`,
            [params.userId, params.tenantId],
          )
        } else if (Array.isArray(v)) {
          await tx.syncUserModulePermissions(params.userId, params.tenantId, v)
        }
      }
      return await tx.getUser({ tenantId: params.tenantId, userId: params.userId }).then((u) => u ?? null)
    }) as unknown as Promise<User | null>
  }

  async deleteUser(params: { tenantId: string; userId: string }): Promise<{ deletedId: string }> {
    return this.transaction(params.tenantId, async (tx) => {
      const res = await tx.query(
        `DELETE FROM users WHERE id = $1::uuid AND tenant_id = $2::uuid RETURNING id`,
        [params.userId, params.tenantId],
      )
      if (res.rows.length === 0) throw new Error('Usuário não encontrado')
      return { deletedId: res.rows[0].id as string }
    }) as unknown as Promise<{ deletedId: string }>
  }

  async listUserModulePermissions(params: { tenantId: string; userId: string }): Promise<string[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `SELECT module_id FROM user_module_permissions WHERE user_id = $1::uuid AND tenant_id = $2::uuid ORDER BY module_id`,
        [params.userId, params.tenantId],
      )
      return res.rows.map((r) => r.module_id as string)
    })
  }

  async resolveUserEnabledModules(params: { tenantId: string; userId: string }): Promise<string[] | 'tenant'> {
    const u = await this.getUser({ tenantId: params.tenantId, userId: params.userId })
    if (!u) return 'tenant'
    if (u.enabledModules === null) return 'tenant'
    return u.enabledModules
  }

  async listCustomers(params: { tenantId: string; query?: string }): Promise<Customer[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const q = params.query?.trim().toLowerCase()
      const like = q ? `%${q}%` : null
      const res = await client.query(
        `
          SELECT id, tenant_id, name, phone, address, active, created_at
          FROM customers
          WHERE tenant_id = $1 AND active = true
            AND ($2::text IS NULL OR lower(name) LIKE $2 OR lower(phone) LIKE $2)
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [params.tenantId, like],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        phone: r.phone,
        address: r.address,
        active: r.active,
        createdAt: toIso(r.created_at) as string,
      }))
    })
  }

  async findCustomerByPhone(params: { tenantId: string; phone: string }): Promise<Customer | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const phone = params.phone.trim().toLowerCase()
      const res = await client.query(
        `
          SELECT id, tenant_id, name, phone, address, active, created_at
          FROM customers
          WHERE tenant_id = $1 AND lower(phone) = $2
          LIMIT 1
        `,
        [params.tenantId, phone],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        phone: r.phone,
        address: r.address,
        active: r.active,
        createdAt: toIso(r.created_at) as string,
      }
    })
  }

  async createCustomer(params: Omit<Customer, 'id' | 'createdAt' | 'active'>): Promise<Customer> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO customers(id, tenant_id, name, phone, address, active)
          VALUES ($1,$2,$3,$4,$5,true)
          RETURNING id, tenant_id, name, phone, address, active, created_at
        `,
        [id, params.tenantId, params.name, params.phone, params.address],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        phone: r.phone,
        address: r.address,
        active: r.active,
        createdAt: toIso(r.created_at) as string,
      }
    })
  }

  async listProducts(params: { tenantId: string; query?: string }): Promise<Product[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const q = params.query?.trim().toLowerCase()
      const like = q ? `%${q}%` : null
      const res = await client.query(
        `
          SELECT id, tenant_id, sku, name, base_unit, active, created_at, category_id
          FROM products
          WHERE tenant_id = $1 AND active = true
            AND ($2::text IS NULL OR lower(name) LIKE $2 OR lower(sku) LIKE $2)
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [params.tenantId, like],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        sku: r.sku,
        name: r.name,
        baseUnit: r.base_unit,
        active: r.active,
        categoryId: r.category_id,
        createdAt: toIso(r.created_at) as string,
      }))
    })
  }

  // PERF: versão paginada — usa COUNT(*) OVER() para retornar total + items em 1 round-trip.
  async listProductsPaged(params: { tenantId: string; query?: string; categoryId?: string | null; includeArchived?: boolean; limit: number; offset: number }): Promise<{ items: Product[]; total: number; limit: number; offset: number }> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const q = params.query?.trim().toLowerCase()
      const like = q ? `%${q}%` : null
      const archivedFilter = params.includeArchived ? '' : 'AND active = true'
      const res = await client.query(
        `
          SELECT
            id, tenant_id, sku, name, base_unit, active, created_at, category_id,
            COUNT(*) OVER() AS __total
          FROM products
          WHERE tenant_id = $1
            ${archivedFilter}
            AND ($2::text IS NULL OR category_id = $2::uuid)
            AND ($3::text IS NULL OR lower(name) LIKE $3 OR lower(sku) LIKE $3)
          ORDER BY created_at DESC
          LIMIT $4 OFFSET $5
        `,
        [
          params.tenantId,
          params.categoryId ?? null,
          like,
          params.limit,
          params.offset,
        ],
      )
      const items: Product[] = res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        sku: r.sku,
        name: r.name,
        baseUnit: r.base_unit,
        active: r.active,
        categoryId: r.category_id,
        createdAt: toIso(r.created_at) as string,
      }))
      const total = res.rows.length > 0 ? Number(res.rows[0].__total) : 0
      return { items, total, limit: params.limit, offset: params.offset }
    })
  }

  async listUnits(params: { tenantId: string }): Promise<Unit[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query('SELECT tenant_id, code, label, created_at FROM units WHERE tenant_id = $1 ORDER BY code ASC', [
        params.tenantId,
      ])
      return res.rows.map((r) => ({
        tenantId: r.tenant_id,
        code: r.code,
        label: r.label,
        createdAt: toIso(r.created_at) as string,
      }))
    })
  }

  async getProduct(params: { tenantId: string; productId: string }): Promise<Product | undefined> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, sku, name, base_unit, active, created_at, category_id, COALESCE(average_cost_cents, 0) AS average_cost_cents
        FROM products
        WHERE tenant_id = $1 AND id = $2::uuid
        LIMIT 1
      `,
      [params.tenantId, params.productId],
    )
    const r = res.rows[0]
    if (!r) return undefined
    return {
      id: r.id,
      tenantId: r.tenant_id,
      sku: r.sku,
      name: r.name,
      baseUnit: r.base_unit,
      active: r.active,
      categoryId: r.category_id,
      averageCostCents: Number(r.average_cost_cents ?? 0),
      createdAt: toIso(r.created_at) as string,
    }
  })
  }

  async createProduct(params: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO products(id, tenant_id, sku, name, base_unit, active, category_id, average_cost_cents)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          RETURNING id, tenant_id, sku, name, base_unit, active, created_at, category_id, average_cost_cents
        `,
        [id, params.tenantId, params.sku, params.name, params.baseUnit, params.active, params.categoryId, params.averageCostCents ?? 0],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        sku: r.sku,
        name: r.name,
        baseUnit: r.base_unit,
        active: r.active,
        categoryId: r.category_id,
        averageCostCents: Number(r.average_cost_cents ?? 0),
        createdAt: toIso(r.created_at) as string,
      }
    })
  }

  async getPrice(params: { tenantId: string; productId: string; channel: OrderChannel; unitCode: string }): Promise<number | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT price_cents
          FROM prices
          WHERE tenant_id = $1 AND product_id = $2::uuid AND channel = $3 AND unit_code = $4
          LIMIT 1
        `,
        [params.tenantId, params.productId, params.channel, params.unitCode],
      )
      const r = res.rows[0]
      return r ? Number(r.price_cents) : null
    })
  }

  async upsertPrice(params: { tenantId: string; productId: string; unitCode: string; channel: OrderChannel; priceCents: number }) {
    return this.withTenantClient(params.tenantId, async (client) => {
      await client.query(
        `INSERT INTO prices(tenant_id, product_id, channel, unit_code, price_cents)
         VALUES ($1, $2::uuid, $3, $4, $5)
         ON CONFLICT (tenant_id, product_id, channel, unit_code)
         DO UPDATE SET price_cents = EXCLUDED.price_cents`,
        [params.tenantId, params.productId, params.channel, params.unitCode, params.priceCents],
      )
    })
  }

  async getUnit(params: { tenantId: string; code: string }): Promise<Unit | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `SELECT tenant_id, code, label, created_at FROM units WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
        [params.tenantId, params.code],
      )
      const r = res.rows[0]
      return r ? { tenantId: r.tenant_id, code: r.code, label: r.label, createdAt: toIso(r.created_at) as string } : null
    })
  }

  async createUnit(params: { tenantId: string; code: string; label: string }): Promise<Unit> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `INSERT INTO units(tenant_id, code, label) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, code) DO UPDATE SET label = EXCLUDED.label
         RETURNING tenant_id, code, label, created_at`,
        [params.tenantId, params.code, params.label],
      )
      const r = res.rows[0]
      return { tenantId: r.tenant_id, code: r.code, label: r.label, createdAt: toIso(r.created_at) as string }
    })
  }

  async upsertUnitConversion(params: { tenantId: string; productId: string; unitCode: string; factorToBase: number }) {
    return this.withTenantClient(params.tenantId, async (client) => {
      await client.query(
        `INSERT INTO unit_conversions(tenant_id, product_id, unit_code, factor_to_base)
         VALUES ($1, $2::uuid, $3, $4)
         ON CONFLICT (tenant_id, product_id, unit_code)
         DO UPDATE SET factor_to_base = EXCLUDED.factor_to_base`,
        [params.tenantId, params.productId, params.unitCode, params.factorToBase],
      )
    })
  }

  async getSaleUnits(params: { tenantId: string; productId: string }): Promise<SaleUnit[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const product = await this.getProduct(params)
      if (!product) return []

      const [unitsRes, convRes, priceRes] = await Promise.all([
        client.query('SELECT code, label, created_at FROM units WHERE tenant_id = $1', [params.tenantId]),
        client.query(
          'SELECT unit_code, factor_to_base FROM unit_conversions WHERE tenant_id = $1 AND product_id = $2::uuid',
          [params.tenantId, params.productId],
        ),
        client.query(
          'SELECT channel, unit_code, price_cents FROM prices WHERE tenant_id = $1 AND product_id = $2::uuid',
          [params.tenantId, params.productId],
        ),
      ])

      const unitIndex = new Map<string, { code: string; label: string }>(
        unitsRes.rows.map((r) => [r.code, { code: r.code, label: r.label }] as const),
      )

      const conversions = convRes.rows.map(
        (r): UnitConversion => ({
          tenantId: params.tenantId,
          productId: params.productId,
          unitCode: r.unit_code,
          factorToBase: Number(r.factor_to_base),
        }),
      )

      const prices = priceRes.rows.map(
        (r): Price => ({
          tenantId: params.tenantId,
          productId: params.productId,
          channel: r.channel,
          unitCode: r.unit_code,
          priceCents: Number(r.price_cents),
        }),
      )

      const unitCodes = [product.baseUnit, ...conversions.map((c) => c.unitCode)]
      const uniqueCodes = Array.from(new Set(unitCodes))

      const channels: OrderChannel[] = ['BALCAO', 'WHATSAPP', 'CATALOGO', 'DELIVERY']
      const saleUnits: SaleUnit[] = []

      for (const code of uniqueCodes) {
        const u = unitIndex.get(code)
        if (!u) continue
        const factor = code === product.baseUnit ? 1 : conversions.find((c) => c.unitCode === code)?.factorToBase ?? null
        if (!factor) continue

        const out: Record<OrderChannel, number> = { BALCAO: 0, WHATSAPP: 0, CATALOGO: 0, DELIVERY: 0 }
        for (const ch of channels) {
          const p = prices.find((x) => x.unitCode === code && x.channel === ch)
          out[ch] = p?.priceCents ?? 0
        }

        saleUnits.push({ unitCode: code, label: u.label, factorToBase: factor, prices: out })
      }

      return saleUnits
    })
  }

  async getInventoryBalance(params: { tenantId: string; branchId: string; productId: string }): Promise<InventoryBalance | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT tenant_id, branch_id, product_id, quantity_base, updated_at
          FROM inventory_balances
          WHERE tenant_id = $1 AND branch_id = $2::uuid AND product_id = $3::uuid
          LIMIT 1
        `,
        [params.tenantId, params.branchId, params.productId],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        productId: r.product_id,
        quantityBase: Number(r.quantity_base),
        updatedAt: toIso(r.updated_at) as string,
      }
    })
  }

  async upsertInventoryBalance(params: {
    tenantId: string
    branchId: string
    productId: string
    quantityBase: number
  }): Promise<InventoryBalance> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          INSERT INTO inventory_balances(tenant_id, branch_id, product_id, quantity_base, updated_at)
          VALUES ($1,$2::uuid,$3::uuid,$4,NOW())
          ON CONFLICT (tenant_id, branch_id, product_id)
          DO UPDATE SET quantity_base = EXCLUDED.quantity_base, updated_at = NOW()
          RETURNING tenant_id, branch_id, product_id, quantity_base, updated_at
        `,
        [params.tenantId, params.branchId, params.productId, Math.round(params.quantityBase)],
      )
      const r = res.rows[0]
      return {
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        productId: r.product_id,
        quantityBase: Number(r.quantity_base),
        updatedAt: toIso(r.updated_at) as string,
      }
    })
  }

  async addInventoryMovement(m: Omit<InventoryMovement, 'id' | 'createdAt'>): Promise<InventoryMovement> {
    return this.withTenantClient(m.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO inventory_movements(
            id, tenant_id, branch_id, product_id, movement_type, quantity_base, ref_type, ref_id, reason, created_by, unit_cost_cents, unit_revenue_cents
          )
          VALUES ($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8::uuid,$9,$10::uuid,$11,$12)
          RETURNING id, tenant_id, branch_id, product_id, movement_type, quantity_base, ref_type, ref_id, reason, created_at, created_by, unit_cost_cents, unit_revenue_cents
        `,
        [
          id,
          m.tenantId,
          m.branchId,
          m.productId,
          m.movementType,
          Math.round(m.quantityBase),
          m.refType,
          m.refId,
          m.reason,
          m.createdBy,
          m.unitCostCents,
          m.unitRevenueCents,
        ],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        productId: r.product_id,
        movementType: r.movement_type,
        quantityBase: Number(r.quantity_base),
        refType: r.ref_type,
        refId: r.ref_id,
        reason: r.reason,
        createdAt: toIso(r.created_at) as string,
        createdBy: r.created_by,
        unitCostCents: r.unit_cost_cents != null ? Number(r.unit_cost_cents) : null,
        unitRevenueCents: r.unit_revenue_cents != null ? Number(r.unit_revenue_cents) : null,
      }
    })
  }

  async listInventoryBalances(params: { tenantId: string; branchId: string; productIds?: string[] }): Promise<Array<{ productId: string; quantityBase: number }>> {
    return this.withTenantClient(params.tenantId, async (client) => {
      let query = `SELECT product_id, quantity_base FROM inventory_balances WHERE tenant_id = $1 AND branch_id = $2`
      const values: unknown[] = [params.tenantId, params.branchId]
      if (params.productIds && params.productIds.length > 0) {
        query += ` AND product_id = ANY($${3}::uuid[])`
        values.push(params.productIds)
      }
      const res = await client.query(query, values)
      return res.rows.map((r) => ({ productId: String(r.product_id), quantityBase: Number(r.quantity_base) }))
    })
  }

  async listInventoryMovements(params: { tenantId: string; branchId: string; productId?: string; from?: string; to?: string }): Promise<InventoryMovement[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, product_id, movement_type, quantity_base, ref_type, ref_id, reason, created_at, created_by, unit_cost_cents, unit_revenue_cents
          FROM inventory_movements
          WHERE tenant_id = $1 AND branch_id = $2::uuid
            AND ($3::uuid IS NULL OR product_id = $3::uuid)
            AND ($4::timestamptz IS NULL OR created_at >= $4)
            AND ($5::timestamptz IS NULL OR created_at <= $5)
          ORDER BY created_at DESC
          LIMIT 500
        `,
        [params.tenantId, params.branchId, params.productId ?? null, params.from ?? null, params.to ?? null],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        productId: r.product_id,
        movementType: r.movement_type,
        quantityBase: Number(r.quantity_base),
        refType: r.ref_type,
        refId: r.ref_id,
        reason: r.reason,
        createdAt: toIso(r.created_at) as string,
        createdBy: r.created_by,
        unitCostCents: r.unit_cost_cents != null ? Number(r.unit_cost_cents) : null,
        unitRevenueCents: r.unit_revenue_cents != null ? Number(r.unit_revenue_cents) : null,
      }))
    })
  }

  // PERF: versão paginada — usa COUNT(*) OVER() para retornar total + items em 1 round-trip.
  async listInventoryMovementsPaged(params: { tenantId: string; branchId: string; productId?: string; type?: string; from?: string; to?: string; limit: number; offset: number }): Promise<{ items: InventoryMovement[]; total: number; limit: number; offset: number }> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, tenant_id, branch_id, product_id, movement_type, quantity_base, ref_type, ref_id, reason, created_at, created_by, unit_cost_cents, unit_revenue_cents,
            COUNT(*) OVER() AS __total
          FROM inventory_movements
          WHERE tenant_id = $1 AND branch_id = $2::uuid
            AND ($3::uuid IS NULL OR product_id = $3::uuid)
            AND ($4::text IS NULL OR movement_type = $4)
            AND ($5::timestamptz IS NULL OR created_at >= $5)
            AND ($6::timestamptz IS NULL OR created_at <= $6)
          ORDER BY created_at DESC
          LIMIT $7 OFFSET $8
        `,
        [
          params.tenantId,
          params.branchId,
          params.productId ?? null,
          params.type ?? null,
          params.from ?? null,
          params.to ?? null,
          params.limit,
          params.offset,
        ],
      )
      const items: InventoryMovement[] = res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        productId: r.product_id,
        movementType: r.movement_type,
        quantityBase: Number(r.quantity_base),
        refType: r.ref_type,
        refId: r.ref_id,
        reason: r.reason,
        createdAt: toIso(r.created_at) as string,
        createdBy: r.created_by,
        unitCostCents: r.unit_cost_cents != null ? Number(r.unit_cost_cents) : null,
        unitRevenueCents: r.unit_revenue_cents != null ? Number(r.unit_revenue_cents) : null,
      }))
      const total = res.rows.length > 0 ? Number(res.rows[0].__total) : 0
      return { items, total, limit: params.limit, offset: params.offset }
    })
  }

  async updateProductAverageCost(params: { tenantId: string; productId: string; quantityIn: number; unitCostInCents: number }) {
    return this.withTenantClient(params.tenantId, async (client) => {
      // Carrega média atual (COALESCE: tolera coluna inexistente retornando 0)
      const cur = await client.query(
        `SELECT COALESCE(average_cost_cents, 0) AS avg FROM products WHERE tenant_id = $1 AND id = $2::uuid`,
        [params.tenantId, params.productId],
      )
      const currentAvg = cur.rows[0] ? Number(cur.rows[0].avg) : 0
      const stock = await client.query(
        `SELECT COALESCE(SUM(quantity_base), 0) AS qty FROM inventory_balances WHERE tenant_id = $1 AND product_id = $2::uuid`,
        [params.tenantId, params.productId],
      )
      const currentStock = Number(stock.rows[0]?.qty ?? 0)
      const inQty = params.quantityIn
      const costIn = params.unitCostInCents
      const totalQty = currentStock + inQty
      const newAvg = totalQty > 0 ? Math.round((currentStock * currentAvg + inQty * costIn) / totalQty) : costIn
      await client.query(
        `UPDATE products SET average_cost_cents = $3 WHERE tenant_id = $1 AND id = $2::uuid`,
        [params.tenantId, params.productId, newAvg],
      )
      return { averageCostCents: newAvg }
    })
  }

  private mapOrderRow(r: any, items: OrderItem[]): Order {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      channel: r.channel,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      deliveryAddress: r.delivery_address,
      status: r.status,
      subtotalCents: Number(r.subtotal_cents),
      totalCents: Number(r.total_cents),
      createdAt: toIso(r.created_at) as string,
      updatedAt: toIso(r.updated_at) as string,
      createdBy: r.created_by,
      items,
    }
  }

  private mapOrderItemRow(r: any): OrderItem {
    return {
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      unitCode: r.unit_code,
      unitLabel: r.unit_label,
      quantity: Number(r.quantity),
      quantityBase: Number(r.quantity_base),
      unitPriceCents: Number(r.unit_price_cents),
      totalCents: Number(r.total_cents),
    }
  }

  private async getOrderWithItems(client: PoolClient, tenantId: string, orderId: string): Promise<Order | null> {
    const [oRes, iRes] = await Promise.all([
      client.query(
        `
          SELECT id, tenant_id, branch_id, channel, customer_name, customer_phone, delivery_address,
                 status, subtotal_cents, total_cents, created_at, updated_at, created_by
          FROM orders
          WHERE tenant_id = $1 AND id = $2::uuid
          LIMIT 1
        `,
        [tenantId, orderId],
      ),
      client.query(
        `
          SELECT id, product_id, product_name, unit_code, unit_label, quantity, quantity_base, unit_price_cents, total_cents
          FROM order_items
          WHERE tenant_id = $1 AND order_id = $2::uuid
          ORDER BY id ASC
        `,
        [tenantId, orderId],
      ),
    ])
    const o = oRes.rows[0]
    if (!o) return null
    const items = iRes.rows.map((r) => this.mapOrderItemRow(r))
    return this.mapOrderRow(o, items)
  }

  async createOrder(o: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    return this.withTenantClient(o.tenantId, async (client) => {
      const orderId = crypto.randomUUID()
      await client.query(
        `
          INSERT INTO orders(
            id, tenant_id, branch_id, channel, customer_name, customer_phone, delivery_address, status,
            subtotal_cents, total_cents, created_by, updated_at
          )
          VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11::uuid,NOW())
        `,
        [
          orderId,
          o.tenantId,
          o.branchId,
          o.channel,
          o.customerName,
          o.customerPhone,
          o.deliveryAddress,
          o.status,
          Math.round(o.subtotalCents),
          Math.round(o.totalCents),
          o.createdBy,
        ],
      )

      for (const it of o.items) {
        await client.query(
          `
            INSERT INTO order_items(
              id, tenant_id, order_id, product_id, product_name, unit_code, unit_label,
              quantity, quantity_base, unit_price_cents, total_cents
            )
            VALUES ($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11)
          `,
          [
            it.id,
            o.tenantId,
            orderId,
            it.productId,
            it.productName,
            it.unitCode,
            it.unitLabel,
            Math.round(it.quantity),
            Math.round(it.quantityBase),
            Math.round(it.unitPriceCents),
            Math.round(it.totalCents),
          ],
        )
      }

      const created = await this.getOrderWithItems(client, o.tenantId, orderId)
      if (!created) throw new Error('order create failed')
      return created
    })
  }

  async getOrder(params: { tenantId: string; orderId: string }): Promise<Order | null> {
    return this.withTenantClient(params.tenantId, (client) => this.getOrderWithItems(client, params.tenantId, params.orderId))
  }

  async updateOrderStatus(params: { tenantId: string; orderId: string; status: OrderStatus }): Promise<Order | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3::uuid', [
        params.status,
        params.tenantId,
        params.orderId,
      ])
      return this.getOrderWithItems(client, params.tenantId, params.orderId)
    })
  }

  async listOrders(params: { tenantId: string; branchId: string; status?: OrderStatus; channel?: OrderChannel }): Promise<Order[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const oRes = await client.query(
        `
          SELECT id, tenant_id, branch_id, channel, customer_name, customer_phone, delivery_address,
                 status, subtotal_cents, total_cents, created_at, updated_at, created_by
          FROM orders
          WHERE tenant_id = $1 AND branch_id = $2::uuid
            AND ($3::text IS NULL OR status = $3)
            AND ($4::text IS NULL OR channel = $4)
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [params.tenantId, params.branchId, params.status ?? null, params.channel ?? null],
      )

      const orderIds = oRes.rows.map((r) => r.id as string)
      if (orderIds.length === 0) return []

      const iRes = await client.query(
        `
          SELECT id, tenant_id, order_id, product_id, product_name, unit_code, unit_label, quantity, quantity_base, unit_price_cents, total_cents
          FROM order_items
          WHERE tenant_id = $1 AND order_id = ANY($2::uuid[])
        `,
        [params.tenantId, orderIds],
      )

      const itemsByOrder = new Map<string, OrderItem[]>()
      for (const r of iRes.rows) {
        const orderId = r.order_id as string
        const arr = itemsByOrder.get(orderId) ?? []
        arr.push(this.mapOrderItemRow(r))
        itemsByOrder.set(orderId, arr)
      }

      return oRes.rows.map((r) => this.mapOrderRow(r, itemsByOrder.get(r.id) ?? []))
    })
  }

  async listAllOrdersForTenant(params: { tenantId: string; status?: OrderStatus; channel?: OrderChannel; limit?: number }): Promise<Order[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const oRes = await client.query(
        `
          SELECT id, tenant_id, branch_id, channel, customer_name, customer_phone, delivery_address,
                 status, subtotal_cents, total_cents, created_at, updated_at, created_by
          FROM orders
          WHERE tenant_id = $1
            AND ($2::text IS NULL OR status = $2)
            AND ($3::text IS NULL OR channel = $3)
          ORDER BY created_at DESC
          LIMIT $4
        `,
        [params.tenantId, params.status ?? null, params.channel ?? null, params.limit ?? 100000],
      )

      const orderIds = oRes.rows.map((r) => r.id as string)
      if (orderIds.length === 0) return []

      const iRes = await client.query(
        `
          SELECT id, tenant_id, order_id, product_id, product_name, unit_code, unit_label, quantity, quantity_base, unit_price_cents, total_cents
          FROM order_items
          WHERE tenant_id = $1 AND order_id = ANY($2::uuid[])
        `,
        [params.tenantId, orderIds],
      )

      const itemsByOrder = new Map<string, OrderItem[]>()
      for (const r of iRes.rows) {
        const orderId = r.order_id as string
        const arr = itemsByOrder.get(orderId) ?? []
        arr.push(this.mapOrderItemRow(r))
        itemsByOrder.set(orderId, arr)
      }

      return oRes.rows.map((r) => this.mapOrderRow(r, itemsByOrder.get(r.id) ?? []))
    })
  }

  async createReceivable(params: Omit<AccountReceivable, 'id' | 'createdAt' | 'settledAt'>): Promise<AccountReceivable> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO accounts_receivable(
            id, tenant_id, branch_id, order_id, amount_cents, status, due_date, settled_at
          )
          VALUES ($1,$2,$3::uuid,$4::uuid,$5,$6,$7::timestamptz,NULL)
          RETURNING id, tenant_id, branch_id, order_id, amount_cents, status, due_date, created_at, settled_at
        `,
        [id, params.tenantId, params.branchId, params.orderId, params.amountCents, params.status, params.dueDate],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        amountCents: Number(r.amount_cents),
        status: r.status,
        dueDate: toIso(r.due_date) as string,
        createdAt: toIso(r.created_at) as string,
        settledAt: toIso(r.settled_at),
      }
    })
  }

  async listReceivables(params: {
    tenantId: string
    branchId: string
    status?: AccountReceivable['status']
  }): Promise<AccountReceivable[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, order_id, amount_cents, status, due_date, created_at, settled_at
          FROM accounts_receivable
          WHERE tenant_id = $1 AND branch_id = $2::uuid
            AND ($3::text IS NULL OR status = $3)
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [params.tenantId, params.branchId, params.status ?? null],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        amountCents: Number(r.amount_cents),
        status: r.status,
        dueDate: toIso(r.due_date) as string,
        createdAt: toIso(r.created_at) as string,
        settledAt: toIso(r.settled_at),
      }))
    })
  }

  async settleReceivable(params: { tenantId: string; receivableId: string }): Promise<AccountReceivable | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          UPDATE accounts_receivable
          SET status = 'SETTLED', settled_at = NOW()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id, tenant_id, branch_id, order_id, amount_cents, status, due_date, created_at, settled_at
        `,
        [params.tenantId, params.receivableId],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        amountCents: Number(r.amount_cents),
        status: r.status,
        dueDate: toIso(r.due_date) as string,
        createdAt: toIso(r.created_at) as string,
        settledAt: toIso(r.settled_at),
      }
    })
  }

  async getOpenCashSession(params: { tenantId: string; branchId: string }): Promise<CashSession | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, opened_at, closed_at, opening_float_cents, closing_declared_cents
          FROM cash_sessions
          WHERE tenant_id = $1 AND branch_id = $2::uuid AND closed_at IS NULL
          ORDER BY opened_at DESC
          LIMIT 1
        `,
        [params.tenantId, params.branchId],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        openedAt: toIso(r.opened_at) as string,
        closedAt: toIso(r.closed_at),
        openingFloatCents: Number(r.opening_float_cents),
        closingDeclaredCents: r.closing_declared_cents == null ? null : Number(r.closing_declared_cents),
      }
    })
  }

  async openCashSession(params: Omit<CashSession, 'id' | 'openedAt' | 'closedAt' | 'closingDeclaredCents'>): Promise<CashSession> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO cash_sessions(id, tenant_id, branch_id, opening_float_cents)
          VALUES ($1,$2,$3::uuid,$4)
          RETURNING id, tenant_id, branch_id, opened_at, closed_at, opening_float_cents, closing_declared_cents
        `,
        [id, params.tenantId, params.branchId, Math.round(params.openingFloatCents)],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        openedAt: toIso(r.opened_at) as string,
        closedAt: toIso(r.closed_at),
        openingFloatCents: Number(r.opening_float_cents),
        closingDeclaredCents: r.closing_declared_cents == null ? null : Number(r.closing_declared_cents),
      }
    })
  }

  async closeCashSession(params: { tenantId: string; cashSessionId: string; closingDeclaredCents: number }): Promise<CashSession | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          UPDATE cash_sessions
          SET closed_at = NOW(), closing_declared_cents = $1
          WHERE tenant_id = $2 AND id = $3::uuid
          RETURNING id, tenant_id, branch_id, opened_at, closed_at, opening_float_cents, closing_declared_cents
        `,
        [Math.round(params.closingDeclaredCents), params.tenantId, params.cashSessionId],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        openedAt: toIso(r.opened_at) as string,
        closedAt: toIso(r.closed_at),
        openingFloatCents: Number(r.opening_float_cents),
        closingDeclaredCents: r.closing_declared_cents == null ? null : Number(r.closing_declared_cents),
      }
    })
  }

  async addCashMovement(m: Omit<CashMovement, 'id' | 'createdAt'>): Promise<CashMovement> {
    return this.withTenantClient(m.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO cash_movements(
            id, tenant_id, branch_id, cash_session_id, movement_type, amount_cents, ref_type, ref_id, created_by
          )
          VALUES ($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8::uuid,$9::uuid)
          RETURNING id, tenant_id, branch_id, cash_session_id, movement_type, amount_cents, ref_type, ref_id, created_at, created_by
        `,
        [id, m.tenantId, m.branchId, m.cashSessionId, m.movementType, m.amountCents, m.refType, m.refId, m.createdBy],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        cashSessionId: r.cash_session_id,
        movementType: r.movement_type,
        amountCents: Number(r.amount_cents),
        refType: r.ref_type,
        refId: r.ref_id,
        createdAt: toIso(r.created_at) as string,
        createdBy: r.created_by,
      }
    })
  }

  async listCashMovements(params: { tenantId: string; branchId: string; cashSessionId: string }): Promise<CashMovement[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, cash_session_id, movement_type, amount_cents, ref_type, ref_id, created_at, created_by
          FROM cash_movements
          WHERE tenant_id = $1 AND branch_id = $2::uuid AND cash_session_id = $3::uuid
          ORDER BY created_at DESC
          LIMIT 300
        `,
        [params.tenantId, params.branchId, params.cashSessionId],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        cashSessionId: r.cash_session_id,
        movementType: r.movement_type,
        amountCents: Number(r.amount_cents),
        refType: r.ref_type,
        refId: r.ref_id,
        createdAt: toIso(r.created_at) as string,
        createdBy: r.created_by,
      }))
    })
  }

  async createFiscalDocument(params: Omit<FiscalDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<FiscalDocument> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const id = crypto.randomUUID()
      const res = await client.query(
        `
          INSERT INTO fiscal_documents(id, tenant_id, branch_id, order_id, doc_type, status, error_message, updated_at)
          VALUES ($1,$2,$3::uuid,$4::uuid,$5,$6,$7,NOW())
          RETURNING id, tenant_id, branch_id, order_id, doc_type, status, error_message, created_at, updated_at
        `,
        [id, params.tenantId, params.branchId, params.orderId, params.docType, params.status, params.errorMessage],
      )
      const r = res.rows[0]
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        docType: r.doc_type,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: toIso(r.created_at) as string,
        updatedAt: toIso(r.updated_at) as string,
      }
    })
  }

  async listFiscalDocuments(params: { tenantId: string; branchId: string; status?: FiscalDocument['status'] }): Promise<FiscalDocument[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, order_id, doc_type, status, error_message, created_at, updated_at
          FROM fiscal_documents
          WHERE tenant_id = $1 AND branch_id = $2::uuid
            AND ($3::text IS NULL OR status = $3)
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [params.tenantId, params.branchId, params.status ?? null],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        docType: r.doc_type,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: toIso(r.created_at) as string,
        updatedAt: toIso(r.updated_at) as string,
      }))
    })
  }

  async getFiscalDocument(params: { tenantId: string; fiscalDocumentId: string }): Promise<FiscalDocument | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, order_id, doc_type, status, error_message, created_at, updated_at
          FROM fiscal_documents
          WHERE tenant_id = $1 AND id = $2::uuid
          LIMIT 1
        `,
        [params.tenantId, params.fiscalDocumentId],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        docType: r.doc_type,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: toIso(r.created_at) as string,
        updatedAt: toIso(r.updated_at) as string,
      }
    })
  }

  async updateFiscalDocument(params: {
    tenantId: string
    fiscalDocumentId: string
    patch: Partial<FiscalDocument>
  }): Promise<FiscalDocument | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const nextStatus = params.patch.status ?? null
      const nextError = params.patch.errorMessage ?? null
      await client.query(
        `
          UPDATE fiscal_documents
          SET status = COALESCE($1, status),
              error_message = COALESCE($2, error_message),
              updated_at = NOW()
          WHERE tenant_id = $3 AND id = $4::uuid
        `,
        [nextStatus, nextError, params.tenantId, params.fiscalDocumentId],
      )
      return this.getFiscalDocument({ tenantId: params.tenantId, fiscalDocumentId: params.fiscalDocumentId })
    })
  }

  async listPendingFiscalDocuments(params: { tenantId: string }): Promise<FiscalDocument[]> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const res = await client.query(
        `
          SELECT id, tenant_id, branch_id, order_id, doc_type, status, error_message, created_at, updated_at
          FROM fiscal_documents
          WHERE tenant_id = $1 AND status = 'PENDING'
          ORDER BY created_at ASC
          LIMIT 50
        `,
        [params.tenantId],
      )
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        orderId: r.order_id,
        docType: r.doc_type,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: toIso(r.created_at) as string,
        updatedAt: toIso(r.updated_at) as string,
      }))
    })
  }

  // ===== Categorias — implementação Postgres (stub) =====
  // NOTA: implementação completa requer migration `categories`. Por enquanto,
  // mantemos compatibilidade de tipo (lança erro explícito se chamado com
  // STORE_BACKEND=postgres). O backend memory é o default e tem a impl real.
  async listCategories(_params: { tenantId: string; includeArchived?: boolean }): Promise<Category[]> {
    throw new Error('PostgresStore: listCategories não implementado — rode migration 0003 ou use STORE_BACKEND=memory')
  }
  async getCategory(_params: { tenantId: string; categoryId: string }): Promise<Category | null> {
    throw new Error('PostgresStore: getCategory não implementado')
  }
  async getSystemCategoryId(_params: { tenantId: string }): Promise<string | null> {
    throw new Error('PostgresStore: getSystemCategoryId não implementado')
  }
  async createCategory(_params: { tenantId: string; name: string; description?: string | null; color?: string | null; icon?: string | null; createdBy: string }): Promise<Category> {
    throw new Error('PostgresStore: createCategory não implementado')
  }
  async updateCategory(_params: { tenantId: string; categoryId: string; patch: Partial<Pick<Category, 'name' | 'description' | 'color' | 'icon' | 'position'>>; updatedBy: string }): Promise<Category | null> {
    throw new Error('PostgresStore: updateCategory não implementado')
  }
  async archiveCategory(_params: { tenantId: string; categoryId: string; updatedBy: string }): Promise<Category | null> {
    throw new Error('PostgresStore: archiveCategory não implementado')
  }
  async restoreCategory(_params: { tenantId: string; categoryId: string; updatedBy: string }): Promise<Category | null> {
    throw new Error('PostgresStore: restoreCategory não implementado')
  }
  async deleteCategory(_params: { tenantId: string; categoryId: string; fallbackCategoryId: string | null; updatedBy: string }): Promise<{ deletedId: string; movedItems: number }> {
    throw new Error('PostgresStore: deleteCategory não implementado')
  }
  async reorderCategories(_params: { tenantId: string; orderedIds: string[]; updatedBy: string }): Promise<Category[]> {
    throw new Error('PostgresStore: reorderCategories não implementado')
  }
  async bulkMoveProducts(_params: { tenantId: string; productIds: string[]; targetCategoryId: string | null; updatedBy: string }): Promise<number> {
    throw new Error('PostgresStore: bulkMoveProducts não implementado')
  }
  async updateProduct(params: { tenantId: string; productId: string; patch: Partial<Pick<Product, 'name' | 'baseUnit' | 'categoryId' | 'active' | 'sku' | 'averageCostCents'>> }): Promise<Product | null> {
    return this.withTenantClient(params.tenantId, async (client) => {
      const p = params.patch
      // monta UPDATE dinâmico
      const fields: string[] = []
      const values: unknown[] = []
      let i = 1
      if (p.sku !== undefined) { fields.push(`sku = $${i++}`); values.push(p.sku) }
      if (p.name !== undefined) { fields.push(`name = $${i++}`); values.push(p.name) }
      if (p.baseUnit !== undefined) { fields.push(`base_unit = $${i++}`); values.push(p.baseUnit) }
      if (p.categoryId !== undefined) { fields.push(`category_id = $${i++}`); values.push(p.categoryId) }
      if (p.active !== undefined) { fields.push(`active = $${i++}`); values.push(p.active) }
      if (p.averageCostCents !== undefined) { fields.push(`average_cost_cents = $${i++}`); values.push(p.averageCostCents) }
      if (fields.length === 0) {
        // nada a atualizar — só retorna atual
        const res = await client.query(`SELECT * FROM products WHERE tenant_id = $1 AND id = $2::uuid`, [params.tenantId, params.productId])
        return res.rows[0] ? this.mapProduct(res.rows[0]) : null
      }
      values.push(params.tenantId)
      values.push(params.productId)
      const res = await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE tenant_id = $${i++} AND id = $${i}::uuid RETURNING *`,
        values,
      )
      return res.rows[0] ? this.mapProduct(res.rows[0]) : null
    })
  }

  private mapProduct(row: Record<string, unknown>): Product {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      sku: String(row.sku),
      name: String(row.name),
      baseUnit: String(row.base_unit),
      categoryId: row.category_id ? String(row.category_id) : null,
      active: Boolean(row.active),
      averageCostCents: Number(row.average_cost_cents ?? 0),
      createdAt: String(row.created_at),
    }
  }
  async countProductsByCategory(_params: { tenantId: string; categoryId: string | null }): Promise<number> {
    throw new Error('PostgresStore: countProductsByCategory não implementado')
  }
}

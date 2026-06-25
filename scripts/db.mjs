import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import pg from 'pg'

const command = process.argv[2] ?? 'migrate'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL não configurada')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl })

const ensureMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

const listMigrationFiles = async () => {
  const dir = path.resolve(process.cwd(), 'migrations')
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.sql'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, filePath: path.join(dir, name) }))
}

const getExecuted = async () => {
  const res = await pool.query('SELECT name FROM schema_migrations')
  return new Set(res.rows.map((r) => r.name))
}

const runSqlFile = async (filePath) => {
  const sql = await fs.readFile(filePath, 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

const migrate = async () => {
  await ensureMigrationsTable()
  const files = await listMigrationFiles()
  const executed = await getExecuted()

  for (const f of files) {
    if (executed.has(f.name)) continue
    await runSqlFile(f.filePath)
    await pool.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f.name])
    console.log(`aplicado: ${f.name}`)
  }
}

const seed = async () => {
  const exists = await pool.query("SELECT 1 FROM tenants WHERE name = 'Depósito Demo' LIMIT 1")
  if (exists.rowCount && exists.rowCount > 0) {
    console.log('seed: já existe')
    return
  }

  const { hashPassword } = await import('../api/shared/security.js')
  const tenantId = crypto.randomUUID()
  const branchId = crypto.randomUUID()
  const ownerId = crypto.randomUUID()

  const ownerPwd = process.env.SEED_OWNER_PASSWORD ?? 'admin123'
  const ownerHash = await hashPassword(ownerPwd)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId])

    await client.query('INSERT INTO tenants(id, name) VALUES ($1, $2)', [tenantId, 'Depósito Demo'])
    await client.query('INSERT INTO branches(id, tenant_id, name) VALUES ($1, $2, $3)', [branchId, tenantId, 'Matriz'])

    await client.query(
      `
        INSERT INTO users(id, tenant_id, branch_id, name, email, role, password_salt, password_hash, active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
      `,
      [ownerId, tenantId, branchId, 'Admin Demo', 'admin@demo.com', 'OWNER', ownerHash.salt, ownerHash.hash],
    )

    const units = [
      { code: 'un', label: 'Unidade' },
      { code: 'cx12', label: 'Caixa (12)' },
      { code: 'fd6', label: 'Fardo (6)' },
    ]
    for (const u of units) {
      await client.query('INSERT INTO units(tenant_id, code, label) VALUES ($1,$2,$3)', [tenantId, u.code, u.label])
    }

    const products = [
      { sku: 'HEINEKEN-350', name: 'Heineken Lata 350ml', baseUnit: 'un' },
      { sku: 'BRAHMA-350', name: 'Brahma Lata 350ml', baseUnit: 'un' },
      { sku: 'COCA-2L', name: 'Coca-Cola 2L', baseUnit: 'un' },
      { sku: 'AGUA-500', name: 'Água Mineral 500ml', baseUnit: 'un' },
    ]

    const productRows = []
    for (const p of products) {
      const id = crypto.randomUUID()
      productRows.push({ ...p, id })
      await client.query(
        'INSERT INTO products(id, tenant_id, sku, name, base_unit, active) VALUES ($1,$2,$3,$4,$5,true)',
        [id, tenantId, p.sku, p.name, p.baseUnit],
      )
    }

    const beerIds = productRows.filter((p) => p.sku === 'HEINEKEN-350' || p.sku === 'BRAHMA-350').map((p) => p.id)
    for (const productId of beerIds) {
      await client.query(
        'INSERT INTO unit_conversions(tenant_id, product_id, unit_code, factor_to_base) VALUES ($1,$2,$3,$4)',
        [tenantId, productId, 'cx12', 12],
      )
      await client.query(
        'INSERT INTO unit_conversions(tenant_id, product_id, unit_code, factor_to_base) VALUES ($1,$2,$3,$4)',
        [tenantId, productId, 'fd6', 6],
      )
    }

    const channels = ['WHATSAPP', 'DELIVERY', 'CATALOGO', 'BALCAO']
    for (const p of productRows) {
      const base = p.sku === 'COCA-2L' ? 1200 : p.sku === 'AGUA-500' ? 250 : 600
      const delivery = Math.round(base * 1.08)
      const catalogo = Math.round(base * 1.03)
      const balcao = Math.round(base * 0.92)

      const priceByChannel = {
        WHATSAPP: base,
        DELIVERY: delivery,
        CATALOGO: catalogo,
        BALCAO: balcao,
      }

      for (const ch of channels) {
        await client.query(
          'INSERT INTO prices(tenant_id, product_id, channel, unit_code, price_cents) VALUES ($1,$2,$3,$4,$5)',
          [tenantId, p.id, ch, 'un', priceByChannel[ch]],
        )
      }

      const isBeer = beerIds.includes(p.id)
      if (isBeer) {
        const cx12 = base * 12 - 300
        const fd6 = base * 6 - 120

        const cx = { WHATSAPP: cx12, DELIVERY: cx12 + 150, CATALOGO: cx12 + 60, BALCAO: cx12 - 100 }
        const fd = { WHATSAPP: fd6, DELIVERY: fd6 + 60, CATALOGO: fd6 + 30, BALCAO: fd6 - 40 }

        for (const ch of channels) {
          await client.query(
            'INSERT INTO prices(tenant_id, product_id, channel, unit_code, price_cents) VALUES ($1,$2,$3,$4,$5)',
            [tenantId, p.id, ch, 'cx12', cx[ch]],
          )
          await client.query(
            'INSERT INTO prices(tenant_id, product_id, channel, unit_code, price_cents) VALUES ($1,$2,$3,$4,$5)',
            [tenantId, p.id, ch, 'fd6', fd[ch]],
          )
        }
      }

      const qty = p.sku === 'AGUA-500' ? 240 : p.sku === 'COCA-2L' ? 80 : 240
      await client.query(
        'INSERT INTO inventory_balances(tenant_id, branch_id, product_id, quantity_base) VALUES ($1,$2,$3,$4)',
        [tenantId, branchId, p.id, qty],
      )
    }

    const customers = [
      { name: 'Bar do Zé', phone: '11999990001', address: 'Rua A, 123' },
      { name: 'Conveniência Central', phone: '11999990002', address: 'Av. B, 456' },
      { name: 'Cliente Delivery', phone: '11999990003', address: 'Rua C, 789' },
    ]
    for (const c of customers) {
      await client.query('INSERT INTO customers(tenant_id, name, phone, address, active) VALUES ($1,$2,$3,$4,true)', [
        tenantId,
        c.name,
        c.phone,
        c.address,
      ])
    }

    await client.query('COMMIT')
    console.log('seed: ok')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

if (command === 'migrate') {
  await migrate()
  await pool.end()
  process.exit(0)
}

if (command === 'seed') {
  await migrate()
  await seed()
  await pool.end()
  process.exit(0)
}

console.error('Uso: node scripts/db.mjs migrate|seed')
await pool.end()
process.exit(1)

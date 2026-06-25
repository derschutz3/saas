import pg from 'pg'
import type { Pool } from 'pg'

let pool: Pool | null = null

export const getPool = (): Pool | null => {
  const url = process.env.DATABASE_URL
  if (!url) return null

  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: Math.max(2, Number(process.env.PG_POOL_MAX ?? 8)),
      idleTimeoutMillis: Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS ?? 10_000)),
      connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_CONN_TIMEOUT_MS ?? 5_000)),
    })
  }

  return pool
}

export const closePool = async () => {
  if (!pool) return
  const p = pool
  pool = null
  await p.end()
}

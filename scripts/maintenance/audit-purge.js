#!/usr/bin/env node
/**
 * LGPD Art. 16 — Job de manutenção: purge de audit_events vencidos.
 *
 * Uso:
 *   - Modo one-shot (para cron):   node scripts/maintenance/audit-purge.js
 *   - Modo daemon (loop 24h):     node scripts/maintenance/audit-purge.js --watch
 *
 * Em produção: rodar via cron systemd / k8s CronJob / Cloud Scheduler
 *   Exemplo k8s CronJob:
 *     schedule: "0 3 * * *"  # 03:00 UTC diariamente
 *
 * Para Postgres:
 *   PGPASSWORD=... psql -h $HOST -U $USER -d $DB -c "SELECT * FROM purge_expired_audit_events();"
 *
 * SECURITY (LGPD):
 *  - Requer variáveis de ambiente (PG_HOST, PG_USER, PG_DB, PG_PASSWORD)
 *  - Log SEM PII (apenas métricas: count, cutoff, runtime)
 *  - Operação idempotente — pode rodar múltiplas vezes sem efeito colateral
 */
import { spawnSync } from 'node:child_process'

const WATCH = process.argv.includes('--watch')
const INTERVAL_HOURS = Number(process.env.PURGE_INTERVAL_HOURS ?? 24)

const env = {
  PG_HOST: process.env.PG_HOST ?? 'localhost',
  PG_PORT: process.env.PG_PORT ?? '5432',
  PG_USER: process.env.PG_USER ?? 'erp_maintenance',
  PG_DB: process.env.PG_DB ?? 'erp',
}

function purgeOnce(): void {
  const start = Date.now()
  // SECURITY (LGPD): log SEM PII, só métricas
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    msg: 'audit-purge.started',
    host: env.PG_HOST,
    db: env.PG_DB,
  }))

  // Em produção, isso conecta via psql ou pg.Client. Aqui demonstramos via psql
  // para manter o script zero-deps em runtime.
  const password = process.env.PGPASSWORD ?? process.env.PG_PASSWORD
  if (!password) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'audit-purge.missing_password',
      hint: 'set PGPASSWORD',
    }))
    process.exit(1)
  }

  const sql = `SELECT * FROM purge_expired_audit_events();`
  const result = spawnSync(
    'psql',
    [
      '-h', env.PG_HOST,
      '-p', env.PG_PORT,
      '-U', env.PG_USER,
      '-d', env.PG_DB,
      '-t', // tuples only
      '-A', // unaligned
      '-c', sql,
    ],
    {
      env: { ...process.env, PGPASSWORD: password },
      encoding: 'utf8',
    },
  )

  if (result.status !== 0) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'audit-purge.psql_failed',
      stderr: result.stderr?.toString().slice(0, 500),
      stdout: result.stdout?.toString().slice(0, 500),
    }))
    process.exit(2)
  }

  const stdout = result.stdout?.toString().trim() ?? ''
  // Formato: deleted_count|cutoff
  const [count, cutoff] = stdout.split('|')
  const runtimeMs = Date.now() - start

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    msg: 'audit-purge.completed',
    deletedCount: Number(count ?? 0),
    cutoff: cutoff ?? null,
    runtimeMs,
  }))
}

if (WATCH) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    msg: 'audit-purge.daemon_started',
    intervalHours: INTERVAL_HOURS,
  }))
  const tick = (): void => {
    try {
      purgeOnce()
    } catch (err) {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'audit-purge.tick_failed',
        error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      }))
    }
  }
  // Primeira execução imediata
  tick()
  setInterval(tick, INTERVAL_HOURS * 60 * 60 * 1000)
} else {
  try {
    purgeOnce()
  } catch (err) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'audit-purge.fatal',
      error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    }))
    process.exit(1)
  }
}

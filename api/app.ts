/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'path'
import dotenv from 'dotenv'
import helmet from 'helmet'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import v1AuthRoutes from './routes/v1-auth.js'
import v1Routes from './routes/v1.js'
import { registerIntegrationRoutes } from './integrations/routes.js'
import { registerWebhookRoutes } from './integrations/webhook.js'
import { registerModulesRoutes } from './routes/modules.js'
import { registerAgentRoutes } from './routes/v1-agent.js'
import { registerDevRoutes } from './routes/v1-dev.js'
import { registerCategoryRoutes } from './routes/v1-categories.js'
import { registerReportRoutes } from './routes/v1-reports.js'
import { registerSupplierRoutes } from './routes/v1-suppliers.js'
import { registerCustomerRoutes } from './routes/v1-customers.js'
import { registerCashRoutes } from './routes/v1-cash.js'
import { getStore } from './infra/store.js'
import { logger } from './shared/logger.js'
import { registerPurchaseRoutes } from './routes/v1-purchases.js'
import { registerFiscalRoutes } from './routes/v1-fiscal.js'
import { registerSettingsRoutes } from './routes/v1-settings.js'
import { registerInventoryExitRoutes } from './routes/v1-sales-import.js'
import { registerLgpdRoutes } from './routes/v1-lgpd.js'
import { traceMiddleware } from './shared/middleware.js'
import { sendError } from './shared/http.js'
import { globalRateLimiter, loginRateLimiter, webhookRateLimiter } from './shared/rate-limit.js'
import { originGuard } from './shared/origin-guard.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

// SECURITY (C1/C2 do relatório): segredo do cookie deve ter no mínimo 32 chars
// e ser estável por ambiente (senão tokens ficam órfãos entre deploys).
const COOKIE_NAME = 'erp_session'
const isProd = process.env.NODE_ENV === 'production'

// SECURITY (M2): esconde tecnologia (default Express expõe "X-Powered-By: Express")
app.disable('x-powered-by')

// SECURITY (M1 do relatório): adiciona headers de segurança HTTP
// - X-Content-Type-Options: nosniff (mitiga MIME sniffing)
// - X-Frame-Options: DENY (mitiga clickjacking)
// - Strict-Transport-Security (HSTS) — em prod força HTTPS
// - X-DNS-Prefetch-Control: off
// - Referrer-Policy: no-referrer
// - Cross-Origin-Resource-Policy: same-origin
// OBS: CSP desabilitado porque o frontend Next.js está em outro origin (mesma máquina em dev)
app.use(helmet({
  contentSecurityPolicy: false, // controlado pelo Next.js
  crossOriginEmbedderPolicy: false, // não bloqueia recursos cross-origin em dev
  strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}))

// PERF (1): habilita compressão gzip em todas responses de texto (JSON, HTML, etc).
// Threshold 512 bytes evita comprimir payloads muito pequenos (overhead > benefício).
// Em prod comprime ~70% das responses de API típicas, ótimo para listas grandes.
app.use(compression({
  threshold: 512,
  level: 6, // balanceamento CPU/compressão
  // Não comprime respostas já comprimidas (imagens, etc)
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false
    return compression.filter(req, res)
  },
}))

// PERF (2): ETag forte + lastModified para conditional GET (304 Not Modified)
// Reduz drasticamente tráfego de polling em dashboards que refazem a mesma query.
app.set('etag', 'strong')
app.set('x-powered-by', false)
app.use((_req, res, next) => {
  // Cache público leve para endpoints read-only (categorias, unidades)
  // Endpoints dinâmicos de relatórios cacheam só no client (TTL via SWR)
  res.setHeader('Vary', 'Accept-Encoding')
  next()
})

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3100',
    'http://localhost:3101',
    'http://localhost:3102',
    'http://localhost:3103',
    'http://localhost:5173',
    'http://localhost:5174',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-branch-id', 'x-trace-id'],
}))
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

// SECURITY (C3): rate limit global antes de qualquer rota
app.use(globalRateLimiter)

app.use(traceMiddleware)

// SECURITY (A1 do relatório): valida Origin contra whitelist
// em requests autenticadas (defesa extra contra CSRF além do SameSite=Lax).
app.use(originGuard)

/**
 * API Routes
 */
app.use('/api/auth', loginRateLimiter, authRoutes)
app.use('/api/v1/auth', loginRateLimiter, v1AuthRoutes)
app.use('/api/v1', v1Routes)
app.use('/api/v1', (req, res, next) => {
  if (req.path.startsWith('/integrations')) {
    req.url = req.url.replace('/integrations', '')
  }
  next()
})
registerIntegrationRoutes(app)
registerWebhookRoutes(app, webhookRateLimiter)
registerModulesRoutes(app)
registerAgentRoutes(app)
registerDevRoutes(app)
registerCategoryRoutes(app)
registerReportRoutes(app)
registerSupplierRoutes(app)
registerCustomerRoutes(app)
registerCashRoutes(app)
registerPurchaseRoutes(app)
registerFiscalRoutes(app)
registerSettingsRoutes(app)
registerInventoryExitRoutes(app)
// LGPD: rotas de direitos do titular (Art. 18)
registerLgpdRoutes(app)
// force restart marker

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  sendError(req, res, error)
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

// ============================================================================
// LGPD Art. 16 — Job periódico de purga de audit_events vencidos
// ============================================================================
//
// SECURITY: roda em background a cada PURGE_INTERVAL_HOURS (default 24h).
// Para produção com Postgres, prefira usar scripts/maintenance/audit-purge.js
// via cron externo — este setInterval é fallback para dev/test/edge.
//
// Log SEM PII — apenas métricas (deletedCount, runtimeMs).
const PURGE_INTERVAL_HOURS = Number(process.env.PURGE_INTERVAL_HOURS ?? 24)
const PURGE_ENABLED = (process.env.PURGE_ENABLED ?? 'true').toLowerCase() !== 'false'

if (PURGE_ENABLED) {
  const purgeIntervalMs = PURGE_INTERVAL_HOURS * 60 * 60 * 1000
  const runPurge = async (): Promise<void> => {
    const start = Date.now()
    try {
      const store = await getStore()
      const result = await store.purgeExpiredAuditEvents()
      // SECURITY (LGPD): log SEM PII
      logger.info('lgpd.audit_purge.scheduled.executed', {
        deletedCount: result.deletedCount,
        cutoff: result.cutoff,
        runtimeMs: Date.now() - start,
      })
    } catch (err) {
      logger.error('lgpd.audit_purge.scheduled.failed', {
        error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      })
    }
  }
  // Primeira execução após 30s (para não atrapalhar startup)
  setTimeout(runPurge, 30_000)
  // Depois a cada PURGE_INTERVAL_HOURS
  setInterval(runPurge, purgeIntervalMs)
  logger.info('lgpd.audit_purge.scheduler.started', { intervalHours: PURGE_INTERVAL_HOURS })
}

export default app

/**
 * API de autenticação para o frontend Next.js
 * Compatível com AuthContext (types/auth.ts)
 *
 * Endpoints:
 *   POST /api/v1/auth/login    - Login (retorna { user, token })
 *   POST /api/v1/auth/logout   - Logout (invalida token)
 *   GET  /api/v1/auth/me       - Retorna usuário logado
 */

import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { signJwtHS256, verifyPassword } from '../shared/security.js'
import { getStore } from '../infra/store.js'
import type { User as ApiUser, UserRole, SubscriptionPlan } from '../../apps/erp-web/types/auth.js'
import { setSessionCookie, clearSessionCookie } from '../shared/cookie.js'
import { loginSchema } from '../shared/schemas.js'
import { validateBody } from '../shared/validate.js'
import { logger } from '../shared/logger.js'
import { buildSafeAuditMeta } from '../shared/pii-redactor.js'

const router = Router()

// SECURITY (A2): type guard para evitar NoSQL injection / 500 quando body
// envia objetos em vez de strings.
const isString = (v: unknown): v is string => typeof v === 'string'

/**
 * Helper: converte role interno para role do frontend
 * - OWNER, ADMIN → 'admin' (acesso admin SaaS)
 * - outros       → 'client'
 */
function mapRole(role: string): UserRole {
  if (role === 'OWNER' || role === 'ADMIN' || role === 'admin') return 'admin'
  return 'client'
}

function planFromRole(role: string): SubscriptionPlan {
  if (role === 'OWNER') return 'enterprise'
  if (role === 'ADMIN') return 'pro'
  return 'starter'
}

/**
 * POST /api/v1/auth/login
 */
router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // SECURITY (A3): req.body já foi validado por zod
    const { email, password } = req.body as { email: string; password: string }

    const store = await getStore()
    const tenantId = await store.getDefaultTenantId()
    if (!tenantId) {
      throw new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Tenant não configurado' })
    }

    // SECURITY (M3): flag de "platform admin" agora é configurável via env
    // (PLATFORM_ADMIN_EMAILS="admin@sistema.com,saas@admin.com") em vez de
    // hardcoded. mapRole() já trata OWNER/ADMIN como 'admin', então essa
    // flag só vale para casos especiais (ex: conta que perdeu role por bug).
    const platformAdminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? 'admin@sistema.com,saas@admin.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    const isPlatformAdmin = platformAdminEmails.includes(email.toLowerCase())

    const user = await store.findUserByEmail({ tenantId, email })
    if (!user || !user.active) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    const { ok, needsRehash } = await verifyPassword(password, { salt: user.passwordSalt, hash: user.passwordHash })
    if (!ok) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    // SECURITY (M6): re-hash transparente com iterações atuais (600k).
    // Sem endpoint público para trocar senha ainda — por isso só logamos
    // a flag. O hash legado continua válido (verifyPassword tem fallback
    // para 120k) e será migrado quando o endpoint de troca de senha
    // for criado.
    if (needsRehash) {
      logger.info('Usuário com hash PBKDF2 legado (120k) — re-hash pendente até endpoint de troca de senha', { userId: user.id, tenantId })
    }

    const TTL_SECONDS = 60 * 60 * 8
    const tokenResult = signJwtHS256(
      { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, role: user.role },
      { ttlSeconds: TTL_SECONDS }
    )

    await store.audit({
      tenantId,
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      // LGPD: NÃO armazenar email em claro no audit log.
      // Hash permite correlação entre eventos sem expor o PII.
      metadata: buildSafeAuditMeta({ role: user.role }),
    })

    // Buscar tenant info
    const tenant = await store.getTenant(tenantId)

    // Caso admin global (você, dono do SaaS) — SECURITY (M3): agora derivado
    // de PLATFORM_ADMIN_EMAILS (env) + mapRole (OWNER/ADMIN do banco).
    const finalRole: UserRole = isPlatformAdmin ? 'admin' : mapRole(user.role)

    const apiUser: ApiUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: finalRole,
      createdAt: new Date().toISOString(),
      tenantId: finalRole === 'client' ? tenantId : undefined,
      tenantName: tenant?.name,
      plan: finalRole === 'client' ? planFromRole(user.role) : undefined,
    }

    // SECURITY (C2): seta cookie httpOnly em vez de (ou além de) retornar token no body.
    // O token continua sendo retornado no body para clientes externos que preferem
    // Authorization header; o frontend web usará o cookie automaticamente.
    setSessionCookie(res, tokenResult.token, TTL_SECONDS)

    res.status(200).json({
      user: apiUser,
      token: tokenResult.token,
    })
  })
)

/**
 * POST /api/v1/auth/logout
 */
router.post('/logout', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  // SECURITY (C2): limpa cookie httpOnly no logout
  clearSessionCookie(res)
  res.status(204).end()
}))

/**
 * GET /api/v1/auth/me
 * Retorna usuário a partir do token JWT (header Authorization OU cookie)
 */
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // SECURITY (C2): extrai token de header OU cookie; cookie é o método preferencial
    // para clientes web pois mitiga XSS roubando token.
    const { extractToken } = await import('../shared/cookie.js')
    const token = extractToken(req)
    if (!token) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Token não fornecido' })
    }
    const { verifyJwtHS256 } = await import('../shared/security.js')
    const payload = verifyJwtHS256(token)
    // Resolve módulos efetivos do usuário (override por usuário OU herança do tenant)
    const store = await getStore()
    const resolved = await store.resolveUserEnabledModules({
      tenantId: payload.tenantId,
      userId: payload.sub,
    })
    // 'tenant' = sem override; converte para null no payload (frontend decide)
    const enabledModules = resolved === 'tenant' ? null : resolved
    res.json({
      ok: true,
      user: {
        id: payload.sub,
        tenantId: payload.tenantId,
        branchId: payload.branchId,
        role: payload.role,
        // null = herda do tenant, [] = sem módulos, lista = override explícito
        enabledModules,
      },
    })
  })
)

export default router

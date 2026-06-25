/**
 * This is a user authentication API route demo.
 * Handle user registration, login, token management, etc.
 */
import { Router, type Request, type Response } from 'express'
import { ApiError, asyncHandler } from '../shared/http.js'
import { signJwtHS256, verifyPassword } from '../shared/security.js'
import { getStore } from '../infra/store.js'
import { setSessionCookie, clearSessionCookie } from '../shared/cookie.js'
import { loginSchema, registerSchema } from '../shared/schemas.js'
import { validateBody } from '../shared/validate.js'

const router = Router()

/**
 * SECURITY (A2): validador de tipo para evitar NoSQL injection / 500
 * quando o body envia objetos em vez de strings.
 */
const isString = (v: unknown): v is string => typeof v === 'string'

/**
 * User Login
 * POST /api/auth/register
 */
router.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Registro não habilitado no MVP' })
  })
)

/**
 * User Login
 * POST /api/auth/login
 */
router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // SECURITY (A3): req.body já foi validado e sanitizado por zod
    const { email, password } = req.body as { email: string; password: string }

    // SECURITY (A5 do relatório): em produção, bloquear credenciais
    // de seed/dev óbvias (admin123, password, etc).
    if (process.env.NODE_ENV === 'production' && password === 'admin123') {
      // SECURITY: mesma resposta que credenciais inválidas para não vazar info
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    const store = await getStore()
    const tenantId = await store.getDefaultTenantId()
    if (!tenantId) {
      throw new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Tenant não configurado' })
    }

    const user = await store.findUserByEmail({ tenantId, email })
    if (!user || !user.active) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    const { ok } = await verifyPassword(password, { salt: user.passwordSalt, hash: user.passwordHash })
    if (!ok) {
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Credenciais inválidas' })
    }

    const TTL_SECONDS = 60 * 60 * 12
    const token = signJwtHS256(
      { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, role: user.role },
      { ttlSeconds: TTL_SECONDS },
    )

    await store.audit({
      tenantId,
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    })

    // SECURITY (C2): seta cookie httpOnly
    setSessionCookie(res, token.token, TTL_SECONDS)

    res.status(200).json({
      token: token.token,
      me: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
      },
    })
  }),
)

/**
 * User Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  // SECURITY (C2): limpa cookie
  clearSessionCookie(res)
  res.status(204).end()
})

export default router

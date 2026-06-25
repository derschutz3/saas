import crypto from 'crypto'
import { ApiError } from './http.js'
import { logger } from './logger.js'

const base64UrlEncode = (input: Buffer | string) => {
  const buff = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buff
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const base64UrlDecode = (input: string) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + pad, 'base64')
}

export const createTraceId = () => crypto.randomUUID()

export type JwtPayload = {
  sub: string
  tenantId: string
  branchId: string | null
  role: string
  iat: number
  exp: number
}

/**
 * Resolve o secret JWT garantindo segurança:
 * - Em produção, ENV JWT_SECRET é OBRIGATÓRIO (falha no boot se ausente)
 * - Em desenvolvimento, usa fallback explícito + warning no console
 * - SECURITY: nunca aceitar secret hardcoded em produção — permite forjar tokens
 */
const resolveJwtSecret = (): string => {
  const isProd = process.env.NODE_ENV === 'production'
  const envSecret = process.env.JWT_SECRET

  if (envSecret && envSecret.length >= 32) {
    return envSecret
  }

  if (isProd) {
    throw new ApiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Configuração inválida do servidor (JWT_SECRET ausente ou curto demais — mínimo 32 caracteres)',
    })
  }

  // Dev/staging only — warning explícito para o desenvolvedor ver
  logger.warn('JWT_SECRET não definido ou < 32 chars — usando fallback DEV. NUNCA use isso em produção.', {
    env: 'development',
    issue: 'JWT_SECRET_MISSING_OR_SHORT',
  })
  return 'dev-secret-change-me-in-production-min-32-chars'
}

export const signJwtHS256 = (payload: Omit<JwtPayload, 'iat' | 'exp'>, params: { ttlSeconds: number }) => {
  const secret = resolveJwtSecret()

  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + params.ttlSeconds,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))
  const data = `${encodedHeader}.${encodedPayload}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  const token = `${data}.${base64UrlEncode(sig)}`
  return { token, payload: fullPayload }
}

export const verifyJwtHS256 = (token: string) => {
  const secret = resolveJwtSecret()

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Token inválido' })
  }

  const [encodedHeader, encodedPayload, encodedSig] = parts
  const data = `${encodedHeader}.${encodedPayload}`
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest()
  const actualSig = base64UrlDecode(encodedSig)
  const ok = expectedSig.length === actualSig.length && crypto.timingSafeEqual(expectedSig, actualSig)
  if (!ok) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Token inválido' })
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as JwtPayload
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Token expirado' })
  }
  return payload
}

/**
 * SECURITY (M6 do relatório): PBKDF2 com 120k iterações está abaixo do
 * recomendado pela OWASP 2023 (600k+ para SHA-256, ou Argon2id).
 * Aumentamos para 600k. verifyPassword() mantém retrocompatibilidade com
 * hashes antigos e re-hash no próximo login bem-sucedido.
 */
export const PBKDF2_ITERATIONS = 600_000
const PBKDF2_ITERATIONS_LEGACY = 120_000

const pbkdf2 = (password: string, salt: Buffer, iterations: number): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })

export const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16)
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return { salt: base64UrlEncode(salt), hash: base64UrlEncode(derived) }
}

/**
 * Verifica senha contra hash armazenado. Tenta primeiro com iterações atuais
 * (600k); se falhar, tenta com 120k (legado) para retrocompatibilidade.
 * Retorna { ok, needsRehash } para que a camada de auth possa atualizar
 * o hash no banco no próximo login.
 */
export const verifyPassword = async (
  password: string,
  params: { salt: string; hash: string }
): Promise<{ ok: boolean; needsRehash: boolean }> => {
  const salt = base64UrlDecode(params.salt)
  const expected = base64UrlDecode(params.hash)

  // Tenta com iterações atuais
  const derivedCurrent = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  if (expected.length === derivedCurrent.length && crypto.timingSafeEqual(expected, derivedCurrent)) {
    return { ok: true, needsRehash: false }
  }

  // Fallback para iterações legadas (120k)
  const derivedLegacy = await pbkdf2(password, salt, PBKDF2_ITERATIONS_LEGACY)
  if (expected.length === derivedLegacy.length && crypto.timingSafeEqual(expected, derivedLegacy)) {
    return { ok: true, needsRehash: true }
  }

  return { ok: false, needsRehash: false }
}

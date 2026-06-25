/**
 * Helpers para gerenciar o cookie de sessão (C2 do relatório).
 *
 * SECURITY:
 * - httpOnly: impede leitura via JavaScript (mitiga XSS roubando token)
 * - secure: só envia sobre HTTPS (em dev fica false para funcionar sem TLS)
 * - sameSite=Lax: mitiga CSRF sem quebrar navegação
 * - path=/: cookie válido para toda a API
 */
import type { Response, Request } from 'express'

const COOKIE_NAME = 'erp_session'
const isProd = process.env.NODE_ENV === 'production'

export const SESSION_COOKIE_NAME = COOKIE_NAME

export const setSessionCookie = (res: Response, token: string, ttlSeconds: number): void => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,        // SECURITY: não acessível por JS no browser
    secure: isProd,        // SECURITY: só HTTPS em produção
    sameSite: 'lax',       // SECURITY: mitiga CSRF
    maxAge: ttlSeconds * 1000,
    path: '/',
  })
}

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  })
}

/**
 * Extrai o token JWT do header Authorization (preferência) ou do cookie de sessão.
 * SECURITY: prioriza Authorization (mais explícito), mas aceita cookie para
 * clientes web que não controlam headers.
 */
export const extractToken = (req: Request): string | null => {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || null
  }

  // cookie-parser não está instalado, então acessamos via req.headers.cookie
  const rawCookie = req.headers.cookie
  if (rawCookie) {
    const match = rawCookie.split(';').map((s) => s.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`))
    if (match) {
      return decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) || null
    }
  }

  return null
}

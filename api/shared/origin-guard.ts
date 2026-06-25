/**
 * Middleware de validação de Origin (defesa contra CSRF).
 *
 * SECURITY (A1 do relatório): validar que toda request autenticada
 * (com cookie) vem de um Origin da whitelist.
 *
 * Comportamento:
 * - Em produção, ORIGIN_ALLOWLIST env pode estender a lista
 * - Sem Origin (server-to-server, curl): PERMITE — assume-se que
 *   server-to-server usa Authorization header (que já é validado)
 * - Com Origin não-whitelisted: 403
 */
import type { NextFunction, Request, Response } from 'express'
import { ApiError } from './http.js'

const DEFAULT_ALLOWLIST = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:3101',
  'http://localhost:3102',
  'http://localhost:3103',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3103',
]

const getAllowlist = (): Set<string> => {
  const envList = process.env.ORIGIN_ALLOWLIST?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  return new Set([...DEFAULT_ALLOWLIST, ...envList])
}

export const originGuard = (req: Request, _res: Response, next: NextFunction): void => {
  // OPTIONS (preflight) já é tratado pelo CORS — não checar aqui
  if (req.method === 'OPTIONS') {
    next()
    return
  }

  const origin = req.headers.origin
  if (!origin) {
    // Sem Origin (server-to-server, mobile app) — confiar no token
    next()
    return
  }

  const allowlist = getAllowlist()
  if (!allowlist.has(origin)) {
    next(new ApiError({
      status: 403,
      code: 'FORBIDDEN_ORIGIN',
      message: `Origem não autorizada: ${origin}`,
    }))
    return
  }

  next()
}

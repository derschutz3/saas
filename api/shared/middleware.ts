import type { NextFunction, Request, Response } from 'express'
import { ApiError } from './http.js'
import { createTraceId, verifyJwtHS256 } from './security.js'
import { extractToken } from './cookie.js'

export type RequestContext = {
  traceId: string
  userId: string
  tenantId: string
  branchId: string | null
  role: string
}

export const traceMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  ;(req as any).traceId = (req.headers['x-trace-id'] as string | undefined) ?? createTraceId()
  next()
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  // SECURITY (C2): aceita token via header Authorization (clientes externos)
  // OU via cookie httpOnly (clientes web — mais seguro contra XSS)
  const token = extractToken(req)
  if (!token) {
    next(new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Não autenticado' }))
    return
  }

  const payload = verifyJwtHS256(token)

  const headerTenantId = req.headers['x-tenant-id'] as string | undefined
  if (headerTenantId && headerTenantId !== payload.tenantId) {
    next(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Tenant inválido' }))
    return
  }

  const headerBranchId = req.headers['x-branch-id'] as string | undefined
  const branchId = headerBranchId ?? payload.branchId

  ;(req as any).ctx = {
    traceId: (req as any).traceId as string,
    userId: payload.sub,
    tenantId: payload.tenantId,
    branchId: branchId ?? null,
    role: payload.role,
  } satisfies RequestContext

  next()
}

export const requireRole =
  (roles: string[]) => (req: Request, _res: Response, next: NextFunction) => {
    const ctx = (req as any).ctx as RequestContext | undefined
    if (!ctx) {
      next(new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Não autenticado' }))
      return
    }
    if (!roles.includes(ctx.role)) {
      next(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Sem permissão' }))
      return
    }
    next()
  }

/** Helper para extrair o contexto autenticado injetado por requireAuth. */
export const getCtx = (req: Request): RequestContext => (req as any).ctx as RequestContext


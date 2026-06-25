/**
 * Helpers de validação com Zod.
 * SECURITY (A3): substitui validação ad-hoc por schemas tipados.
 */
import type { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'
import { ApiError } from './http.js'

const formatZodError = (issues: Array<{ path: PropertyKey[]; message: string }>): string => {
  return issues.map((i) => `${i.path.map(String).join('.') || 'campo'}: ${i.message}`).join('; ')
}

/** Middleware que valida `req.body` contra um schema Zod. */
export const validateBody = <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      next(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: formatZodError(parsed.error.issues),
      }))
      return
    }
    // SECURITY: substitui req.body pelo objeto validado/sanitizado
    req.body = parsed.data
    next()
  }

/** Middleware que valida `req.query` contra um schema Zod. */
export const validateQuery = <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      next(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: formatZodError(parsed.error.issues),
      }))
      return
    }
    // Express 5 expõe query como getter; usamos Object.assign para segurança
    Object.assign(req.query, parsed.data)
    next()
  }

/** Middleware que valida `req.params` (com tratamento de UUID). */
export const validateParams = <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) {
      next(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: formatZodError(parsed.error.issues),
      }))
      return
    }
    Object.assign(req.params, parsed.data)
    next()
  }

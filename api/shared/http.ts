import type { NextFunction, Request, Response } from 'express'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'FORBIDDEN_ORIGIN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'PARSE_ERROR'
  | 'BAD_REQUEST'
  | 'SESSION_CLOSED'

export class ApiError extends Error {
  public readonly status: number
  public readonly code: ApiErrorCode
  public readonly details?: unknown

  constructor(params: { status: number; code: ApiErrorCode; message: string; details?: unknown }) {
    super(params.message)
    this.status = params.status
    this.code = params.code
    this.details = params.details
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }

export const sendError = (req: Request, res: Response, error: unknown) => {
  const traceId = (req as any).traceId as string | undefined

  if (error instanceof ApiError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      details: error.details ?? null,
      traceId: traceId ?? null,
    })
    return
  }

  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
    details: null,
    traceId: traceId ?? null,
  })
}


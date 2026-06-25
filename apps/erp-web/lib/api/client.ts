'use client'

/**
 * Helper central para fazer fetch autenticado para a API.
 *
 * - Injeta automaticamente `Authorization: Bearer <token>` do localStorage
 * - Normaliza erros em `ApiError` (status + message)
 * - Suporta JSON request/response
 *
 * O cookie httpOnly do backend não atravessa o proxy Next.js (porta 3103 →
 * 3100), então o token JWT precisa ser reenviado no header Authorization.
 */

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const TOKEN_KEY = 'erp:auth:token'

function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export type ApiFetchOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown
  headers?: Record<string, string>
  /** AbortSignal para cancelar a requisição (ex: componente desmontou). */
  signal?: AbortSignal
}

export async function apiFetch<T = unknown>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, signal, ...rest } = opts
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...getAuthHeaders(extraHeaders ?? {}),
  }
  let payload: BodyInit | undefined
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(path, { ...rest, headers, body: payload, credentials: 'include', signal })
  const text = await res.text()
  let json: unknown = null
  if (text) {
    try { json = JSON.parse(text) } catch { json = text }
  }
  if (!res.ok) {
    const msg =
      (json && typeof json === 'object' && (('message' in json && typeof (json as { message?: unknown }).message === 'string')
        ? (json as { message: string }).message
        : ('error' in json && typeof (json as { error?: unknown }).error === 'string')
          ? (json as { error: string }).error
          : null)) || `Erro ${res.status}`
    // SECURITY: dispara evento global em 401 para que a UI mostre banner
    // de sessão expirada e ofereça re-login (ao invés de quebrar silenciosamente).
    if (res.status === 401 && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('auth:unauthorized')) } catch { /* silent */ }
    }
    throw new ApiError(res.status, msg as string, json)
  }
  return json as T
}

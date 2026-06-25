import { useSessionStore, type Me } from '@/stores/sessionStore'

export type ApiErrorShape = {
  code: string
  message: string
  details: unknown
  traceId: string | null
}

export class ApiError extends Error {
  public readonly status: number
  public readonly body: ApiErrorShape | null

  constructor(params: { status: number; message: string; body: ApiErrorShape | null }) {
    super(params.message)
    this.status = params.status
    this.body = params.body
  }
}

const getHeaders = () => {
  const token = useSessionStore.getState().token
  const me = useSessionStore.getState().me

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (me?.tenantId) headers['X-Tenant-Id'] = me.tenantId
  if (me?.branchId) headers['X-Branch-Id'] = me.branchId
  return headers
}

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: { ...getHeaders(), ...(init?.headers ?? {}) },
  })

  const text = await res.text()
  const json = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const body = (json && typeof json === 'object' ? (json as ApiErrorShape) : null) as ApiErrorShape | null
    throw new ApiError({
      status: res.status,
      message: body?.message ?? 'Falha na requisição',
      body,
    })
  }

  return json as T
}

export const login = async (params: { email: string; password: string }) => {
  const res = await apiFetch<{ token: string; me: Me }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  useSessionStore.getState().setSession(res)
  return res
}

export const getMe = async () => {
  return apiFetch<Me>('/api/v1/me')
}


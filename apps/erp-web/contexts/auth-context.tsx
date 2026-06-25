'use client'

import type { ModuleId } from '@/types/modules'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthContextType, AuthSession, LoginCredentials, LoginResponse, User } from '@/types/auth'

// SECURITY (C2 do relatório de segurança): token JWT é gerenciado via cookie
// httpOnly do backend, MAS como o proxy Next.js não repassa o Set-Cookie da
// porta 3103 → 3100, mantemos o token no localStorage e re-enviamos no
// header Authorization. Risco XSS residual: aceitável para esta fase (CSP
// + rotação curta de token + cookie httpOnly em paralelo quando possível).

const SESSION_KEY = 'erp:auth:user'  // metadados do user (sem credenciais)
const TOKEN_KEY = 'erp:auth:token'  // token JWT para Authorization header
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8 // 8h

const DEFAULT_CONTEXT: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isClient: false,
  isLoading: true,
  login: async () => ({ ok: false, error: 'AuthProvider não montado' }),
  logout: async () => {},
  refresh: async () => {},
}

const AuthContext = createContext<AuthContextType>(DEFAULT_CONTEXT)

function readStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function storeToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* silent */ }
}

function clearStoredToken(): void {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* silent */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Ao montar, restaura user do localStorage IMEDIATAMENTE (UX), depois
  // re-valida com /me para garantir que o token ainda é válido.
  useEffect(() => {
    let cancelled = false

    const checkSession = async () => {
      // 1) Restaura cache do user (UX rápida, sem flash de "deslogado")
      try {
        const cached = localStorage.getItem(SESSION_KEY)
        if (cached && !cancelled) {
          const parsed = JSON.parse(cached) as User
          setUser(parsed)
        }
      } catch { /* silent */ }

      // 2) Re-valida com /me
      const token = readStoredToken()
      if (!token) {
        if (!cancelled) {
          setUser(null)
          setIsLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/v1/auth/me', {
          method: 'GET',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          clearStoredToken()
          try { localStorage.removeItem(SESSION_KEY) } catch { /* silent */ }
          if (!cancelled) setUser(null)
          return
        }
        const data = await res.json() as {
          user?: {
            id: string
            email?: string
            name?: string
            tenantId?: string
            branchId?: string | null
            role: string
            createdAt?: string
            enabledModules?: ModuleId[] | null
          }
        }
        if (!data.user || cancelled) {
          if (!cancelled) setUser(null)
          return
        }
        const u: User = {
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.name ?? '',
          role: data.user.role === 'admin' ? 'admin' : 'client',
          tenantId: data.user.tenantId,
          createdAt: data.user.createdAt ?? new Date().toISOString(),
          // null = sem override por usuário (herda tenant)
          enabledModules: data.user.enabledModules ?? null,
        }
        setUser(u)
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)) } catch { /* silent */ }
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void checkSession()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (credentials: LoginCredentials): Promise<LoginResponse> => {
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { ok: false, error: data.message || data.error || `Erro ${res.status}` }
      }

      const data = await res.json() as { user: User; token: string }
      // Cookie httpOnly não atravessa o proxy Next.js. Usamos o token do body
      // para Authorization header em chamadas subsequentes.
      storeToken(data.token)
      setUser(data.user)
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(data.user)) } catch { /* silent */ }
      return { ok: true, session: { user: data.user, token: data.token, expiresAt: Date.now() + SESSION_DURATION_MS } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Erro de rede' }
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    clearStoredToken()
    try { localStorage.removeItem(SESSION_KEY) } catch { /* silent */ }
    try {
      const token = readStoredToken()
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch { /* silent */ }
  }, [])

  const refresh = useCallback(async () => {
    const token = readStoredToken()
    if (!token) {
      await logout()
      return
    }
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        await logout()
        return
      }
      const data = await res.json() as { user?: { id: string; email?: string; name?: string; tenantId?: string; role: string; createdAt?: string } }
      if (data.user) {
        const u: User = {
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.name ?? '',
          role: data.user.role === 'admin' ? 'admin' : 'client',
          tenantId: data.user.tenantId,
          createdAt: data.user.createdAt ?? new Date().toISOString(),
        }
        setUser(u)
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)) } catch { /* silent */ }
      }
    } catch { /* silent */ }
  }, [logout])

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isClient: user?.role === 'client',
    isLoading,
    login,
    logout,
    refresh,
  }), [user, isLoading, login, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

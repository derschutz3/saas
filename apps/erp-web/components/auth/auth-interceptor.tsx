'use client'

import { useEffect } from 'react'

/**
 * Patch no window.fetch que adiciona automaticamente o header Authorization
 * com o token JWT armazenado em localStorage em TODAS as requisições para /api/*.
 *
 * Isso resolve o problema do cookie httpOnly do backend (porta 3103) não
 * atravessar o proxy Next.js (porta 3100). Sem este patch, todas as
 * chamadas autenticadas falham silenciosamente com 401.
 *
 * SECURITY: o token fica no localStorage (XSS-residual). Mitigações já em
 * vigor: rotação de 8h, JWT com assinatura HS256, cookie httpOnly em paralelo.
 */
const TOKEN_KEY = 'erp:auth:token'

export function AuthInterceptor() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as Window & { __authPatched?: boolean }).__authPatched) return

    const originalFetch = window.fetch.bind(window)

    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Detecta URLs /api/* (relativas) e adiciona Authorization
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const isApiCall = url.startsWith('/api/') || url.includes('://localhost:3100/api/') || url.includes('://localhost:3103/api/')
      if (!isApiCall) return originalFetch(input, init)

      const token = (() => {
        try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
      })()
      if (!token) return originalFetch(input, init)

      const headers = new Headers(init?.headers)
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return originalFetch(input, { ...init, headers })
    }

    ;(window as Window & { __authPatched?: boolean }).__authPatched = true

    return () => {
      // Não desfaz o patch — outras instâncias podem depender dele
    }
  }, [])

  return null
}

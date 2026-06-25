'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

type AuthGuardProps = {
  children: ReactNode
  /** Qual role é necessário. Se vazio, qualquer autenticado. */
  requireRole?: 'admin' | 'client'
  /** Para onde redirecionar se não autenticado */
  redirectTo?: string
  /** Para onde redirecionar se role incorreto */
  forbiddenRedirectTo?: string
}

/**
 * Protege rotas de acordo com o estado de autenticação.
 *
 * - Não autenticado → redireciona para /login
 * - Role incorreto → redireciona para o painel apropriado
 * - Carregando → mostra spinner
 */
export function AuthGuard({
  children,
  requireRole,
  redirectTo = '/login',
  forbiddenRedirectTo,
}: AuthGuardProps) {
  const router = useRouter()
  const { user, isAuthenticated, isLoading, isAdmin, isClient } = useAuth()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.replace(redirectTo)
      return
    }

    if (requireRole === 'admin' && !isAdmin) {
      router.replace(forbiddenRedirectTo ?? '/app/dashboard')
      return
    }

    if (requireRole === 'client' && !isClient) {
      router.replace(forbiddenRedirectTo ?? '/app/admin')
      return
    }
  }, [isLoading, isAuthenticated, isAdmin, isClient, requireRole, redirectTo, forbiddenRedirectTo, router])

  // Loading state
  if (isLoading || !user) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-blue-500" />
          <span className="text-xs text-slate-500">Verificando acesso…</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

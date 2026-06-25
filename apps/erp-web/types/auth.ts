/**
 * Sistema de autenticação multi-tenant.
 *
 * Existem 2 tipos de usuários:
 *  - ADMIN: Você (dono do SaaS) - gerencia tenants, planos, métricas globais
 *  - CLIENT: Cliente (tenant) - usa o ERP para seu próprio negócio
 */

// SECURITY: import relativo (não @/) porque este arquivo é importado
// também pelo backend (api/routes), onde o alias @ aponta para ./src.
import type { ModuleId } from './modules'

export type UserRole = 'admin' | 'client'

export type SubscriptionPlan = 'starter' | 'pro' | 'enterprise'

export type User = {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
  createdAt: string
  // Apenas para clients
  tenantId?: string
  tenantName?: string
  plan?: SubscriptionPlan
  // Apenas para clients: módulos permitidos para este usuário.
  // null/undefined = herda dos módulos do tenant (sem restrição por usuário).
  enabledModules?: ModuleId[] | null
}

export type AuthSession = {
  user: User
  token: string
  expiresAt: number
}

export type LoginCredentials = {
  email: string
  password: string
}

export type LoginResponse = {
  ok: boolean
  session?: AuthSession
  error?: string
}

export type AuthContextType = {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isClient: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<LoginResponse>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

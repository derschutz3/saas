'use client'

/**
 * Cliente HTTP para o módulo de Configurações.
 *
 * Endpoints:
 *   GET    /api/v1/settings/me/tenant
 *   PATCH  /api/v1/settings/me/tenant
 *   GET    /api/v1/settings/users
 *   POST   /api/v1/settings/users
 *   PATCH  /api/v1/settings/users/:id
 *   DELETE /api/v1/settings/users/:id
 *   GET    /api/v1/settings/branches
 *   POST   /api/v1/settings/branches
 *   PATCH  /api/v1/settings/branches/:id
 *   DELETE /api/v1/settings/branches/:id
 */

import type { ModuleId } from '@/types/modules'

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STOCK' | 'FISCAL' | 'KITCHEN' | 'DELIVERY' | 'VIEWER'
export type BusinessType = 'RESTAURANT' | 'PIZZARIA' | 'BAR' | 'BAKERY' | 'GROCERY' | 'MARKET' | 'PHARMACY' | 'OTHER'

export type SettingsTenant = {
  id: string
  name: string
  businessType: string
  enabledModules: string[]
  legalName: string | null
  tradeName: string | null
  taxId: string | null
  createdAt: string
}

export type SettingsUser = {
  id: string
  tenantId: string
  branchId: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  /**
   * Override dos módulos permitidos para este usuário.
   * - `null` / `undefined` → herda dos módulos do tenant (sem restrição por usuário)
   * - `[]` → override explícito vazio (sem módulos)
   * - lista explícita → restringe aos módulos listados
   */
  enabledModules: ModuleId[] | null
}

export type SettingsBranch = {
  id: string
  tenantId: string
  name: string
}

export type UserInput = {
  name: string
  email: string
  password?: string
  role: UserRole
  branchId?: string | null
  active?: boolean
  /**
   * Override dos módulos permitidos.
   * - omit / undefined → herda do tenant
   * - `[]` → bloqueia tudo (sem módulos)
   * - lista → restringe aos módulos listados
   */
  enabledModules?: ModuleId[]
}

export type UserUpdateInput = {
  name?: string
  email?: string
  password?: string
  role?: UserRole
  branchId?: string | null
  active?: boolean
  /**
   * Override dos módulos permitidos.
   * - `null` explícito → remove override (herda do tenant)
   * - `[]` → override explícito vazio (sem módulos)
   * - lista → restringe aos módulos listados
   */
  enabledModules?: ModuleId[] | null
}

export type BranchInput = { name: string }

const BASE = '/api/v1/settings'

class ApiErr extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function req<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const data: { code?: string; message?: string; error?: string } = await res
      .json()
      .catch(() => ({}))
    throw new ApiErr(res.status, data.code ?? data.error ?? 'ERROR', data.message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export const settingsApi = {
  getTenant: (signal?: AbortSignal) => req<SettingsTenant>('GET', `${BASE}/me/tenant`, undefined, signal),
  updateTenant: (body: { businessType: BusinessType; legalName?: string | null; tradeName?: string | null; taxId?: string | null }, signal?: AbortSignal) =>
    req<SettingsTenant>('PATCH', `${BASE}/me/tenant`, body, signal),
  listUsers: (params: { includeInactive?: boolean } = {}, signal?: AbortSignal) => {
    const sp = new URLSearchParams()
    if (params.includeInactive) sp.set('includeArchived', 'true')
    const qs = sp.toString()
    return req<{ items: SettingsUser[] }>('GET', qs ? `${BASE}/users?${qs}` : `${BASE}/users`, undefined, signal)
  },
  createUser: (body: UserInput, signal?: AbortSignal) => req<SettingsUser>('POST', `${BASE}/users`, body, signal),
  updateUser: (id: string, body: UserUpdateInput, signal?: AbortSignal) => req<SettingsUser>('PATCH', `${BASE}/users/${id}`, body, signal),
  deleteUser: (id: string, signal?: AbortSignal) => req<{ deletedId: string }>('DELETE', `${BASE}/users/${id}`, undefined, signal),
  listBranches: (signal?: AbortSignal) => req<{ items: SettingsBranch[] }>('GET', `${BASE}/branches`, undefined, signal),
  createBranch: (body: BranchInput, signal?: AbortSignal) => req<SettingsBranch>('POST', `${BASE}/branches`, body, signal),
  updateBranch: (id: string, body: BranchInput, signal?: AbortSignal) => req<SettingsBranch>('PATCH', `${BASE}/branches/${id}`, body, signal),
  deleteBranch: (id: string, signal?: AbortSignal) => req<{ deletedId: string }>('DELETE', `${BASE}/branches/${id}`, undefined, signal),
}

export { ApiErr }

// ===== Helpers =====

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  CASHIER: 'Caixa',
  STOCK: 'Estoque',
  FISCAL: 'Fiscal',
  KITCHEN: 'Cozinha',
  DELIVERY: 'Entregador',
  VIEWER: 'Visualizador',
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  RESTAURANT: 'Restaurante',
  PIZZARIA: 'Pizzaria',
  BAR: 'Bar',
  BAKERY: 'Padaria',
  GROCERY: 'Mercearia',
  MARKET: 'Supermercado',
  PHARMACY: 'Farmácia',
  OTHER: 'Outro',
}

'use client'

/**
 * Contexto de módulos do ERP.
 *
 * Resolve os módulos efetivos considerando duas fontes:
 *  1. **Override por usuário** (`user.enabledModules`)
 *     - null/undefined → herda do tenant
 *     - [] → override explícito vazio (sem módulos)
 *     - [...] → override restrito (só os listados)
 *  2. **Módulos do tenant** (definidos pelo businessType via /api/v1/modules/current)
 *
 * Quando o usuário tem override explícito, o businessType do tenant é
 * IGNORADO — o usuário vê exatamente o que foi configurado.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { BusinessType, ModuleId } from '@/types/modules'
import { useFetch, invalidateCache } from '@/lib/use-fetch'
import { useAuth } from './auth-context'

const DEFAULT_MODULES: ModuleId[] = [
  'dashboard', 'orders', 'queue', 'marketplace', 'inventory',
  'purchases', 'customers', 'cash', 'fiscal', 'reports',
  'integrations', 'settings'
]

interface ModuleContextType {
  enabledModules: ModuleId[]
  businessType: BusinessType | null
  /** True se o usuário tem override por usuário (não herda do tenant). */
  hasUserOverride: boolean
  isLoading: boolean
  isValidating: boolean
  setBusinessType: (type: BusinessType) => Promise<void>
  enableModule: (moduleId: ModuleId) => Promise<void>
  disableModule: (moduleId: ModuleId) => Promise<void>
  refresh: () => Promise<void>
}

const ModuleContext = createContext<ModuleContextType>({
  enabledModules: DEFAULT_MODULES,
  businessType: null,
  hasUserOverride: false,
  isLoading: false,
  isValidating: false,
  setBusinessType: async () => {},
  enableModule: async () => {},
  disableModule: async () => {},
  refresh: async () => {},
})

type ApiResponse = {
  businessType?: BusinessType | null
  enabledModules?: ModuleId[]
}

const fetchModules = async (signal: AbortSignal): Promise<ApiResponse> => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('erp:auth:token') : null
  const res = await fetch('/api/v1/modules/current', {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  })
  if (!res.ok) throw new Error(`Failed to fetch modules: ${res.status}`)
  return res.json()
}

export function ModuleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const cacheKey = user ? `modules:current:${user.id}` : 'modules:current:anon'

  const { data, isLoading, isValidating, mutate } = useFetch<ApiResponse>(
    cacheKey,
    fetchModules,
    {
      ttl: 60_000,
      dedupingInterval: 5000,
      retries: 2,
      revalidateOnFocus: true,
    },
  )

  const tenantModules = data?.enabledModules?.length ? data.enabledModules : DEFAULT_MODULES
  const businessType = data?.businessType ?? null

  // Resolve módulos efetivos:
  // - user.enabledModules = null/undefined → tenantModules (herança)
  // - user.enabledModules = Array → override do usuário (mesmo se vazio)
  const { enabledModules, hasUserOverride } = useMemo(() => {
    const ovr = user?.enabledModules
    if (ovr === undefined || ovr === null) {
      return { enabledModules: tenantModules, hasUserOverride: false }
    }
    return { enabledModules: ovr, hasUserOverride: true }
  }, [user?.enabledModules, tenantModules])

  const refresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  const setBusinessType = useCallback(async (type: BusinessType) => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('erp:auth:token') : null
    const res = await fetch('/api/v1/modules/set-business-type', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ businessType: type }),
    })
    if (!res.ok) throw new Error(`Failed to set business type: ${res.status}`)
    invalidateCache(cacheKey)
    await mutate()
  }, [mutate, cacheKey])

  const enableModule = useCallback(async (moduleId: ModuleId) => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('erp:auth:token') : null
    const res = await fetch('/api/v1/modules/enable', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ moduleId }),
    })
    if (!res.ok) throw new Error(`Failed to enable module: ${res.status}`)
    invalidateCache(cacheKey)
    await mutate()
  }, [mutate, cacheKey])

  const disableModule = useCallback(async (moduleId: ModuleId) => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('erp:auth:token') : null
    const res = await fetch('/api/v1/modules/disable', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ moduleId }),
    })
    if (!res.ok) throw new Error(`Failed to disable module: ${res.status}`)
    invalidateCache(cacheKey)
    await mutate()
  }, [mutate, cacheKey])

  return (
    <ModuleContext.Provider value={{
      enabledModules,
      businessType,
      hasUserOverride,
      isLoading,
      isValidating,
      setBusinessType,
      enableModule,
      disableModule,
      refresh,
    }}>
      {children}
    </ModuleContext.Provider>
  )
}

export function useModules() {
  return useContext(ModuleContext)
}

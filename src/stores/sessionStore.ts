import { create } from 'zustand'

export type Me = {
  id: string
  name: string
  email: string
  role: string
  tenantId: string
  branchId: string | null
}

type SessionState = {
  token: string | null
  me: Me | null
  setSession: (params: { token: string; me: Me }) => void
  clear: () => void
}

const storageKey = 'erp-bebidas.session.v1'

const load = (): Pick<SessionState, 'token' | 'me'> => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { token: null, me: null }
    const parsed = JSON.parse(raw) as { token?: string; me?: Me }
    return { token: parsed.token ?? null, me: parsed.me ?? null }
  } catch {
    return { token: null, me: null }
  }
}

const persist = (state: Pick<SessionState, 'token' | 'me'>) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    return
  }
}

export const useSessionStore = create<SessionState>((set) => {
  const initial = typeof window === 'undefined' ? { token: null, me: null } : load()

  return {
    token: initial.token,
    me: initial.me,
    setSession: (params) => {
      set({ token: params.token, me: params.me })
      persist({ token: params.token, me: params.me })
    },
    clear: () => {
      set({ token: null, me: null })
      persist({ token: null, me: null })
    },
  }
})

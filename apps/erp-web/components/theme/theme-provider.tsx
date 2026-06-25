'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeName = 'dark' | 'light'

type ThemeContextValue = {
  theme: ThemeName
  setTheme: (t: ThemeName) => void
  toggle: () => void
  isHydrated: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'erp:theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark')
  const [isHydrated, setIsHydrated] = useState(false)

  // Hidrata do localStorage (ou respeita a preferência do sistema)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null
      if (stored === 'dark' || stored === 'light') {
        setThemeState(stored)
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
        setThemeState(prefersLight ? 'light' : 'dark')
      }
    } catch { /* ignore */ }
    setIsHydrated(true)
  }, [])

  // Aplica no <html>
  useEffect(() => {
    if (!isHydrated) return
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch { /* quota */ }
  }, [theme, isHydrated])

  // Previne FOUC
  useEffect(() => {
    const root = document.documentElement
    const stored = (() => {
      try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
    })()
    if (stored === 'dark' || stored === 'light') {
      root.setAttribute('data-theme', stored)
    }
  }, [])

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t)
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, toggle, isHydrated }),
    [theme, setTheme, toggle, isHydrated],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // fallback seguro para evitar crash em SSR ou fora do provider
    return {
      theme: 'dark',
      setTheme: () => undefined,
      toggle: () => undefined,
      isHydrated: false,
    }
  }
  return ctx
}

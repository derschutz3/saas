'use client'

import * as React from 'react'
import type { NavItem } from '@/lib/nav'

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  onNavigate: (href: string) => void
  allItems: NavItem[]
}

export function CommandPalette({ open, onOpenChange, onNavigate, allItems }: CommandPaletteProps) {
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Pré-computa os itens uma vez
  const items = React.useMemo(
    () =>
      allItems.map((it) => ({
        key: it.key,
        title: it.label,
        href: it.href,
        keywords: [it.label, ...(it.keywords ?? [])].join(' ').toLowerCase(),
      })),
    [allItems]
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.title.toLowerCase().includes(q) || it.keywords.includes(q))
  }, [query, items])

  // Reset query ao abrir/fechar
  React.useEffect(() => {
    if (open) {
      setQuery('')
      // Foco no input
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-in"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800/80 shadow-2xl"
        style={{
          backgroundColor: 'hsl(222 47% 9%)',
          boxShadow: '0 0 0 1px hsl(217 91% 67% / 0.15), 0 25px 60px -12px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-800/60 px-4 py-3.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-slate-500">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M10 10l2.5 2.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar páginas e ações..."
            className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="kbd shrink-0">Esc</span>
        </div>

        <div className="max-h-72 overflow-y-auto p-2 will-change-scroll">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-600">Nenhum resultado encontrado</div>
          ) : (
            <>
              <div className="section-label px-3 py-1">Navegação</div>
              {filtered.map((it) => (
                <button
                  key={it.key}
                  onClick={() => onNavigate(it.href)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-slate-800/60 text-left"
                >
                  <span className="text-slate-300 truncate">{it.title}</span>
                  <span className="kbd ml-auto shrink-0">↵</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * ThemeSwitch — alterna entre Dark Luxe e White Luxe.
 *
 * Variantes:
 *  - default: pill horizontal com Sun/Moon
 *  - compact: apenas os dois ícones, ideal para sidebar
 *  - landing: versão grande com label, para a home pública
 */
import { Sun, Moon } from 'lucide-react'
import { useTheme } from './theme-provider'

type Variant = 'default' | 'compact' | 'landing'

export function ThemeSwitch({ variant = 'default' }: { variant?: Variant }) {
  const { theme, toggle, isHydrated } = useTheme()
  const isLight = theme === 'light'

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
        title={isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
        className="btn-icon size-9"
        data-testid="theme-switch"
        suppressHydrationWarning
      >
        {isHydrated && isLight ? (
          <Moon className="size-4" strokeWidth={1.6} />
        ) : (
          <Sun className="size-4" strokeWidth={1.6} />
        )}
      </button>
    )
  }

  if (variant === 'landing') {
    return (
      <button
        type="button"
        onClick={toggle}
        className="group inline-flex items-center gap-2 rounded-full border border-line bg-bg-2/70 px-3 py-1.5 text-paper-2 hover:bg-bg-3 hover:text-paper transition-all duration-200 backdrop-blur"
        aria-label="Alternar tema"
        data-testid="theme-switch"
        suppressHydrationWarning
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-bg-3 ring-1 ring-line text-gold">
          {isHydrated && isLight ? (
            <Moon className="size-3.5" strokeWidth={1.6} />
          ) : (
            <Sun className="size-3.5" strokeWidth={1.6} />
          )}
        </span>
        <span className="text-[11px] font-mono font-semibold tracking-[0.18em] uppercase">
          {isHydrated && isLight ? 'Dark' : 'Light'}
        </span>
      </button>
    )
  }

  // default — pill com label
  return (
    <button
      type="button"
      onClick={toggle}
      className="group relative inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-2 px-3 text-paper-2 hover:border-accent/50 hover:text-paper transition-all duration-200"
      aria-label="Alternar tema"
      data-testid="theme-switch"
      suppressHydrationWarning
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-bg-3 text-gold transition-transform duration-300 group-hover:rotate-45">
        {isHydrated && isLight ? (
          <Moon className="size-3" strokeWidth={1.6} />
        ) : (
          <Sun className="size-3" strokeWidth={1.6} />
        )}
      </span>
      <span className="text-[10px] font-mono font-semibold tracking-[0.18em] uppercase">
        {isHydrated && isLight ? 'Dark' : 'Light'}
      </span>
    </button>
  )
}

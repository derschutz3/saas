'use client'

/**
 * Barra de progresso de navegação global.
 * Aparece no topo da tela quando Next.js está fazendo prefetch/route transition.
 */
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    // Detecta cliques em Links
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor && anchor.href && !anchor.target && !e.metaKey && !e.ctrlKey) {
        const url = new URL(anchor.href)
        if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
          setIsNavigating(true)
        }
      }
    }

    const onPopState = () => setIsNavigating(true)

    document.addEventListener('click', onClick)
    window.addEventListener('popstate', onPopState)

    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  // Reseta quando a rota muda
  useEffect(() => {
    setIsNavigating(false)
  }, [pathname, searchParams])

  if (!isNavigating) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none"
      role="status"
      aria-label="Carregando página"
    >
      <div
        className="h-full"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(217 91% 67%), hsl(168 76% 69%), hsl(217 91% 67%), transparent)',
          backgroundSize: '200% 100%',
          animation: 'progress-shimmer 1.2s ease-in-out infinite',
        }}
      />
      <style jsx>{`
        @keyframes progress-shimmer {
          0% { background-position: 200% 0; opacity: 0.6; }
          50% { opacity: 1; }
          100% { background-position: -200% 0; opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}

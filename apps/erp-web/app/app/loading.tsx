'use client'

/**
 * Layout para páginas que usam 'use client' + estado pesado.
 * Envolve a página com Suspense + Skeleton para evitar TTI ruim.
 */

import { Suspense, type ReactNode } from 'react'
import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function PageLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {children}
    </Suspense>
  )
}

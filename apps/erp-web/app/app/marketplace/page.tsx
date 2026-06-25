'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '@/components/ui/page-skeleton'

// Marketplace tem dados pesados (4+ cards, stats, providers) — lazy load
const MarketplacePage = dynamic(
  () => import('./marketplace-client').then((m) => m.default),
  {
    loading: () => <PageSkeleton />,
    ssr: false,
  }
)

export default function Page() {
  return <MarketplacePage />
}

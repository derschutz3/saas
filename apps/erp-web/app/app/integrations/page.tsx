'use client'

// Redirect para /app/marketplace (a página real de Integrações).
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IntegrationsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/app/marketplace')
  }, [router])
  return null
}

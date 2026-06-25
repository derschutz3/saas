import { AdminLayout } from '@/components/layout/admin-layout'
import { AuthGuard } from '@/components/auth/auth-guard'

/**
 * Layout da área administrativa (master).
 *
 * - Protegido: apenas role="admin" entra
 * - Cliente autenticado tentando acessar /admin/* → redirecionado para /app/dashboard
 * - Não autenticado → redirecionado para /login
 */
export default function AdminAreaLayout(props: { children: React.ReactNode }) {
  return (
    <AuthGuard requireRole="admin" redirectTo="/login" forbiddenRedirectTo="/app/dashboard">
      <AdminLayout>{props.children}</AdminLayout>
    </AuthGuard>
  )
}

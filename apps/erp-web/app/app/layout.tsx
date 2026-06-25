import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ModuleProvider } from '@/contexts/module-context'
import { AuthGuard } from '@/components/auth/auth-guard'

// Layout do cliente: tudo que está em /app/* é acessível para QUALQUER usuário autenticado
// (clientes e admins que estejam visualizando como cliente via botão "Ver como cliente")
// Apenas usuários não autenticados são redirecionados para /login

export default function AppLayout(props: { children: React.ReactNode }) {
  return (
    <AuthGuard redirectTo="/login">
      <ModuleProvider>
        <DashboardLayout>{props.children}</DashboardLayout>
      </ModuleProvider>
    </AuthGuard>
  )
}


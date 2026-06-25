import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import type { ReactNode } from 'react'
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  LogOut,
  Package,
  Settings,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { GarciatWordmark } from '@/components/brand/Logo'

const NavItem = (props: { to: string; label: string; icon: ReactNode }) => {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
          isActive
            ? 'bg-app-s2 text-app-text'
            : 'text-app-muted hover:bg-app-s2 hover:text-app-text',
        )
      }
    >
      <span className="text-app-muted group-hover:text-app-text">{props.icon}</span>
      <span className="truncate">{props.label}</span>
    </NavLink>
  )
}

export default function AppShell() {
  const me = useSessionStore((s) => s.me)
  const clear = useSessionStore((s) => s.clear)
  const navigate = useNavigate()

  return (
    <div className="ui-shell">
      <div className="mx-auto grid max-w-[1480px] grid-cols-[288px_1fr] gap-6 px-6 py-6">
        <aside className="ui-panel sticky top-6 h-[calc(100dvh-48px)] p-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <GarciatWordmark size="sm" />
            <div className="ml-auto min-w-0 text-right">
              <div className="truncate text-xs text-app-muted">{me?.name ?? 'Sessão'}</div>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <NavItem to="/app/dashboard" label="Dashboard" icon={<Gauge className="size-4" />} />
            <NavItem to="/app/reports" label="Relatórios" icon={<BarChart3 className="size-4" />} />
            <NavItem to="/app/orders/new" label="Pedido rápido" icon={<ClipboardList className="size-4" />} />
            <NavItem to="/app/orders/queue" label="Fila de pedidos" icon={<Package className="size-4" />} />
            <NavItem to="/app/inventory" label="Estoque" icon={<Boxes className="size-4" />} />
            <NavItem to="/app/finance/cash" label="Caixa" icon={<CreditCard className="size-4" />} />
            <NavItem to="/app/fiscal/monitor" label="Monitor fiscal" icon={<FileText className="size-4" />} />
          </div>

          <div className="ui-divider mt-6 pt-4">
            <NavItem to="/app/admin/master-data" label="Cadastros" icon={<Settings className="size-4" />} />
          </div>

          <button
            type="button"
            onClick={() => {
              clear()
              navigate('/login')
            }}
            className="ui-btn ui-btn-ghost mt-6 w-full text-app-muted hover:text-app-text"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </aside>

        <main className="min-w-0">
          <header className="mb-6 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-xs text-app-muted">
                Tenant {me?.tenantId?.slice(0, 8) ?? '—'} · Filial {me?.branchId?.slice(0, 8) ?? '—'}
              </div>
              <div className="truncate text-2xl font-semibold tracking-tight text-app-text">Operação</div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-app-border bg-app-s1 px-3 py-2 text-xs text-app-muted shadow-panel">
              <span className="inline-flex size-1.5 rounded-full bg-app-accent" />
              <span className="truncate">Ambiente de demonstração</span>
            </div>
          </header>
          <div className="ui-panel p-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

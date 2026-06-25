import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import type { ReactNode } from 'react'
import {
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

const NavItem = (props: { to: string; label: string; icon: ReactNode }) => {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition duration-150',
          isActive
            ? 'bg-app-s2 text-app-text shadow-[inset_0_0_0_1px_rgba(47,111,237,0.25)]'
            : 'text-app-muted hover:bg-app-s2 hover:text-app-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Barra de acento à esquerda do item ativo (toque sci-fi) */}
          <span
            aria-hidden
            className={cn(
              'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-app-primary transition-opacity duration-150',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span className={cn('transition-colors', isActive ? 'text-app-primary' : 'text-app-muted group-hover:text-app-text')}>
            {props.icon}
          </span>
          <span className="truncate">{props.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function AppShell() {
  const me = useSessionStore((s) => s.me)
  const clear = useSessionStore((s) => s.clear)
  const navigate = useNavigate()

  return (
    <div className="ui-shell">
      <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-6 px-4 py-4 md:grid-cols-[288px_1fr] md:px-6 md:py-6">
        <aside className="ui-panel p-4 md:sticky md:top-6 md:h-[calc(100dvh-48px)]">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="grid size-10 place-items-center rounded-xl border border-app-primary/30 bg-gradient-to-br from-app-primary/20 to-app-s2 text-app-primary shadow-[0_0_18px_rgba(47,111,237,0.18)]">
              <Boxes className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-app-text">ERP Bebidas</div>
              <div className="truncate text-xs text-app-muted">{me?.name ?? 'Sessão'}</div>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <NavItem to="/app/dashboard" label="Dashboard" icon={<Gauge className="size-4" />} />
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
            aria-label="Sair da sessão"
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

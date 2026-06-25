'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { useCallback, useMemo, memo } from 'react'
import { adminNavGroups, type AdminNavItem } from '@/lib/admin-nav'
import { NavigationProgress } from './navigation-progress'
import { useAuth } from '@/contexts/auth-context'
import { LogOut, Shield, Eye } from 'lucide-react'
import { ThemeSwitch } from '@/components/theme/theme-switch'

const ALL_ADMIN_ITEMS: AdminNavItem[] = adminNavGroups.flatMap((g) => g.items)

const buildBreadcrumb = (pathname: string) => {
  const match = ALL_ADMIN_ITEMS.find((i) => pathname === i.href || pathname === `/admin${i.href}`)
  if (!match) return [{ label: 'Visão geral', href: '/admin', current: true }]
  const group = adminNavGroups.find((g) => g.items.some((i) => i.key === match.key))?.title ?? 'Admin'
  return [
    { label: group, href: '/admin', current: false },
    { label: match.label, href: match.href, current: true },
  ]
}

const AdminSidebarNav = memo(function AdminSidebarNav({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const router = useRouter()

  const handleMouseEnter = useCallback((href: string) => {
    router.prefetch(href)
  }, [router])

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 will-change-scroll">
      {adminNavGroups.map((g) => (
        <div key={g.title} className="mb-6">
          {!collapsed && (
            <div className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-ink-3 mb-2 px-3">
              {g.title}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href || pathname === `/admin${it.href}`
              const Icon = it.icon
              return (
                <Link
                  key={it.key}
                  href={it.href}
                  prefetch={false}
                  onMouseEnter={() => handleMouseEnter(it.href)}
                  onFocus={() => handleMouseEnter(it.href)}
                  className={`nav-item ${active ? 'active' : ''}`}
                  title={collapsed ? it.label : undefined}
                >
                  <Icon className="size-[15px] shrink-0" strokeWidth={1.6} />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
})

const AdminBreadcrumb = memo(function AdminBreadcrumb({ pathname }: { pathname: string }) {
  const breadcrumb = useMemo(() => buildBreadcrumb(pathname), [pathname])
  return (
    <nav className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase">
      {breadcrumb.map((b, idx) => (
        <React.Fragment key={b.label}>
          {idx > 0 && <span className="text-ink-3">/</span>}
          {b.current ? (
            <span className="text-paper bg-ink px-2 py-0.5">{b.label}</span>
          ) : (
            <Link href={b.href} className="text-ink-3 hover:text-ink transition-colors">
              {b.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
})

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = React.useState(false)
  const { user, logout } = useAuth()

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), [])

  const handleLogout = useCallback(async () => {
    await logout()
    router.replace('/login')
  }, [logout, router])

  const initials = useMemo(() => {
    if (!user?.name) return 'AD'
    return user.name.split(' ').slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()
  }, [user?.name])

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <NavigationProgress />

      {/* === SIDEBAR === */}
      <aside
        className={`flex flex-col border-r border-line transition-all duration-300 bg-bg ${
          collapsed ? 'w-[72px]' : 'w-[268px]'
        } shrink-0`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <div className="flex size-9 shrink-0 items-center justify-center bg-ink text-paper">
            <Shield className="size-4" strokeWidth={1.6} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-base font-semibold tracking-tight text-ink">
                Painel <span className="italic-accent">Master</span>
              </div>
              <div className="truncate font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 mt-0.5">
                ERP Universal · Admin
              </div>
            </div>
          )}
          <button onClick={toggleCollapsed} className="btn-icon size-8 shrink-0" aria-label="Colapsar sidebar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d={collapsed ? 'M5 3l4 4-4 4' : 'M9 3L5 7l4 4'} />
            </svg>
          </button>
        </div>

        <AdminSidebarNav pathname={pathname} collapsed={collapsed} />

        {/* User footer */}
        <div className="border-t border-line px-3 py-3">
          <div className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-all duration-200 hover:bg-bg-2">
            <div className="relative shrink-0">
              <div className="flex size-8 items-center justify-center bg-accent-soft text-accent font-display text-[13px] font-semibold">
                {initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-paper bg-emerald-500" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate font-sans text-[13px] font-semibold text-ink">{user?.name ?? 'Admin'}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="size-1 bg-emerald-500 rounded-full" />
                  <span className="truncate font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3">
                    Administrador
                  </span>
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="btn-icon size-7 shrink-0"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="size-3.5" strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* === MAIN === */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-3 bg-bg">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <AdminBreadcrumb pathname={pathname} />
            <span className="hidden md:inline-flex font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 items-center gap-2">
              <span className="size-1 bg-ink-3 rounded-full" />
              Painel Master
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeSwitch variant="compact" />
            <Link
              href="/app/dashboard"
              className="inline-flex items-center gap-2 h-9 px-3 border border-accent/40 text-accent hover:bg-accent-soft transition-colors font-sans text-[11px] font-semibold tracking-[0.15em] uppercase"
            >
              <Eye className="size-3.5" strokeWidth={1.8} />
              Ver como cliente
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto will-change-scroll">
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
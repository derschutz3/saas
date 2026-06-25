'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { useMemo, useCallback, memo, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { navGroups, type NavItem } from '@/lib/nav'
import { NavigationProgress } from './navigation-progress'
import { useAuth } from '@/contexts/auth-context'
import { Shield, Bell, Search, Plus, LogOut, Settings as SettingsIcon, ShieldCheck, ShieldAlert } from 'lucide-react'
import { ThemeSwitch } from '@/components/theme/theme-switch'

// CommandPalette carregado apenas quando aberto — economiza bundle inicial
const CommandPalette = dynamic(
  () => import('./command-palette').then((m) => m.CommandPalette),
  { ssr: false }
)

const mockUser = { name: 'Admin Demo', role: 'Owner' }

const mockNotifications = [
  { id: 'n1', title: '2 NF-e pendentes', detail: 'Aguardando processamento fiscal', tone: 'yellow' as const },
  { id: 'n2', title: '1 documento rejeitado', detail: 'Verifique e reprocesse', tone: 'red' as const },
  { id: 'n3', title: '7 itens em ruptura', detail: 'Estoque abaixo do ponto de pedido', tone: 'red' as const },
]

// Cache do flatten para evitar recriar a cada render
const ALL_NAV_ITEMS: NavItem[] = navGroups.flatMap((g) => g.items)

const buildBreadcrumb = (pathname: string) => {
  const match = ALL_NAV_ITEMS.find((i) => pathname === i.href || pathname === `/app${i.href}`)
  if (!match) return [{ label: 'Dashboard', href: '/app/dashboard', current: true }]
  const group = navGroups.find((g) => g.items.some((i) => i.key === match.key))?.title ?? 'Sistema'
  return [
    { label: group, href: '/app/dashboard', current: false },
    { label: match.label, href: match.href, current: true },
  ]
}

const TODAY = new Date().toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).replace('.', '')

// Subcomponente memoizado — só re-renderiza se pathname/collapsed mudarem
const SidebarNav = memo(function SidebarNav({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const router = useRouter()

  // Preload on hover — só faz prefetch quando usuário demonstrar intenção
  const handleMouseEnter = useCallback((href: string) => {
    router.prefetch(href)
  }, [router])

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 will-change-scroll">
      {navGroups.map((g) => (
        <div key={g.title} className="mb-6">
          {!collapsed && (
            <div className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-ink-3 mb-2 px-3">
              {g.title}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href || pathname === `/app${it.href}`
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

// Subcomponente memoizado
const Breadcrumb = memo(function Breadcrumb({ pathname }: { pathname: string }) {
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

// Painel de notificações
const NotificationsPanel = memo(function NotificationsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute right-6 top-[72px] z-50 w-[340px] overflow-hidden bg-bg border border-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]"
      role="dialog"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <span className="status-dot status-dot-blue size-2 rounded-full" />
        <span className="font-sans text-[13px] font-semibold text-ink">Alertas fiscais</span>
        <span className="ml-auto pill pill-crimson">3</span>
        <button onClick={onClose} className="ml-2 text-ink-3 hover:text-ink transition-colors text-xs">✕</button>
      </div>
      {mockNotifications.map((n) => (
        <div
          key={n.id}
          className="flex cursor-pointer items-start gap-3 px-4 py-3 border-b border-line transition-colors hover:bg-bg-2"
        >
          <span
            className={`status-dot mt-1.5 size-1.5 shrink-0 rounded-full ${
              n.tone === 'red' ? 'status-dot-red' : n.tone === 'yellow' ? 'status-dot-yellow' : 'status-dot-blue'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="font-sans text-[13px] font-semibold text-ink">{n.title}</div>
            <div className="font-sans text-[12px] text-ink-3 mt-0.5">{n.detail}</div>
          </div>
        </div>
      ))}
      <div className="px-4 py-3 border-t border-line">
        <Link href="/app/fiscal" className="btn-link text-[11px]">Ver todos os alertas</Link>
      </div>
    </div>
  )
})

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = React.useState(false)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [notifOpen, setNotifOpen] = React.useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const { isAdmin, user, logout } = useAuth()

  // SECURITY: detecta 401s globais via window event disparado pelo apiFetch
  // quando o backend rejeita o token. Mostra banner com botão de re-login.
  useEffect(() => {
    const onUnauthorized = (): void => setSessionExpired(true)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  const handleSessionExpired = useCallback(async () => {
    setSessionExpired(false)
    await logout()
    router.replace('/login?reason=session_expired')
  }, [logout, router])

  const handleLogout = useCallback(async () => {
    await logout()
    router.push('/login')
  }, [logout, router])

  // Detecção de Mac memoizada (não muda durante a sessão)
  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform),
    []
  )

  // Keyboard listener com passive flag onde possível
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k'
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault()
        setCommandOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setCommandOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Click outside notifications
  React.useEffect(() => {
    if (!notifOpen) return
    const onClick = () => setNotifOpen(false)
    // delay para não fechar imediatamente após abrir
    const id = setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', onClick)
    }
  }, [notifOpen])

  const handleNavigate = useCallback((href: string) => {
    setCommandOpen(false)
    router.push(href)
  }, [router])

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), [])
  const toggleCommand = useCallback(() => setCommandOpen(true), [])
  const toggleNotif = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifOpen((v) => !v)
  }, [])
  const closeNotif = useCallback(() => setNotifOpen(false), [])

  return (
    <div className="app-shell flex h-screen overflow-hidden font-sans">
      <NavigationProgress />

      {/* === SIDEBAR === */}
      <aside
        className={`flex flex-col border-r border-line transition-all duration-300 bg-bg ${
          collapsed ? 'w-[72px]' : 'w-[268px]'
        } shrink-0`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <Link href="/" className="flex size-9 shrink-0 items-center justify-center bg-ink text-paper">
            <span className="font-display text-sm font-semibold tracking-tight">U</span>
          </Link>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <Link href="/app/dashboard" className="block truncate">
                <div className="font-display text-base font-semibold tracking-tight text-ink">
                  ERP <span className="italic-accent">Universal</span>
                </div>
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 mt-0.5">
                  Ed. 2026 · v4
                </div>
              </Link>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="btn-icon size-8 shrink-0"
            aria-label="Colapsar sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d={collapsed ? 'M5 3l4 4-4 4' : 'M9 3L5 7l4 4'} />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <SidebarNav pathname={pathname} collapsed={collapsed} />

        {/* User footer */}
        <div className="border-t border-line px-3 py-3">
          {collapsed ? (
            // === COLAPSADO: avatar com botões sobrepostos ===
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <div className="flex size-9 items-center justify-center bg-accent-soft text-accent font-display text-[13px] font-semibold ring-1 ring-line">
                  {mockUser.name.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-bg bg-emerald-500" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Link
                  href="/app/settings"
                  className="btn-icon size-8"
                  title="Configurações"
                  aria-label="Configurações"
                >
                  <SettingsIcon className="size-3.5" strokeWidth={1.6} />
                </Link>
                <Link
                  href="/app/profile"
                  className="btn-icon size-8"
                  title="Meus dados (LGPD)"
                  aria-label="Meus dados (LGPD)"
                  data-testid="sidebar-lgpd-link"
                >
                  <ShieldCheck className="size-3.5" strokeWidth={1.6} />
                </Link>
                <button
                  onClick={handleLogout}
                  className="btn-icon size-8 hover:text-crimson"
                  title="Sair"
                  aria-label="Sair"
                  data-testid="logout-button"
                >
                  <LogOut className="size-3.5" strokeWidth={1.6} />
                </button>
              </div>
            </div>
          ) : (
            // === EXPANDIDO: linha com avatar + info + ações ===
            <>
              <div className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-all duration-200 hover:bg-bg-2">
                <div className="relative shrink-0">
                  <div className="flex size-9 items-center justify-center bg-accent-soft text-accent font-display text-[13px] font-semibold ring-1 ring-line">
                    {mockUser.name.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-bg bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-sans text-[13px] font-semibold text-paper">
                    {user?.name ?? mockUser.name}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
                      {user?.role ?? mockUser.role} · {isAdmin ? 'ADMIN' : 'PRO'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1 px-1">
                <Link
                  href="/app/settings"
                  className="flex-1 h-8 flex items-center justify-center gap-1.5 text-[11px] font-mono font-semibold tracking-[0.15em] uppercase text-paper-3 hover:bg-bg-2 hover:text-paper rounded transition-colors"
                  title="Configurações"
                >
                  <SettingsIcon className="size-3" strokeWidth={1.6} />
                  Config
                </Link>
                <Link
                  href="/app/profile"
                  className="flex-1 h-8 flex items-center justify-center gap-1.5 text-[11px] font-mono font-semibold tracking-[0.15em] uppercase text-paper-3 hover:bg-bg-2 hover:text-paper rounded transition-colors"
                  title="Meus dados (LGPD)"
                  data-testid="sidebar-lgpd-link-expanded"
                >
                  <ShieldCheck className="size-3" strokeWidth={1.6} />
                  LGPD
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex-1 h-8 flex items-center justify-center gap-1.5 text-[11px] font-mono font-semibold tracking-[0.15em] uppercase text-paper-3 hover:bg-crimson/10 hover:text-crimson rounded transition-colors"
                  title="Sair da conta"
                  data-testid="logout-button"
                >
                  <LogOut className="size-3" strokeWidth={1.6} />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* === MAIN === */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-3 bg-bg">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Breadcrumb pathname={pathname} />

            <span className="hidden md:inline-flex font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 items-center gap-2">
              <span className="size-1 bg-ink-3 rounded-full" />
              {TODAY}
            </span>

            <button
              onClick={toggleCommand}
              className="hidden h-9 gap-2 px-3 border border-line bg-bg hover:border-ink transition-colors md:inline-flex items-center"
            >
              <Search className="size-3.5 text-ink-3" strokeWidth={1.6} />
              <span className="font-sans text-xs text-ink-3">Buscar módulo, pedido, cliente…</span>
              <span className="flex gap-0.5 ml-3">
                <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span>
                <span className="kbd">K</span>
              </span>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 relative">
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden lg:inline-flex items-center gap-2 h-9 px-3 border border-accent/40 text-accent hover:bg-accent-soft transition-colors font-sans text-[11px] font-semibold tracking-[0.15em] uppercase"
              >
                <Shield className="size-3.5" strokeWidth={1.8} />
                Painel Master
              </Link>
            )}

            <button onClick={toggleNotif} className="btn-icon relative size-9" aria-label="Notificações">
              <Bell className="size-4" strokeWidth={1.6} />
              <span className="absolute right-1 top-1 size-2 rounded-full border-2 border-paper bg-crimson" />
            </button>

            <ThemeSwitch variant="compact" />

            {notifOpen && <NotificationsPanel onClose={closeNotif} />}

            <button
              onClick={() => router.push('/app/orders/new')}
              className="btn-primary h-9 gap-2 px-4 text-[11px]"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              NOVO PEDIDO
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto will-change-scroll">
          {sessionExpired && (
            <div
              role="alert"
              data-testid="session-expired-banner"
              className="mx-6 mt-4 flex items-center gap-3 border border-crimson/40 bg-crimson/10 px-5 py-3 text-sm"
            >
              <ShieldAlert className="size-4 text-crimson" strokeWidth={1.8} />
              <div className="flex-1">
                <strong className="text-crimson">Sessão expirada.</strong>{' '}
                <span className="text-ink-2">Token inválido ou expirado. Faça login novamente para continuar.</span>
              </div>
              <button
                onClick={handleSessionExpired}
                className="rounded border border-crimson/40 bg-bg px-3 py-1 text-xs font-semibold text-crimson hover:bg-crimson/10"
              >
                Entrar novamente
              </button>
              <button
                onClick={() => setSessionExpired(false)}
                className="text-ink-3 hover:text-ink-2 text-sm"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          )}
          {isAdmin && (
            <div className="flex items-center justify-between gap-3 border-b border-line bg-accent-soft px-6 py-2.5 text-[12px]">
              <div className="flex items-center gap-2">
                <Shield className="size-3.5 text-accent" strokeWidth={1.8} />
                <span className="font-sans font-semibold text-accent">Modo de visualização como cliente</span>
                <span className="font-sans text-ink-3 hidden md:inline">— você está navegando como se fosse um tenant</span>
              </div>
              <Link
                href="/admin"
                className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent font-semibold transition-colors hover:text-ink-2"
              >
                Voltar ao painel master →
              </Link>
            </div>
          )}
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {commandOpen && (
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onNavigate={handleNavigate}
          allItems={ALL_NAV_ITEMS}
        />
      )}
    </div>
  )
}
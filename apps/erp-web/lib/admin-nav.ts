import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  BarChart3,
  Server,
  Settings,
  Database,
  LogOut,
  ShieldCheck,
} from 'lucide-react'

export type AdminNavItem = {
  key: string
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  description?: string
}

export type AdminNavGroup = {
  title: string
  items: AdminNavItem[]
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: 'Painel Master',
    items: [
      { key: 'overview', label: 'Visão geral', href: '/admin', icon: LayoutDashboard, description: 'Status geral da plataforma' },
    ],
  },
  {
    title: 'Gestão de Clientes',
    items: [
      { key: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: Building2, description: 'Empresas cadastradas' },
      { key: 'users', label: 'Usuários', href: '/admin/users', icon: Users, description: 'Todos os usuários' },
      { key: 'plans', label: 'Planos', href: '/admin/plans', icon: CreditCard, description: 'Planos e assinaturas' },
    ],
  },
  {
    title: 'Operações',
    items: [
      { key: 'metrics', label: 'Métricas', href: '/admin/metrics', icon: BarChart3, description: 'Indicadores globais' },
      { key: 'system', label: 'Sistema', href: '/admin/system', icon: Server, description: 'Saúde dos serviços' },
      { key: 'master-data', label: 'Dados mestre', href: '/admin/master-data', icon: Database, description: 'Configurações globais' },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { key: 'settings', label: 'Ajustes', href: '/admin/settings', icon: Settings, description: 'Configurações da plataforma' },
    ],
  },
]

export const ALL_ADMIN_NAV_ITEMS: AdminNavItem[] = adminNavGroups.flatMap((g) => g.items)

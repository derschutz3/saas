import type { LucideIcon } from 'lucide-react'
import { Boxes, ClipboardList, CreditCard, FileText, Gauge, Package, Settings, ShoppingBag, Link2, BarChart3, Users, Truck, Sparkles, Tags, Wallet, Factory } from 'lucide-react'

export type NavItem = {
  key: string
  label: string
  href: string
  icon: LucideIcon
  keywords?: string[]
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Operações',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/app/dashboard', icon: Gauge, keywords: ['painel', 'kpis', 'visão geral'] },
      { key: 'orders', label: 'Pedidos', href: '/app/orders', icon: ClipboardList, keywords: ['vendas', 'pedidos', 'nova venda'] },
      { key: 'queue', label: 'Fila', href: '/app/queue', icon: Package, keywords: ['kanban', 'separação', 'expedição'] },
      { key: 'marketplace', label: 'Marketplace Hub', href: '/app/marketplace', icon: ShoppingBag, keywords: ['ifood', '99', 'rappi', 'marketplaces'] },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { key: 'inventory', label: 'Estoque', href: '/app/inventory', icon: Boxes, keywords: ['produtos', 'saldo', 'inventário'] },
      { key: 'categories', label: 'Categorias', href: '/app/inventory/categories', icon: Tags, keywords: ['categorias', 'agrupamento', 'tags'] },
      { key: 'customers', label: 'Clientes', href: '/app/customers', icon: Users, keywords: ['CRM', 'consumidor', 'comprador'] },
      { key: 'suppliers', label: 'Fornecedores', href: '/app/suppliers', icon: Factory, keywords: ['compras', 'supplier', 'cnpj', 'parceiros'] },
      { key: 'cash', label: 'Caixa', href: '/app/cash', icon: Wallet, keywords: ['caixa', 'sessão', 'sangria', 'suprimento', 'fechamento'] },
      { key: 'purchases', label: 'Compras', href: '/app/purchases', icon: Truck, keywords: ['pedido de compra', 'ordem de compra'] },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { key: 'receivables', label: 'Contas a Receber', href: '/app/finance', icon: Wallet, keywords: ['ar', 'títulos', 'recebimentos', 'a receber', 'financeiro'] },
      { key: 'cash', label: 'Caixa', href: '/app/cash', icon: CreditCard, keywords: ['financeiro', 'contas', 'pagamentos'] },
      { key: 'fiscal', label: 'Fiscal', href: '/app/fiscal', icon: FileText, keywords: ['nfe', 'nfce', 'sefaz'] },
    ],
  },
  {
    title: 'Inteligência',
    items: [
      { key: 'agent', label: 'Agente IA', href: '/app/agent', icon: Sparkles, keywords: ['ia', 'insights', 'estoque inteligente', 'alerta de recompra'] },
      { key: 'reports', label: 'Relatórios', href: '/app/reports', icon: BarChart3, keywords: ['analytics', 'bi', 'dashboards'] },
      { key: 'integrations', label: 'Integrações', href: '/app/integrations', icon: Link2, keywords: ['api', 'webhooks', 'conectar', 'oauth'] },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { key: 'settings', label: 'Configurações', href: '/app/settings', icon: Settings, keywords: ['empresa', 'filiais', 'usuarios', 'permissoes'] },
    ],
  },
]

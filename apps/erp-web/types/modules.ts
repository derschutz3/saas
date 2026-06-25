export type BusinessType = 
  | 'delivery'
  | 'restaurant'
  | 'retail'
  | 'pharmacy'
  | 'office_services'
  | 'construction'
  | 'beauty'
  | 'gym'
  | 'school'
  | 'generic'

export type ModuleId =
  | 'dashboard'
  | 'orders'
  | 'queue'
  | 'marketplace'
  | 'inventory'
  | 'purchases'
  | 'customers'
  | 'cash'
  | 'fiscal'
  | 'reports'
  | 'integrations'
  | 'settings'
  | 'employees'
  | 'projects'
  | 'appointments'
  | 'subscriptions'
  | 'production'
  | 'services'

export type ModuleCategory = 
  | 'operations'
  | 'management'
  | 'financial'
  | 'intelligence'
  | 'system'

export interface Module {
  id: ModuleId
  name: string
  description: string
  icon: string
  category: ModuleCategory
  keywords: string[]
  dependencies?: ModuleId[]
  businessTypes: BusinessType[]
  tier: 'core' | 'standard' | 'premium'
}

export interface TenantModules {
  tenantId: string
  businessType: BusinessType
  enabledModules: ModuleId[]
  disabledModules: ModuleId[]
  customModules?: ModuleId[]
  updatedAt: string
}

export interface BusinessTypeInfo {
  id: BusinessType
  name: string
  description: string
  icon: string
  color: string
  defaultModules: ModuleId[]
  recommendedModules: ModuleId[]
}

export const BUSINESS_TYPES: BusinessTypeInfo[] = [
  {
    id: 'delivery',
    name: 'Delivery & Restaurante',
    description: 'Restaurantes, lanchonetes, fast-food com delivery',
    icon: '🍔',
    color: '#EA001E',
    defaultModules: ['dashboard', 'orders', 'queue', 'marketplace', 'inventory', 'cash', 'fiscal', 'integrations'],
    recommendedModules: ['customers', 'reports', 'purchases'],
  },
  {
    id: 'restaurant',
    name: 'Restaurante & Bar',
    description: 'Restaurantes com mesas, bares, balcão',
    icon: '🍽️',
    color: '#F97316',
    defaultModules: ['dashboard', 'orders', 'inventory', 'cash', 'fiscal', 'customers'],
    recommendedModules: ['reports', 'purchases', 'integrations'],
  },
  {
    id: 'retail',
    name: 'Varejo & Atacado',
    description: 'Lojas, supermercados, materiais de construção',
    icon: '🏪',
    color: '#22C55E',
    defaultModules: ['dashboard', 'inventory', 'purchases', 'cash', 'fiscal', 'customers', 'reports'],
    recommendedModules: ['orders', 'integrations'],
  },
  {
    id: 'pharmacy',
    name: 'Farmácia & Drogaria',
    description: 'Farmácias com controle de receituário',
    icon: '💊',
    color: '#3B82F6',
    defaultModules: ['dashboard', 'inventory', 'orders', 'purchases', 'cash', 'fiscal', 'customers'],
    recommendedModules: ['reports', 'integrations'],
  },
  {
    id: 'office_services',
    name: 'Escritório & Serviços',
    description: 'Contabilidade, advocacia, consultoria, agências',
    icon: '🏢',
    color: '#6366F1',
    defaultModules: ['dashboard', 'customers', 'projects', 'employees', 'cash', 'reports', 'subscriptions'],
    recommendedModules: ['fiscal', 'integrations', 'appointments'],
  },
  {
    id: 'construction',
    name: 'Construção & Engenharia',
    description: 'Construtoras, empreiteiras, arquitetos',
    icon: '🏗️',
    color: '#F59E0B',
    defaultModules: ['dashboard', 'projects', 'customers', 'purchases', 'cash', 'employees', 'reports'],
    recommendedModules: ['inventory', 'fiscal', 'subscriptions'],
  },
  {
    id: 'beauty',
    name: 'Beleza & Estética',
    description: 'Salões, clínicas de estética, barbearias',
    icon: '💇',
    color: '#EC4899',
    defaultModules: ['dashboard', 'appointments', 'customers', 'inventory', 'cash', 'subscriptions'],
    recommendedModules: ['reports', 'integrations'],
  },
  {
    id: 'gym',
    name: 'Academia & Fitness',
    description: 'Academias, crossfit, estúdios de yoga',
    icon: '💪',
    color: '#14B8A6',
    defaultModules: ['dashboard', 'subscriptions', 'customers', 'cash', 'reports', 'employees'],
    recommendedModules: ['appointments', 'integrations'],
  },
  {
    id: 'school',
    name: 'Educação',
    description: 'Escolas, cursos, faculdades, idiomas',
    icon: '🎓',
    color: '#8B5CF6',
    defaultModules: ['dashboard', 'customers', 'subscriptions', 'cash', 'reports', 'employees'],
    recommendedModules: ['appointments', 'integrations'],
  },
  {
    id: 'generic',
    name: 'Geral / Multi-segmento',
    description: 'Sistema completo para qualquer tipo de negócio',
    icon: '⚙️',
    color: '#64748B',
    defaultModules: ['dashboard', 'orders', 'inventory', 'purchases', 'customers', 'cash', 'fiscal', 'reports', 'integrations'],
    recommendedModules: ['employees', 'projects', 'subscriptions'],
  },
]

export const ALL_MODULES: Module[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Visão geral com KPIs e indicadores',
    icon: '📊',
    category: 'operations',
    keywords: ['painel', 'kpis', 'visao geral'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'office_services', 'construction', 'beauty', 'gym', 'school', 'generic'],
    tier: 'core',
  },
  {
    id: 'orders',
    name: 'Pedidos & Vendas',
    description: 'Gestão completa de pedidos e vendas',
    icon: '📋',
    category: 'operations',
    keywords: ['vendas', 'pedidos', 'ordem de servico'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'generic'],
    tier: 'core',
  },
  {
    id: 'queue',
    name: 'Fila de Produção',
    description: 'Controle de fila e expedição',
    icon: '📦',
    category: 'operations',
    keywords: ['kanban', 'separacao', 'expedicao'],
    businessTypes: ['delivery', 'restaurant', 'generic'],
    tier: 'core',
  },
  {
    id: 'marketplace',
    name: 'Marketplace Hub',
    description: 'Integração com iFood, 99, Rappi',
    icon: '🛒',
    category: 'operations',
    keywords: ['ifood', '99', 'rappi', 'marketplaces'],
    businessTypes: ['delivery', 'restaurant', 'generic'],
    tier: 'standard',
  },
  {
    id: 'inventory',
    name: 'Estoque',
    description: 'Controle de inventário e movimentação',
    icon: '📦',
    category: 'management',
    keywords: ['produtos', 'saldo', 'inventario'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'beauty', 'generic'],
    tier: 'core',
  },
  {
    id: 'purchases',
    name: 'Compras',
    description: 'Gestão de fornecedores e compras',
    icon: '🚚',
    category: 'management',
    keywords: ['fornecedores', 'pedido de compra'],
    businessTypes: ['retail', 'pharmacy', 'construction', 'generic'],
    tier: 'standard',
  },
  {
    id: 'customers',
    name: 'Clientes & CRM',
    description: 'Cadastro e gestão de clientes',
    icon: '👥',
    category: 'management',
    keywords: ['cadastro', 'crm', 'segmentos'],
    businessTypes: ['office_services', 'construction', 'beauty', 'gym', 'school', 'retail', 'pharmacy', 'generic'],
    tier: 'core',
  },
  {
    id: 'employees',
    name: 'Funcionários',
    description: 'Gestão de equipe e folha de ponto',
    icon: '👔',
    category: 'management',
    keywords: ['equipe', 'folha', 'ponto', 'rh'],
    businessTypes: ['office_services', 'construction', 'beauty', 'gym', 'school', 'generic'],
    tier: 'standard',
  },
  {
    id: 'appointments',
    name: 'Agendamentos',
    description: 'Agenda de horários e reservas',
    icon: '📅',
    category: 'operations',
    keywords: ['agenda', 'reserva', 'horario'],
    businessTypes: ['beauty', 'gym', 'school', 'office_services', 'generic'],
    tier: 'core',
  },
  {
    id: 'projects',
    name: 'Projetos',
    description: 'Gestão de projetos e tarefas',
    icon: '📐',
    category: 'management',
    keywords: ['projeto', 'tarefa', 'obra'],
    businessTypes: ['office_services', 'construction', 'generic'],
    tier: 'standard',
  },
  {
    id: 'subscriptions',
    name: 'Assinaturas',
    description: 'Planos recorrentes e mensalidades',
    icon: '🔄',
    category: 'management',
    keywords: ['recorrente', 'mensalidade', 'plano'],
    businessTypes: ['gym', 'school', 'office_services', 'beauty', 'generic'],
    tier: 'standard',
  },
  {
    id: 'production',
    name: 'Produção',
    description: 'Controle de produção e ordens de serviço',
    icon: '🏭',
    category: 'operations',
    keywords: ['producao', 'fabrica', 'mao de obra'],
    businessTypes: ['generic'],
    tier: 'premium',
  },
  {
    id: 'services',
    name: 'Ordens de Serviço',
    description: 'Gestão de serviços e atendimento',
    icon: '🔧',
    category: 'operations',
    keywords: ['os', 'servico', 'atendimento'],
    businessTypes: ['office_services', 'construction', 'generic'],
    tier: 'standard',
  },
  {
    id: 'cash',
    name: 'Caixa & Bancos',
    description: 'Gestão financeira e fluxo de caixa',
    icon: '💰',
    category: 'financial',
    keywords: ['financeiro', 'contas', 'pagamentos'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'office_services', 'construction', 'beauty', 'gym', 'school', 'generic'],
    tier: 'core',
  },
  {
    id: 'fiscal',
    name: 'Fiscal',
    description: 'Emissão de NF-e, NFC-e, NFS-e',
    icon: '📄',
    category: 'financial',
    keywords: ['nfe', 'nfce', 'sefaz', 'nota fiscal'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'office_services', 'construction', 'generic'],
    tier: 'core',
  },
  {
    id: 'reports',
    name: 'Relatórios',
    description: 'Dashboards analíticos e relatórios',
    icon: '📈',
    category: 'intelligence',
    keywords: ['analytics', 'bi', 'dashboards'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'office_services', 'construction', 'beauty', 'gym', 'school', 'generic'],
    tier: 'core',
  },
  {
    id: 'integrations',
    name: 'Integrações',
    description: 'Conexão com marketplaces e pagamentos',
    icon: '🔗',
    category: 'intelligence',
    keywords: ['api', 'webhooks', 'conectar'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'generic'],
    tier: 'standard',
  },
  {
    id: 'settings',
    name: 'Configurações',
    description: 'Ajustes do sistema e da empresa',
    icon: '⚙️',
    category: 'system',
    keywords: ['empresa', 'filiais', 'configuracoes'],
    businessTypes: ['delivery', 'restaurant', 'retail', 'pharmacy', 'office_services', 'construction', 'beauty', 'gym', 'school', 'generic'],
    tier: 'core',
  },
]

export function getModulesByBusinessType(businessType: BusinessType): Module[] {
  const businessInfo = BUSINESS_TYPES.find(bt => bt.id === businessType)
  const defaultModuleIds = businessInfo?.defaultModules || []
  
  return ALL_MODULES.filter(m => 
    m.businessTypes.includes(businessType) || defaultModuleIds.includes(m.id)
  )
}

export function getRecommendedModules(businessType: BusinessType): Module[] {
  const businessInfo = BUSINESS_TYPES.find(bt => bt.id === businessType)
  const recommendedIds = businessInfo?.recommendedModules || []
  
  return ALL_MODULES.filter(m => recommendedIds.includes(m.id))
}

export function getBusinessTypeInfo(businessType: BusinessType): BusinessTypeInfo | undefined {
  return BUSINESS_TYPES.find(bt => bt.id === businessType)
}

// ============================================================================
// Permissões por usuário
// ============================================================================
//
// Lista canônica dos IDs de módulo que o backend aceita.
// Deve espelhar api/shared/schemas.ts (moduleIdSchema).

export const ALL_MODULE_IDS: ModuleId[] = [
  'dashboard',
  'orders',
  'queue',
  'marketplace',
  'inventory',
  'purchases',
  'customers',
  'cash',
  'fiscal',
  'reports',
  'integrations',
  'settings',
  'employees',
  'projects',
  'appointments',
  'subscriptions',
  'production',
  'services',
] as const

/** Rótulos legíveis para o usuário. */
export const MODULE_LABELS: Record<ModuleId, string> = {
  dashboard: 'Dashboard',
  orders: 'Pedidos / PDV',
  queue: 'Fila de pedidos',
  marketplace: 'Marketplaces (iFood / 99 / Rappi)',
  inventory: 'Estoque',
  purchases: 'Compras',
  customers: 'Clientes',
  cash: 'Caixa',
  fiscal: 'Fiscal',
  reports: 'Relatórios',
  integrations: 'Integrações',
  settings: 'Configurações',
  employees: 'Funcionários',
  projects: 'Projetos / Obras',
  appointments: 'Agendamentos',
  subscriptions: 'Assinaturas',
  production: 'Produção',
  services: 'Serviços',
}

/** Descrição curta para tooltips / ajuda. */
export const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  dashboard: 'Visão geral e KPIs do negócio',
  orders: 'Abertura de pedidos e vendas no PDV',
  queue: 'Acompanhamento de pedidos em preparo',
  marketplace: 'Integração com iFood, 99Food e Rappi',
  inventory: 'Produtos, categorias, estoque e movimentações',
  purchases: 'Ordens de compra e fornecedores',
  customers: 'Cadastro de clientes finais (CRM)',
  cash: 'Abertura, fechamento e sangria de caixa',
  fiscal: 'Emissão de NFCe / NFe',
  reports: 'Relatórios operacionais e financeiros',
  integrations: 'Credenciais de APIs externas',
  settings: 'Configurações da empresa e usuários',
  employees: 'Cadastro de funcionários e comissões',
  projects: 'Obras, projetos e controle de etapas',
  appointments: 'Agenda de horários por profissional',
  subscriptions: 'Planos recorrentes e cobranças',
  production: 'Ordem de produção / industrialização',
  services: 'Ordens de serviço e execução',
}

/** Agrupamentos para o seletor de módulos. */
export const MODULE_GROUPS: { title: string; modules: ModuleId[] }[] = [
  {
    title: 'Operação',
    modules: ['dashboard', 'orders', 'queue', 'cash'],
  },
  {
    title: 'Catálogo e compras',
    modules: ['inventory', 'purchases', 'customers', 'production', 'services'],
  },
  {
    title: 'Gestão',
    modules: ['employees', 'projects', 'appointments', 'subscriptions'],
  },
  {
    title: 'Integrações e relatórios',
    modules: ['marketplace', 'integrations', 'fiscal', 'reports'],
  },
  {
    title: 'Administração',
    modules: ['settings'],
  },
]

/** Lista default para novos usuários (caso owner não personalize). */
export const DEFAULT_USER_MODULES: ModuleId[] = [
  'dashboard',
  'inventory',
  'orders',
] as const as ModuleId[]

/**
 * Verifica se um módulo está habilitado para um usuário considerando override por usuário.
 *
 * - userModules = null/undefined → sem override (UI deve cair para tenant-level depois)
 * - userModules = [] → override explícito vazio (sem módulos)
 * - userModules = [...] → override restrito
 */
export function isModuleEnabledForUser(
  userModules: ModuleId[] | null | undefined,
  moduleId: ModuleId,
): boolean {
  if (userModules == null) return true
  return userModules.includes(moduleId)
}

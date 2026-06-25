import { Router } from 'express'
import { store } from '../infra/store.js'
import type { ModuleId, BusinessType, ModuleCategory } from '../../apps/erp-web/types/modules.js'
import { logger } from '../shared/logger.js'

const router = Router()

router.get('/business-types', (req, res) => {
  const businessTypes = [
    {
      id: 'delivery',
      name: 'Delivery & Restaurante',
      description: 'Restaurantes, lanchonetes, fast-food com delivery',
      icon: '🍔',
      color: '#EA001E',
      defaultModules: ['dashboard', 'orders', 'queue', 'marketplace', 'inventory', 'cash', 'fiscal', 'integrations'],
    },
    {
      id: 'restaurant',
      name: 'Restaurante & Bar',
      description: 'Restaurantes com mesas, bares, balcão',
      icon: '🍽️',
      color: '#F97316',
      defaultModules: ['dashboard', 'orders', 'inventory', 'cash', 'fiscal', 'customers'],
    },
    {
      id: 'retail',
      name: 'Varejo & Atacado',
      description: 'Lojas, supermercados, materiais de construção',
      icon: '🏪',
      color: '#22C55E',
      defaultModules: ['dashboard', 'inventory', 'purchases', 'cash', 'fiscal', 'customers', 'reports'],
    },
    {
      id: 'pharmacy',
      name: 'Farmácia & Drogaria',
      description: 'Farmácias com controle de receituário',
      icon: '💊',
      color: '#3B82F6',
      defaultModules: ['dashboard', 'inventory', 'orders', 'purchases', 'cash', 'fiscal', 'customers'],
    },
    {
      id: 'office_services',
      name: 'Escritório & Serviços',
      description: 'Contabilidade, advocacia, consultoria, agências',
      icon: '🏢',
      color: '#6366F1',
      defaultModules: ['dashboard', 'customers', 'projects', 'employees', 'cash', 'reports', 'subscriptions'],
    },
    {
      id: 'construction',
      name: 'Construção & Engenharia',
      description: 'Construtoras, empreiteiras, arquitetos',
      icon: '🏗️',
      color: '#F59E0B',
      defaultModules: ['dashboard', 'projects', 'customers', 'purchases', 'cash', 'employees', 'reports'],
    },
    {
      id: 'beauty',
      name: 'Beleza & Estética',
      description: 'Salões, clínicas de estética, barbearias',
      icon: '💇',
      color: '#EC4899',
      defaultModules: ['dashboard', 'appointments', 'customers', 'inventory', 'cash', 'subscriptions'],
    },
    {
      id: 'gym',
      name: 'Academia & Fitness',
      description: 'Academias, crossfit, estúdios de yoga',
      icon: '💪',
      color: '#14B8A6',
      defaultModules: ['dashboard', 'subscriptions', 'customers', 'cash', 'reports', 'employees'],
    },
    {
      id: 'school',
      name: 'Educação',
      description: 'Escolas, cursos, faculdades, idiomas',
      icon: '🎓',
      color: '#8B5CF6',
      defaultModules: ['dashboard', 'customers', 'subscriptions', 'cash', 'reports', 'employees'],
    },
    {
      id: 'generic',
      name: 'Geral / Multi-segmento',
      description: 'Sistema completo para qualquer tipo de negócio',
      icon: '⚙️',
      color: '#64748B',
      defaultModules: ['dashboard', 'orders', 'inventory', 'purchases', 'customers', 'cash', 'fiscal', 'reports', 'integrations'],
    },
  ]
  res.json({ businessTypes })
})

router.get('/all', (req, res) => {
  const modules = [
    { id: 'dashboard', name: 'Dashboard', description: 'Visão geral com KPIs', icon: '📊', category: 'operations', tier: 'core' },
    { id: 'orders', name: 'Pedidos & Vendas', description: 'Gestão de pedidos', icon: '📋', category: 'operations', tier: 'core' },
    { id: 'queue', name: 'Fila de Produção', description: 'Controle de fila', icon: '📦', category: 'operations', tier: 'core' },
    { id: 'marketplace', name: 'Marketplace Hub', description: 'iFood, 99, Rappi', icon: '🛒', category: 'operations', tier: 'standard' },
    { id: 'inventory', name: 'Estoque', description: 'Controle de inventário', icon: '📦', category: 'management', tier: 'core' },
    { id: 'purchases', name: 'Compras', description: 'Gestão de fornecedores', icon: '🚚', category: 'management', tier: 'standard' },
    { id: 'customers', name: 'Clientes & CRM', description: 'Cadastro e gestão', icon: '👥', category: 'management', tier: 'core' },
    { id: 'employees', name: 'Funcionários', description: 'Gestão de equipe', icon: '👔', category: 'management', tier: 'standard' },
    { id: 'appointments', name: 'Agendamentos', description: 'Agenda e reservas', icon: '📅', category: 'operations', tier: 'core' },
    { id: 'projects', name: 'Projetos', description: 'Gestão de projetos', icon: '📐', category: 'management', tier: 'standard' },
    { id: 'subscriptions', name: 'Assinaturas', description: 'Planos recorrentes', icon: '🔄', category: 'management', tier: 'standard' },
    { id: 'cash', name: 'Caixa & Bancos', description: 'Gestão financeira', icon: '💰', category: 'financial', tier: 'core' },
    { id: 'fiscal', name: 'Fiscal', description: 'NF-e, NFC-e', icon: '📄', category: 'financial', tier: 'core' },
    { id: 'reports', name: 'Relatórios', description: 'Dashboards analíticos', icon: '📈', category: 'intelligence', tier: 'core' },
    { id: 'integrations', name: 'Integrações', description: 'Conexões API', icon: '🔗', category: 'intelligence', tier: 'standard' },
    { id: 'settings', name: 'Configurações', description: 'Ajustes do sistema', icon: '⚙️', category: 'system', tier: 'core' },
  ]
  res.json({ modules })
})

router.get('/current', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  
  try {
    const tenant = await store.getTenant(tenantId)
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }
    
    res.json({
      tenantId: tenant.id,
      businessType: tenant.businessType,
      enabledModules: tenant.enabledModules,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to get modules' })
  }
})

router.post('/set-business-type', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const { businessType } = req.body as { businessType: BusinessType }
  
  if (!businessType) {
    res.status(400).json({ error: 'businessType is required' })
    return
  }

  const defaultModulesByType: Record<string, ModuleId[]> = {
    delivery: ['dashboard', 'orders', 'queue', 'marketplace', 'inventory', 'cash', 'fiscal', 'integrations', 'customers', 'reports', 'purchases', 'settings'],
    restaurant: ['dashboard', 'orders', 'inventory', 'cash', 'fiscal', 'customers', 'reports', 'settings'],
    retail: ['dashboard', 'inventory', 'purchases', 'cash', 'fiscal', 'customers', 'reports', 'settings'],
    pharmacy: ['dashboard', 'inventory', 'orders', 'purchases', 'cash', 'fiscal', 'customers', 'reports', 'settings'],
    office_services: ['dashboard', 'customers', 'projects', 'employees', 'cash', 'reports', 'subscriptions', 'settings'],
    construction: ['dashboard', 'projects', 'customers', 'purchases', 'cash', 'employees', 'reports', 'settings'],
    beauty: ['dashboard', 'appointments', 'customers', 'inventory', 'cash', 'subscriptions', 'settings'],
    gym: ['dashboard', 'subscriptions', 'customers', 'cash', 'reports', 'employees', 'settings'],
    school: ['dashboard', 'customers', 'subscriptions', 'cash', 'reports', 'employees', 'settings'],
    generic: ['dashboard', 'orders', 'inventory', 'purchases', 'customers', 'cash', 'fiscal', 'reports', 'integrations', 'settings'],
  }

  const defaultModules = defaultModulesByType[businessType] || defaultModulesByType.generic

  try {
    const tenant = await store.updateTenant(tenantId, {
      businessType,
      enabledModules: defaultModules,
    })

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    res.json({
      success: true,
      tenantId: tenant.id,
      businessType: tenant.businessType,
      enabledModules: tenant.enabledModules,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update business type' })
  }
})

router.post('/enable', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const { moduleId } = req.body as { moduleId: ModuleId }
  
  if (!moduleId) {
    res.status(400).json({ error: 'moduleId is required' })
    return
  }

  try {
    const tenant = await store.enableModule(tenantId, moduleId)
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    res.json({
      success: true,
      enabledModules: tenant.enabledModules,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to enable module' })
  }
})

router.post('/disable', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const { moduleId } = req.body as { moduleId: ModuleId }
  
  if (!moduleId) {
    res.status(400).json({ error: 'moduleId is required' })
    return
  }

  try {
    const tenant = await store.disableModule(tenantId, moduleId)
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    res.json({
      success: true,
      enabledModules: tenant.enabledModules,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable module' })
  }
})

router.post('/set-modules', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const { modules } = req.body as { modules: ModuleId[] }
  
  if (!modules || !Array.isArray(modules)) {
    res.status(400).json({ error: 'modules array is required' })
    return
  }

  try {
    const tenant = await store.setTenantModules(tenantId, modules)
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }

    res.json({
      success: true,
      enabledModules: tenant.enabledModules,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to set modules' })
  }
})

export function registerModulesRoutes(app: import('express').Application): void {
  app.use('/api/v1/modules', router)
  logger.debug('Modules routes registered', { path: '/api/v1/modules' })
}

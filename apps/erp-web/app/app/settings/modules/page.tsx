'use client'

import { useState, useEffect } from 'react'
import { Settings, Store, Package, Check, X, RefreshCw, Sparkles, Building2, ShoppingBag, Truck, GraduationCap, Wrench, Heart, Dumbbell } from 'lucide-react'
import { useModules } from '@/contexts/module-context'
import type { ModuleId, BusinessType, ModuleCategory } from '@/types/modules'

const BUSINESS_TYPES = [
  { id: 'delivery' as BusinessType, name: 'Delivery & Restaurante', icon: ShoppingBag, color: '#EA001E', description: 'Ideal para restaurantes, lanchonetes e delivery' },
  { id: 'restaurant' as BusinessType, name: 'Restaurante & Bar', icon: Store, color: '#F97316', description: 'Para estabelecimentos com atendimento presencial' },
  { id: 'retail' as BusinessType, name: 'Varejo & Atacado', icon: Package, color: '#22C55E', description: 'Lojas, supermercados, materiais de construção' },
  { id: 'office_services' as BusinessType, name: 'Escritório & Serviços', icon: Building2, color: '#6366F1', description: 'Contabilidade, advocacia, consultoria' },
  { id: 'construction' as BusinessType, name: 'Construção', icon: Wrench, color: '#F59E0B', description: 'Construtoras e empreiteiras' },
  { id: 'beauty' as BusinessType, name: 'Beleza & Estética', icon: Heart, color: '#EC4899', description: 'Salões e clínicas de estética' },
  { id: 'gym' as BusinessType, name: 'Academia & Fitness', icon: Dumbbell, color: '#14B8A6', description: 'Academias e estúdios' },
  { id: 'school' as BusinessType, name: 'Educação', icon: GraduationCap, color: '#8B5CF6', description: 'Escolas e cursos' },
  { id: 'generic' as BusinessType, name: 'Multi-segmento', icon: Sparkles, color: '#64748B', description: 'Sistema completo para qualquer negócio' },
]

const MODULES = [
  { id: 'dashboard' as ModuleId, name: 'Dashboard', description: 'Visão geral com KPIs', icon: '📊', category: 'operations' as ModuleCategory, tier: 'core' },
  { id: 'orders' as ModuleId, name: 'Pedidos & Vendas', description: 'Gestão completa de pedidos', icon: '📋', category: 'operations' as ModuleCategory, tier: 'core' },
  { id: 'queue' as ModuleId, name: 'Fila de Produção', description: 'Controle de fila e expedição', icon: '📦', category: 'operations' as ModuleCategory, tier: 'core' },
  { id: 'marketplace' as ModuleId, name: 'Marketplace Hub', description: 'iFood, 99, Rappi', icon: '🛒', category: 'operations' as ModuleCategory, tier: 'standard' },
  { id: 'inventory' as ModuleId, name: 'Estoque', description: 'Controle de inventário', icon: '📦', category: 'management' as ModuleCategory, tier: 'core' },
  { id: 'purchases' as ModuleId, name: 'Compras', description: 'Gestão de fornecedores', icon: '🚚', category: 'management' as ModuleCategory, tier: 'standard' },
  { id: 'customers' as ModuleId, name: 'Clientes & CRM', description: 'Cadastro e gestão de clientes', icon: '👥', category: 'management' as ModuleCategory, tier: 'core' },
  { id: 'employees' as ModuleId, name: 'Funcionários', description: 'Gestão de equipe', icon: '👔', category: 'management' as ModuleCategory, tier: 'standard' },
  { id: 'appointments' as ModuleId, name: 'Agendamentos', description: 'Agenda e reservas', icon: '📅', category: 'operations' as ModuleCategory, tier: 'core' },
  { id: 'projects' as ModuleId, name: 'Projetos', description: 'Gestão de projetos', icon: '📐', category: 'management' as ModuleCategory, tier: 'standard' },
  { id: 'subscriptions' as ModuleId, name: 'Assinaturas', description: 'Planos recorrentes', icon: '🔄', category: 'management' as ModuleCategory, tier: 'standard' },
  { id: 'cash' as ModuleId, name: 'Caixa & Bancos', description: 'Gestão financeira', icon: '💰', category: 'financial' as ModuleCategory, tier: 'core' },
  { id: 'fiscal' as ModuleId, name: 'Fiscal', description: 'NF-e, NFC-e', icon: '📄', category: 'financial' as ModuleCategory, tier: 'core' },
  { id: 'reports' as ModuleId, name: 'Relatórios', description: 'Dashboards analíticos', icon: '📈', category: 'intelligence' as ModuleCategory, tier: 'core' },
  { id: 'integrations' as ModuleId, name: 'Integrações', description: 'Conexões API', icon: '🔗', category: 'intelligence' as ModuleCategory, tier: 'standard' },
  { id: 'settings' as ModuleId, name: 'Configurações', description: 'Ajustes do sistema', icon: '⚙️', category: 'system' as ModuleCategory, tier: 'core' },
]

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  operations: 'Operações',
  management: 'Gestão',
  financial: 'Financeiro',
  intelligence: 'Inteligência',
  system: 'Sistema',
}

export default function ModulesSettingsPage() {
  const { businessType, enabledModules, setBusinessType, enableModule, disableModule, isLoading } = useModules()
  const [selectedType, setSelectedType] = useState<BusinessType | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (businessType) {
      setSelectedType(businessType)
    }
  }, [businessType])

  const handleBusinessTypeChange = async (type: BusinessType) => {
    setSaving(true)
    try {
      await setBusinessType(type)
      setSelectedType(type)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleModule = async (moduleId: ModuleId) => {
    if (enabledModules.includes(moduleId)) {
      await disableModule(moduleId)
    } else {
      await enableModule(moduleId)
    }
  }

  const modulesByCategory = MODULES.reduce((acc, mod) => {
    if (!acc[mod.category]) acc[mod.category] = []
    acc[mod.category].push(mod)
    return acc
  }, {} as Record<ModuleCategory, typeof MODULES>)

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="size-5 text-accent" />
          <h1 className="text-xl font-semibold text-white">Módulos do Sistema</h1>
        </div>
        <p className="text-sm text-white/50">
          Configure o tipo de negócio e ative os módulos ideais para sua empresa
        </p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Store className="size-5 text-accent" />
          Tipo de Negócio
        </h2>
        <p className="text-sm text-white/50 mb-4">
          Selecione o segmento da sua empresa. Isso definirá os módulos recomendados automaticamente.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {BUSINESS_TYPES.map((type) => {
            const Icon = type.icon
            const isSelected = selectedType === type.id
            return (
              <button
                key={type.id}
                onClick={() => handleBusinessTypeChange(type.id)}
                disabled={saving}
                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="size-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${type.color}20` }}
                  >
                    <Icon className="size-5" style={{ color: type.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{type.name}</span>
                      {isSelected && (
                        <span className="pill pill-green text-[10px]">
                          <Check className="size-2.5" />
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{type.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {saving && (
          <div className="flex items-center gap-2 mt-4 text-sm text-accent">
            <RefreshCw className="size-4 animate-spin" />
            Salvando...
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Package className="size-5 text-accent" />
          Módulos Ativos
        </h2>
        <p className="text-sm text-white/50 mb-6">
          Ative ou desative módulos conforme a necessidade do seu negócio. Módulos núcleo (core) são essenciais e já vêm habilitados.
        </p>

        <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-white/[0.02] border border-white/5">
          <span className="text-sm text-white/70">Filtar por categoria:</span>
          <div className="flex gap-2">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                className="pill pill-muted text-xs"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULES.map((mod) => {
            const isEnabled = enabledModules.includes(mod.id)
            const isCore = mod.tier === 'core'

            return (
              <div
                key={mod.id}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  isEnabled
                    ? 'border-accent/30 bg-accent/5'
                    : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{mod.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{mod.name}</span>
                        {isCore && (
                          <span className="pill pill-blue text-[10px]">Core</span>
                        )}
                        {mod.tier === 'standard' && (
                          <span className="pill pill-cyan text-[10px]">Std</span>
                        )}
                      </div>
                      <p className="text-xs text-white/40">{mod.description}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="pill pill-muted text-[10px]">
                    {CATEGORY_LABELS[mod.category]}
                  </span>
                  
                  {isCore ? (
                    <span className="pill pill-green text-[10px]">
                      <Check className="size-3" />
                      Obrigatório
                    </span>
                  ) : (
                    <button
                      onClick={() => handleToggleModule(mod.id)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isEnabled ? 'bg-accent' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-white/5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70">
              {enabledModules.length} de {MODULES.length} módulos ativos
            </span>
            <div className="flex gap-4">
              <span className="pill pill-blue text-[10px]">
                {MODULES.filter(m => m.tier === 'core').length} Core
              </span>
              <span className="pill pill-cyan text-[10px]">
                {MODULES.filter(m => m.tier === 'standard').length} Padrão
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

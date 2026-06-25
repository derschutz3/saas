'use client'

import { Check, Edit2, Users, TrendingUp, Star } from 'lucide-react'

type Plan = {
  id: string
  name: string
  tagline: string
  price: number
  subscribers: number
  mrr: number
  features: string[]
  limits: { users: number; orders: number; storage: string }
  highlight?: boolean
  tone: 'cyan' | 'blue' | 'purple'
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Para começar a vender online',
    price: 290,
    subscribers: 84,
    mrr: 24360,
    features: [
      '1 usuário administrador',
      'Pedidos ilimitados',
      'Marketplace hub (iFood)',
      'Painel de pedidos',
      'Suporte por e-mail',
    ],
    limits: { users: 1, orders: 500, storage: '2 GB' },
    tone: 'cyan',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para operações em crescimento',
    price: 1490,
    subscribers: 47,
    mrr: 70030,
    features: [
      'Até 5 usuários',
      'Pedidos ilimitados',
      'Todos os marketplaces',
      'Gestão de estoque avançada',
      'Relatórios e BI',
      'Integrações fiscais (NF-e)',
      'Suporte prioritário',
    ],
    limits: { users: 5, orders: 5000, storage: '20 GB' },
    highlight: true,
    tone: 'blue',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para grandes operações',
    price: 4990,
    subscribers: 11,
    mrr: 54890,
    features: [
      'Usuários ilimitados',
      'Pedidos ilimitados',
      'Todos os marketplaces',
      'Multi-CDN / multi-filial',
      'SLA dedicado (99.99%)',
      'API completa + webhooks',
      'Gerente de conta',
      'Onboarding personalizado',
    ],
    limits: { users: 999, orders: 999999, storage: 'Ilimitado' },
    tone: 'purple',
  },
]

const TONE_BG: Record<Plan['tone'], string> = {
  cyan: 'from-cyan-500/10 to-transparent border-cyan-500/30',
  blue: 'from-blue-500/15 to-transparent border-blue-500/40',
  purple: 'from-purple-500/15 to-transparent border-purple-500/40',
}
const TONE_TEXT: Record<Plan['tone'], string> = {
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
}
const TONE_PILL: Record<Plan['tone'], string> = {
  cyan: 'pill-cyan',
  blue: 'pill-blue',
  purple: 'pill-purple',
}

export default function PlansPage() {
  const totalMRR = PLANS.reduce((sum, p) => sum + p.mrr, 0)
  const totalSubs = PLANS.reduce((sum, p) => sum + p.subscribers, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Planos</h1>
          <p className="text-sm text-white/50 mt-1">Gerencie planos, preços e features oferecidas</p>
        </div>
        <button className="btn-primary h-9 gap-2 px-4 text-xs">+ Novo plano</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel-solid p-4">
          <div className="flex items-center gap-2">
            <Users className="size-3.5 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Total assinantes</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">{totalSubs}</div>
        </div>
        <div className="panel-solid p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-3.5 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">MRR total</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">
            R$ {(totalMRR / 1000).toFixed(1)}k
          </div>
        </div>
        <div className="panel-solid p-4">
          <div className="flex items-center gap-2">
            <Star className="size-3.5 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Mais popular</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100">Pro</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`relative overflow-hidden rounded-3xl border bg-gradient-to-b ${TONE_BG[p.tone]} p-6 flex flex-col`}
            style={{ backgroundColor: 'hsl(222 47% 9%)' }}
          >
            {p.highlight && (
              <div className="absolute top-3 right-3">
                <span className="pill pill-blue text-[10px]">Popular</span>
              </div>
            )}

            <div className="mb-4">
              <span className={`pill text-[10px] ${TONE_PILL[p.tone]}`}>{p.name}</span>
              <h2 className={`text-2xl font-bold mt-2 ${TONE_TEXT[p.tone]}`}>{p.name}</h2>
              <p className="text-xs text-slate-400 mt-1">{p.tagline}</p>
            </div>

            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-100 tabular-nums">
                  R$ {p.price.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-slate-500">/mês</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                {p.subscribers} assinantes · R$ {(p.mrr / 1000).toFixed(1)}k MRR
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950/50 p-3 mb-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Usuários</div>
                <div className="text-xs font-bold text-slate-200 mt-0.5">{p.limits.users === 999 ? '∞' : p.limits.users}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Pedidos</div>
                <div className="text-xs font-bold text-slate-200 mt-0.5">{p.limits.orders >= 999999 ? '∞' : p.limits.orders.toLocaleString('pt-BR')}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Storage</div>
                <div className="text-xs font-bold text-slate-200 mt-0.5">{p.limits.storage}</div>
              </div>
            </div>

            <ul className="flex-1 space-y-2.5 mb-5">
              {p.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <Check className={`size-3.5 shrink-0 mt-0.5 ${TONE_TEXT[p.tone]}`} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <button className="btn-ghost h-9 flex-1 gap-2 text-xs">
                <Edit2 className="size-3.5" />
                Editar plano
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

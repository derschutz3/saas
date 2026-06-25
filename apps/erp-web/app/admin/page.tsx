'use client'

import { memo, useMemo } from 'react'
import { Building2, Users, DollarSign, ArrowUpRight, Server, Cpu, Database, Zap } from 'lucide-react'
import Link from 'next/link'

type MetricCard = {
  label: string
  value: string
  sub: string
  delta: { label: string; dir: 'up' | 'down' }
  badge: { label: string; tone: 'green' | 'yellow' | 'red' | 'accent' }
  sparkData: number[]
}

const METRICS: MetricCard[] = [
  {
    label: 'Tenants ativos',
    value: '142',
    sub: '12 novos este mês',
    delta: { label: '+9,2%', dir: 'up' },
    badge: { label: 'Estável', tone: 'green' },
    sparkData: [12, 18, 14, 22, 19, 26, 31, 28, 34, 38, 42, 45],
  },
  {
    label: 'MRR global',
    value: 'R$ 184,6k',
    sub: 'Receita mensal recorrente',
    delta: { label: '+14,7%', dir: 'up' },
    badge: { label: 'Crescendo', tone: 'accent' },
    sparkData: [22, 28, 24, 30, 34, 32, 38, 44, 42, 48, 52, 58],
  },
  {
    label: 'Usuários totais',
    value: '3.847',
    sub: 'Em todos os tenants',
    delta: { label: '+5,4%', dir: 'up' },
    badge: { label: 'Saudável', tone: 'green' },
    sparkData: [10, 12, 15, 18, 22, 25, 28, 32, 35, 38, 42, 48],
  },
  {
    label: 'Eventos / min',
    value: '12,4k',
    sub: 'Pico: 18,2k (14h32)',
    delta: { label: '-2,1%', dir: 'down' },
    badge: { label: 'Atenção', tone: 'yellow' },
    sparkData: [40, 38, 42, 45, 41, 38, 36, 39, 42, 40, 37, 35],
  },
]

const RECENT_TENANTS = [
  { id: 't1', name: 'Distribuidora Norte', plan: 'Pro', users: 12, mrr: 'R$ 1.490', status: 'Ativo' },
  { id: 't2', name: 'Mercado Boa Vista', plan: 'Starter', users: 4, mrr: 'R$ 290', status: 'Ativo' },
  { id: 't3', name: 'Hortifruti Premium', plan: 'Pro', users: 8, mrr: 'R$ 1.490', status: 'Ativo' },
  { id: 't4', name: 'Atacado Sul', plan: 'Enterprise', users: 32, mrr: 'R$ 4.990', status: 'Trial' },
  { id: 't5', name: 'Restaurante Sabor', plan: 'Starter', users: 3, mrr: 'R$ 290', status: 'Ativo' },
]

const SYSTEM_EVENTS = [
  { id: 'e1', type: 'success', text: 'Backup automático concluído (4,2 GB)', time: '2 min' },
  { id: 'e2', type: 'warning', text: 'Latência alta em api-eu-west-1 (320ms)', time: '12 min' },
  { id: 'e3', type: 'info', text: 'Tenant "Mercado Centro" atualizado para Pro', time: '34 min' },
  { id: 'e4', type: 'success', text: 'Deploy v2.4.1 concluído em produção', time: '1h' },
  { id: 'e5', type: 'error', text: 'Falha no webhook do tenant t-9821 (3x)', time: '2h' },
]

const QUICK_ACTIONS = [
  { href: '/admin/tenants', label: 'Gerenciar tenants', icon: Building2, desc: '12 pendentes' },
  { href: '/admin/users', label: 'Convidar usuário', icon: Users, desc: 'Admin ou cliente' },
  { href: '/admin/plans', label: 'Editar planos', icon: DollarSign, desc: '3 planos ativos' },
  { href: '/admin/system', label: 'Status do sistema', icon: Server, desc: 'Tudo operacional' },
]

const TONE_PILL: Record<string, string> = {
  green: 'pill-accent',
  yellow: 'pill-gold',
  red: 'pill-crimson',
  accent: 'pill-accent',
}

const TONE_DOT: Record<string, string> = {
  success: 'status-dot-green',
  warning: 'status-dot-yellow',
  error: 'status-dot-red',
  info: 'status-dot-blue',
}

const TODAY = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const Sparkline = memo(function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 100
  const h = 24
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="text-accent">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.4" points={points} />
    </svg>
  )
})

const MetricCard = memo(function MetricCard({ m, idx }: { m: MetricCard; idx: number }) {
  return (
    <article className="card p-6 flex flex-col gap-4 hover:border-ink transition-colors">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-ink-3">
          {m.label}
        </span>
        <span className={`pill ${TONE_PILL[m.badge.tone]}`}>{m.badge.label}</span>
      </div>

      <div className="font-display text-[44px] leading-none tracking-tight text-ink">
        {m.value}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-sans text-[12px] text-ink-3">
          <span className={`status-dot size-1.5 rounded-full ${m.delta.dir === 'up' ? 'status-dot-green' : 'status-dot-red'}`} />
          <span className={`font-mono text-[11px] font-semibold ${m.delta.dir === 'up' ? 'text-accent' : 'text-crimson'}`}>
            {m.delta.label}
          </span>
          <span>{m.sub}</span>
        </div>
        <Sparkline data={m.sparkData} />
      </div>
    </article>
  )
})

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header editorial */}
      <header className="flex items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <span className="label">Edição · {TODAY}</span>
          <h1 className="mt-3 serif-h2 text-[40px] lg:text-[56px] text-ink">
            Visão geral da <span className="italic-accent">plataforma.</span>
          </h1>
          <p className="mt-2 font-sans text-[14px] text-ink-3 max-w-xl">
            Saúde geral do ERP Universal e dos tenants ativos — receita, operação, eventos críticos.
          </p>
        </div>
        <span className="hidden md:inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 border border-line px-3 py-2">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Todos os sistemas operacionais
        </span>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m, i) => (
          <MetricCard key={m.label} m={m} idx={i} />
        ))}
      </section>

      {/* Tenants + Eventos */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Tenants */}
        <article className="card overflow-hidden">
          <header className="flex items-baseline justify-between px-6 py-5 border-b border-line">
            <div>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3">Últimos tenants</span>
              <h2 className="mt-1 serif-h2 text-[26px] text-ink">
                Clientes <span className="italic-accent">recentes.</span>
              </h2>
            </div>
            <Link href="/admin/tenants" className="btn-link text-[11px]">
              Ver todos
            </Link>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 font-semibold">Tenant</th>
                  <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 font-semibold">Plano</th>
                  <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 font-semibold">Usuários</th>
                  <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 font-semibold">MRR</th>
                  <th className="px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_TENANTS.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-b-0 hover:bg-paper-2 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center bg-paper-2 border border-line text-[11px] font-display font-semibold text-ink">
                          {t.name.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                        </div>
                        <span className="font-sans text-[13px] font-semibold text-ink">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`pill ${t.plan === 'Enterprise' ? 'pill-accent' : t.plan === 'Pro' ? 'pill-gold' : 'pill-muted'}`}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[13px] text-ink-2 tabular-nums">{t.users}</td>
                    <td className="px-6 py-4 font-mono text-[13px] font-semibold text-ink tabular-nums">{t.mrr}</td>
                    <td className="px-6 py-4">
                      <span className={`pill ${t.status === 'Ativo' ? 'pill-accent' : 'pill-gold'}`}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Eventos */}
        <article className="card p-6">
          <header className="mb-5">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3">Últimas 24 horas</span>
            <h2 className="mt-1 serif-h2 text-[26px] text-ink">
              Eventos do <span className="italic-accent">sistema.</span>
            </h2>
          </header>

          <div className="flex flex-col">
            {SYSTEM_EVENTS.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 py-3 border-b border-line last:border-b-0">
                <span className={`status-dot mt-1.5 size-1.5 rounded-full ${TONE_DOT[ev.type] ?? 'status-dot-muted'}`} />
                <div className="flex-1">
                  <div className="font-sans text-[13px] text-ink leading-snug">{ev.text}</div>
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 mt-1">
                    {ev.time} atrás
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* Ações rápidas */}
      <section className="card p-6">
        <header className="mb-5 flex items-baseline justify-between">
          <div>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3">Operações frequentes</span>
            <h2 className="mt-1 serif-h2 text-[26px] text-ink">
              Ações <span className="italic-accent">rápidas.</span>
            </h2>
          </div>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((qa) => {
            const Icon = qa.icon
            return (
              <Link
                key={qa.href}
                href={qa.href}
                className="group flex items-center gap-4 border border-line bg-paper p-4 transition-all duration-200 hover:border-ink"
              >
                <div className="flex size-10 shrink-0 items-center justify-center bg-accent-soft text-accent transition-transform group-hover:scale-105">
                  <Icon className="size-4" strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-sans text-[13px] font-semibold text-ink">{qa.label}</div>
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-3 mt-0.5">{qa.desc}</div>
                </div>
                <ArrowUpRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" strokeWidth={1.6} />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
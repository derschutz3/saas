'use client'

import { useMemo, useState } from 'react'
import { Building2, Search, Filter, Plus, MoreVertical, ExternalLink, Pause, Play, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

type Tenant = {
  id: string
  name: string
  slug: string
  plan: 'Starter' | 'Pro' | 'Enterprise'
  businessType: 'delivery' | 'mercado' | 'restaurante' | 'varejo' | 'farmacia' | 'escritorio' | 'obra' | 'beleza' | 'academia' | 'escola' | 'generico'
  users: number
  orders: number
  mrr: number
  status: 'Ativo' | 'Trial' | 'Suspenso'
  createdAt: string
}

const TENANTS: Tenant[] = [
  { id: 't-1001', name: 'Distribuidora Norte', slug: 'distribuidora-norte', plan: 'Pro', businessType: 'varejo', users: 12, orders: 842, mrr: 1490, status: 'Ativo', createdAt: '2025-09-12' },
  { id: 't-1002', name: 'Mercado Boa Vista', slug: 'mercado-boa-vista', plan: 'Starter', businessType: 'mercado', users: 4, orders: 124, mrr: 290, status: 'Ativo', createdAt: '2026-01-04' },
  { id: 't-1003', name: 'Hortifruti Premium', slug: 'hortifruti-premium', plan: 'Pro', businessType: 'mercado', users: 8, orders: 512, mrr: 1490, status: 'Ativo', createdAt: '2025-11-22' },
  { id: 't-1004', name: 'Atacado Sul', slug: 'atacado-sul', plan: 'Enterprise', businessType: 'varejo', users: 32, orders: 3120, mrr: 4990, status: 'Ativo', createdAt: '2025-07-30' },
  { id: 't-1005', name: 'Restaurante Sabor & Arte', slug: 'sabor-arte', plan: 'Starter', businessType: 'restaurante', users: 3, orders: 89, mrr: 290, status: 'Ativo', createdAt: '2026-02-18' },
  { id: 't-1006', name: 'Farmácia Vida', slug: 'farmacia-vida', plan: 'Pro', businessType: 'farmacia', users: 6, orders: 280, mrr: 1490, status: 'Ativo', createdAt: '2025-12-05' },
  { id: 't-1007', name: 'Construtora Alfa', slug: 'construtora-alfa', plan: 'Enterprise', businessType: 'obra', users: 24, orders: 0, mrr: 4990, status: 'Ativo', createdAt: '2025-08-14' },
  { id: 't-1008', name: 'Salão Glamour', slug: 'salao-glamour', plan: 'Starter', businessType: 'beleza', users: 2, orders: 41, mrr: 290, status: 'Trial', createdAt: '2026-05-29' },
  { id: 't-1009', name: 'Academia Forte', slug: 'academia-forte', plan: 'Pro', businessType: 'academia', users: 9, orders: 612, mrr: 1490, status: 'Ativo', createdAt: '2025-10-19' },
  { id: 't-1010', name: 'Escola Aprender', slug: 'escola-aprender', plan: 'Pro', businessType: 'escola', users: 14, orders: 0, mrr: 1490, status: 'Ativo', createdAt: '2025-09-02' },
  { id: 't-1011', name: 'Padaria Pão Quente', slug: 'padaria-pao-quente', plan: 'Starter', businessType: 'restaurante', users: 4, orders: 198, mrr: 290, status: 'Ativo', createdAt: '2026-03-12' },
  { id: 't-1012', name: 'Pet Shop Amigo Fiel', slug: 'pet-amigo', plan: 'Starter', businessType: 'varejo', users: 3, orders: 76, mrr: 290, status: 'Suspenso', createdAt: '2025-11-08' },
]

const PLAN_TONES: Record<Tenant['plan'], string> = {
  Starter: 'pill-cyan',
  Pro: 'pill-blue',
  Enterprise: 'pill-purple',
}

const STATUS_TONES: Record<Tenant['status'], string> = {
  Ativo: 'pill-green',
  Trial: 'pill-yellow',
  Suspenso: 'pill-red',
}

const BTYPE_LABEL: Record<Tenant['businessType'], string> = {
  delivery: 'Delivery',
  mercado: 'Mercado',
  restaurante: 'Restaurante',
  varejo: 'Varejo',
  farmacia: 'Farmácia',
  escritorio: 'Escritório',
  obra: 'Obra',
  beleza: 'Beleza',
  academia: 'Academia',
  escola: 'Escola',
  generico: 'Genérico',
}

const PAGE_SIZE = 8

export default function TenantsPage() {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Tenant['status']>('all')
  const [planFilter, setPlanFilter] = useState<'all' | Tenant['plan']>('all')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TENANTS.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.slug.includes(q)) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (planFilter !== 'all' && t.plan !== planFilter) return false
      return true
    })
  }, [query, statusFilter, planFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Tenants</h1>
          <p className="text-sm text-white/50 mt-1">Gerencie todas as empresas cadastradas na plataforma</p>
        </div>
        <button className="btn-primary h-9 gap-2 px-4 text-xs">
          <Plus className="size-3.5" />
          Novo tenant
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Total" value={TENANTS.length.toString()} tone="blue" />
        <KpiTile label="Ativos" value={TENANTS.filter((t) => t.status === 'Ativo').length.toString()} tone="green" />
        <KpiTile label="Em trial" value={TENANTS.filter((t) => t.status === 'Trial').length.toString()} tone="yellow" />
        <KpiTile label="Suspensos" value={TENANTS.filter((t) => t.status === 'Suspenso').length.toString()} tone="red" />
      </div>

      <div className="panel-solid p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              placeholder="Buscar por nome ou slug…"
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(0) }}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'Ativo', label: 'Ativo' },
              { value: 'Trial', label: 'Trial' },
              { value: 'Suspenso', label: 'Suspenso' },
            ]}
          />

          <FilterSelect
            label="Plano"
            value={planFilter}
            onChange={(v) => { setPlanFilter(v as typeof planFilter); setPage(0) }}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'Starter', label: 'Starter' },
              { value: 'Pro', label: 'Pro' },
              { value: 'Enterprise', label: 'Enterprise' },
            ]}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/60">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Tenant</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Tipo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Plano</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Usuários</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Pedidos</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">MRR</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-slate-500">
                    Nenhum tenant encontrado
                  </td>
                </tr>
              ) : (
                pageItems.map((t, idx) => (
                  <tr key={t.id} className={idx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-slate-800/60 text-[10px] font-bold text-slate-300">
                          {t.name.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-200">{t.name}</div>
                          <div className="text-[10px] text-slate-600 font-mono">/{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">{BTYPE_LABEL[t.businessType]}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`pill text-[10px] ${PLAN_TONES[t.plan]}`}>{t.plan}</span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-300">{t.users}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-300">{t.orders.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-xs tabular-nums font-semibold text-slate-100">
                      R$ {t.mrr.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`pill text-[10px] ${STATUS_TONES[t.status]}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-icon size-7" title="Abrir como admin">
                          <ExternalLink className="size-3.5" />
                        </button>
                        {t.status === 'Suspenso' ? (
                          <button className="btn-icon size-7" title="Reativar">
                            <Play className="size-3.5" />
                          </button>
                        ) : (
                          <button className="btn-icon size-7" title="Suspender">
                            <Pause className="size-3.5" />
                          </button>
                        )}
                        <button className="btn-icon size-7" title="Mais opções">
                          <MoreVertical className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-icon size-8 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="font-mono text-[11px] tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-icon size-8 disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Filter className="size-3 text-slate-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-200 focus:border-blue-500/50 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}: {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone: 'green' | 'yellow' | 'red' | 'blue' }) {
  const color = {
    green: 'hsl(142 71% 45%)',
    yellow: 'hsl(38 92% 50%)',
    red: 'hsl(0 86% 65%)',
    blue: 'hsl(217 91% 67%)',
  }[tone]
  return (
    <div className="panel-solid p-3">
      <div className="flex items-center gap-2">
        <Building2 className="size-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">{value}</div>
    </div>
  )
}

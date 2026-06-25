'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, Mail, MoreVertical, Shield, User as UserIcon, Lock, Unlock } from 'lucide-react'

type AdminUser = {
  id: string
  name: string
  email: string
  role: 'admin' | 'client'
  tenant: string | null
  status: 'Ativo' | 'Convite pendente' | 'Bloqueado'
  lastAccess: string
}

const USERS: AdminUser[] = [
  { id: 'u-001', name: 'Roberto Silva', email: 'admin@demo.com', role: 'admin', tenant: null, status: 'Ativo', lastAccess: 'agora' },
  { id: 'u-002', name: 'Carla Mendes', email: 'cliente@demo.com', role: 'client', tenant: 'Distribuidora Norte', status: 'Ativo', lastAccess: '5 min' },
  { id: 'u-003', name: 'Pedro Almeida', email: 'pedro@distnorte.com', role: 'client', tenant: 'Distribuidora Norte', status: 'Ativo', lastAccess: '1h' },
  { id: 'u-004', name: 'Juliana Costa', email: 'ju@boavista.com', role: 'client', tenant: 'Mercado Boa Vista', status: 'Ativo', lastAccess: '2h' },
  { id: 'u-005', name: 'Marcos Lima', email: 'marcos@hortipremium.com', role: 'client', tenant: 'Hortifruti Premium', status: 'Ativo', lastAccess: 'ontem' },
  { id: 'u-006', name: 'Aline Souza', email: 'aline@atacadosul.com', role: 'client', tenant: 'Atacado Sul', status: 'Ativo', lastAccess: '3 dias' },
  { id: 'u-007', name: 'Ricardo Pereira', email: 'ricardo@saborarte.com', role: 'client', tenant: 'Restaurante Sabor & Arte', status: 'Convite pendente', lastAccess: '—' },
  { id: 'u-008', name: 'Fernanda Rocha', email: 'fer@farmaciavida.com', role: 'client', tenant: 'Farmácia Vida', status: 'Ativo', lastAccess: '12 min' },
  { id: 'u-009', name: 'Bruno Tavares', email: 'bruno@construtoraalfa.com', role: 'client', tenant: 'Construtora Alfa', status: 'Ativo', lastAccess: '4h' },
  { id: 'u-010', name: 'Patrícia Mello', email: 'patricia@glamour.com', role: 'client', tenant: 'Salão Glamour', status: 'Bloqueado', lastAccess: '15 dias' },
  { id: 'u-011', name: 'Diego Santos', email: 'diego@academiaforte.com', role: 'client', tenant: 'Academia Forte', status: 'Ativo', lastAccess: '1h' },
  { id: 'u-012', name: 'Sofia Aguiar', email: 'sofia@escolaaprender.com', role: 'client', tenant: 'Escola Aprender', status: 'Ativo', lastAccess: '2 dias' },
]

const STATUS_TONES: Record<AdminUser['status'], string> = {
  'Ativo': 'pill-green',
  'Convite pendente': 'pill-yellow',
  'Bloqueado': 'pill-red',
}

export default function UsersPage() {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AdminUser['role']>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return USERS.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      return true
    })
  }, [query, roleFilter])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Usuários</h1>
          <p className="text-sm text-white/50 mt-1">Todos os usuários da plataforma (admins e clientes)</p>
        </div>
        <button className="btn-primary h-9 gap-2 px-4 text-xs">
          <Plus className="size-3.5" />
          Convidar usuário
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel-solid p-3">
          <div className="flex items-center gap-2">
            <UserIcon className="size-3.5 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Total</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">{USERS.length}</div>
        </div>
        <div className="panel-solid p-3">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Admins</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">{USERS.filter((u) => u.role === 'admin').length}</div>
        </div>
        <div className="panel-solid p-3">
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Convites pendentes</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">{USERS.filter((u) => u.status === 'Convite pendente').length}</div>
        </div>
      </div>

      <div className="panel-solid p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="h-9 px-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-200 focus:border-blue-500/50 focus:outline-none"
          >
            <option value="all">Role: Todos</option>
            <option value="admin">Role: Admin</option>
            <option value="client">Role: Cliente</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/60">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Usuário</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Tenant</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Último acesso</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-slate-500">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                filtered.map((u, idx) => (
                  <tr key={u.id} className={idx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-slate-800/60 text-[10px] font-bold text-slate-300">
                          {u.name.split(' ').slice(0, 2).map((p) => p[0]).join('')}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-200">{u.name}</div>
                          <div className="text-[10px] text-slate-600 font-mono">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`pill text-[10px] ${u.role === 'admin' ? 'pill-purple' : 'pill-blue'}`}>
                        {u.role === 'admin' ? 'Admin' : 'Cliente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">{u.tenant ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`pill text-[10px] ${STATUS_TONES[u.status]}`}>{u.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{u.lastAccess}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-icon size-7" title={u.status === 'Bloqueado' ? 'Desbloquear' : 'Bloquear'}>
                          {u.status === 'Bloqueado' ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                        </button>
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
      </div>
    </div>
  )
}

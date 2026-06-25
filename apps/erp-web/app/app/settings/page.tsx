'use client'

/**
 * Página de Configurações.
 *
 * Três abas:
 *   - Empresa: businessType, dados cadastrais
 *   - Usuários: CRUD com role, filial e **módulos permitidos**
 *   - Filiais: CRUD
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Save, Plus, Trash2, Edit2, X, Check, AlertTriangle, Settings as SettingsIcon,
  Building, Users, Store, Search, UserCheck, UserX,
  Sparkles, Shield, ShieldCheck, Lock,
} from 'lucide-react'
import {
  settingsApi, USER_ROLE_LABELS, BUSINESS_TYPE_LABELS,
  type SettingsUser, type SettingsBranch,
  type UserRole, type BusinessType, type UserInput, type UserUpdateInput,
} from '@/lib/api/settings'
import { useFetch } from '@/lib/use-fetch'
import {
  ALL_MODULE_IDS, MODULE_LABELS, MODULE_DESCRIPTIONS, MODULE_GROUPS,
  DEFAULT_USER_MODULES,
  type ModuleId,
} from '@/types/modules'

const KEY_TENANT = 'settings:tenant:v1'
const KEY_USERS = 'settings:users:v1'
const KEY_BRANCHES = 'settings:branches:v1'

type ModulesMode = 'inherit' | 'custom'

type Tab = 'tenant' | 'users' | 'branches'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('tenant')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <SettingsIcon className="h-6 w-6 text-indigo-600" />
          Configurações
        </h1>
        <p className="text-sm text-slate-500">Gerencie dados do tenant, usuários e filiais</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <TabBtn active={tab === 'tenant'} onClick={() => setTab('tenant')} icon={Building}>Empresa</TabBtn>
        <TabBtn active={tab === 'users'} onClick={() => setTab('users')} icon={Users}>Usuários</TabBtn>
        <TabBtn active={tab === 'branches'} onClick={() => setTab('branches')} icon={Store}>Filiais</TabBtn>
      </div>

      {tab === 'tenant' && <TenantTab onToast={showToast} />}
      {tab === 'users' && <UsersTab onToast={showToast} />}
      {tab === 'branches' && <BranchesTab onToast={showToast} />}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${
            toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          {toast.kind === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof Building; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

// =================================================================
// Tenant Tab
// =================================================================

function TenantTab({ onToast }: { onToast: (kind: 'ok' | 'err', msg: string) => void }) {
  const fetch = useFetch(KEY_TENANT, () => settingsApi.getTenant(), { ttl: 30_000 })
  const { data, mutate, isLoading, error } = fetch

  const [legalName, setLegalName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('OTHER')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!data) return
    setLegalName(data.legalName ?? '')
    setTradeName(data.tradeName ?? '')
    setTaxId(data.taxId ?? '')
    setBusinessType((data.businessType as BusinessType) ?? 'OTHER')
  }, [data])

  const save = async () => {
    setBusy(true)
    try {
      await settingsApi.updateTenant({
        businessType,
        legalName: legalName.trim() || null,
        tradeName: tradeName.trim() || null,
        taxId: taxId.trim() || null,
      })
      await mutate()
      onToast('ok', 'Configurações salvas')
    } catch (err) {
      onToast('err', err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <div className="text-sm text-slate-500">Carregando...</div>
  if (error) return <div className="text-sm text-rose-600">Erro: {error.message}</div>
  if (!data) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Dados da Empresa</h2>
      <p className="mb-6 text-sm text-slate-500">O tipo de negócio ajusta módulos e layouts disponíveis no sistema.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Razão Social</label>
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Ex: Empresa LTDA"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="settings-legalName"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Nome Fantasia</label>
          <input
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
            placeholder="Ex: Padaria do Zé"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="settings-tradeName"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">CNPJ / CPF</label>
          <input
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="00.000.000/0000-00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="settings-taxId"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Tipo de Negócio *</label>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value as BusinessType)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="settings-businessType"
          >
            {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          data-testid="settings-save"
        >
          <Save className="h-4 w-4" />
          {busy ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}

// =================================================================
// Users Tab
// =================================================================

function UsersTab({ onToast }: { onToast: (kind: 'ok' | 'err', msg: string) => void }) {
  const fetch = useFetch(KEY_USERS, () => settingsApi.listUsers(), { ttl: 30_000 })
  const { data, mutate, isLoading, error } = fetch
  const branchesFetch = useFetch(KEY_BRANCHES, () => settingsApi.listBranches(), { ttl: 60_000 })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SettingsUser | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SettingsUser | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const users = data?.items ?? []
  const branches = branchesFetch.data?.items ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, query])

  useEffect(() => {
    if (!formOpen && !confirmDelete) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [formOpen, confirmDelete])

  const handleCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const handleEdit = (u: SettingsUser) => {
    setEditing(u)
    setFormOpen(true)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await settingsApi.deleteUser(confirmDelete.id)
      onToast('ok', 'Usuário excluído')
      setConfirmDelete(null)
      await mutate()
    } catch (err) {
      onToast('err', err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusy(false)
    }
  }

  const onSave = async (msg: string) => {
    onToast('ok', msg)
    setFormOpen(false)
    await mutate()
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar usuários..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm"
            data-testid="settings-users-search"
          />
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          data-testid="settings-users-new"
        >
          <Plus className="h-4 w-4" /> Novo usuário
        </button>
      </div>

      {error && <div className="border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div>}

      {isLoading && users.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Carregando usuários...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center">
          <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <h3 className="text-sm font-semibold text-slate-900">Nenhum usuário</h3>
          <p className="mt-1 text-sm text-slate-500">Adicione o primeiro usuário para começar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Filial</th>
                <th className="px-4 py-3">Módulos</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const branch = branches.find((b) => b.id === u.branchId)
                const isInherit = u.enabledModules == null
                const modulesCount = isInherit ? 'Herdado' : `${u.enabledModules?.length ?? 0}`
                return (
                  <tr key={u.id} className="hover:bg-slate-50" data-testid={`settings-user-row-${u.id}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                        {USER_ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{branch?.name ?? '—'}</td>
                    <td className="px-4 py-3" data-testid={`settings-user-modules-badge-${u.id}`}>
                      {isInherit ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <Sparkles className="h-3 w-3" /> Herdado
                        </span>
                      ) : (u.enabledModules?.length ?? 0) === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                          <Lock className="h-3 w-3" /> Bloqueado
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                          title={(u.enabledModules ?? []).map((m) => MODULE_LABELS[m as keyof typeof MODULE_LABELS] ?? m).join(', ')}
                        >
                          <ShieldCheck className="h-3 w-3" /> {modulesCount} personalizado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <UserCheck className="h-3 w-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <UserX className="h-3 w-3" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(u)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Editar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        className="ml-1 rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <UserFormModal
          editing={editing}
          branches={branches}
          busy={busy}
          onClose={() => setFormOpen(false)}
          onSave={onSave}
          onError={(m) => onToast('err', m)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Excluir usuário?</h3>
                <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="mb-6 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">{confirmDelete.name}</div>
              <div className="text-slate-500">{confirmDelete.email}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDelete} disabled={busy} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50" data-testid="settings-users-delete-confirm">
                {busy ? 'Excluindo...' : 'Excluir usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UserFormModal({
  editing, branches, busy, onClose, onSave, onError,
}: {
  editing: SettingsUser | null
  branches: SettingsBranch[]
  busy: boolean
  onClose: () => void
  onSave: (msg: string) => void | Promise<void>
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('CASHIER')
  const [branchId, setBranchId] = useState<string>('')
  const [active, setActive] = useState(true)
  // Módulos:
  //  - mode 'inherit'  → enabledModules = null (sem override, herda do tenant)
  //  - mode 'custom'   → enabledModules = Set<ModuleId>
  // Em modo custom, [] = sem módulos (override explícito vazio)
  const [modulesMode, setModulesMode] = useState<ModulesMode>('inherit')
  const [customModules, setCustomModules] = useState<ModuleId[]>([...DEFAULT_USER_MODULES])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (editing) {
      setName(editing.name)
      setEmail(editing.email)
      setRole(editing.role)
      setBranchId(editing.branchId ?? '')
      setActive(editing.active)
      setPassword('')
      // Detecta modo a partir do que veio do backend
      if (editing.enabledModules == null) {
        setModulesMode('inherit')
        setCustomModules([...DEFAULT_USER_MODULES])
      } else {
        setModulesMode('custom')
        setCustomModules(editing.enabledModules)
      }
    } else {
      setName('')
      setEmail('')
      setPassword('')
      setRole('CASHIER')
      setBranchId('')
      setActive(true)
      setModulesMode('inherit')
      setCustomModules([...DEFAULT_USER_MODULES])
    }
  }, [editing])

  const toggleModule = useCallback((m: ModuleId) => {
    setCustomModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }, [])

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      onError('Nome e email são obrigatórios')
      return
    }
    if (!editing && !password) {
      onError('Senha é obrigatória para novos usuários')
      return
    }
    if (password && password.length < 6) {
      onError('Senha deve ter ao menos 6 caracteres')
      return
    }
    setSubmitting(true)
    try {
      if (editing) {
        const body: UserUpdateInput = {
          name: name.trim(),
          email: email.trim(),
          role,
          branchId: branchId || null,
          active,
          // null explícito = volta a herdar do tenant (limpa override).
          // Lista = restringe (mesmo que vazia = bloqueia tudo).
          enabledModules: modulesMode === 'inherit' ? null : customModules,
        }
        if (password) body.password = password
        await settingsApi.updateUser(editing.id, body)
        await onSave('Usuário atualizado')
      } else {
        const body: UserInput = {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          branchId: branchId || null,
          active,
          // omitir quando inherit = backend trata como null
          ...(modulesMode === 'custom' ? { enabledModules: customModules } : {}),
        }
        await settingsApi.createUser(body)
        await onSave('Usuário criado')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" data-testid="settings-user-form-modal">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Editar usuário' : 'Novo usuário'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome completo *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              data-testid="settings-user-name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              data-testid="settings-user-email"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Senha {editing && <span className="text-slate-400">(em branco para manter)</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              data-testid="settings-user-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              data-testid="settings-user-role"
            >
              {Object.entries(USER_ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Filial</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              data-testid="settings-user-branch"
            >
              <option value="">Sem filial</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                data-testid="settings-user-active"
              />
              Usuário ativo
            </label>
          </div>
        </div>

        {/* ===== MÓDULOS PERMITIDOS ===== */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Módulos permitidos</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Define quais módulos este usuário pode acessar no menu lateral.
            {modulesMode === 'inherit'
              ? ' Atualmente herdando da configuração da empresa.'
              : ' Configuração personalizada por usuário (sobrescreve o padrão).'}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setModulesMode('inherit')}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                modulesMode === 'inherit'
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              data-testid="settings-user-modules-inherit"
            >
              <Sparkles className={`mt-0.5 h-4 w-4 ${modulesMode === 'inherit' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">Herdar da empresa</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Usa os módulos habilitados no tipo de negócio do tenant.
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setModulesMode('custom')}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                modulesMode === 'custom'
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              data-testid="settings-user-modules-custom"
            >
              <ShieldCheck className={`mt-0.5 h-4 w-4 ${modulesMode === 'custom' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">Personalizado</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Marque exatamente quais módulos este usuário pode acessar.
                </div>
              </div>
            </button>
          </div>

          {modulesMode === 'custom' && (
            <div className="mt-4 space-y-3" data-testid="settings-user-modules-grid">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  <strong className="font-medium text-slate-700">{customModules.length}</strong> de{' '}
                  <strong className="font-medium text-slate-700">{ALL_MODULE_IDS.length}</strong> módulos habilitados
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setCustomModules([...ALL_MODULE_IDS])}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomModules([])}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              {MODULE_GROUPS.map((group) => (
                <div key={group.title} className="rounded-md border border-slate-100 bg-white p-2">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {group.modules.map((m) => {
                      const checked = customModules.includes(m)
                      return (
                        <label
                          key={m}
                          className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-slate-50 ${
                            checked ? 'bg-indigo-50/50' : ''
                          }`}
                          data-testid={`settings-user-module-${m}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleModule(m)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 text-slate-900">
                              {checked ? (
                                <Check className="h-3 w-3 text-indigo-600" />
                              ) : (
                                <Lock className="h-3 w-3 text-slate-400" />
                              )}
                              <span className="font-medium">{MODULE_LABELS[m]}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">{MODULE_DESCRIPTIONS[m]}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting || busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={submit}
            disabled={submitting || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            data-testid="settings-user-submit"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Salvando...' : editing ? 'Atualizar' : 'Criar usuário'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =================================================================
// Branches Tab
// =================================================================

function BranchesTab({ onToast }: { onToast: (kind: 'ok' | 'err', msg: string) => void }) {
  const fetch = useFetch(KEY_BRANCHES, () => settingsApi.listBranches(), { ttl: 30_000 })
  const { data, mutate, isLoading, error } = fetch

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SettingsBranch | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SettingsBranch | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')

  const branches = data?.items ?? []

  useEffect(() => {
    if (!formOpen && !confirmDelete) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [formOpen, confirmDelete])

  useEffect(() => {
    if (editing) setName(editing.name)
    else setName('')
  }, [editing])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setFormOpen(true)
  }

  const openEdit = (b: SettingsBranch) => {
    setEditing(b)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      onToast('err', 'Nome da filial é obrigatório')
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await settingsApi.updateBranch(editing.id, { name: name.trim() })
        onToast('ok', 'Filial atualizada')
      } else {
        await settingsApi.createBranch({ name: name.trim() })
        onToast('ok', 'Filial criada')
      }
      setFormOpen(false)
      setName('')
      await mutate()
    } catch (err) {
      onToast('err', err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await settingsApi.deleteBranch(confirmDelete.id)
      onToast('ok', 'Filial excluída')
      setConfirmDelete(null)
      await mutate()
    } catch (err) {
      onToast('err', err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <p className="text-sm text-slate-600">Gerencie as filiais/lojas do seu negócio.</p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          data-testid="settings-branches-new"
        >
          <Plus className="h-4 w-4" /> Nova filial
        </button>
      </div>

      {error && <div className="border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div>}

      {isLoading && branches.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Carregando filiais...</div>
      ) : branches.length === 0 ? (
        <div className="p-12 text-center">
          <Store className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <h3 className="text-sm font-semibold text-slate-900">Nenhuma filial</h3>
          <p className="mt-1 text-sm text-slate-500">Crie a primeira filial para começar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50" data-testid={`settings-branch-row-${b.id}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{b.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(b)} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700" title="Editar">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(b)} className="ml-1 rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Editar filial' : 'Nova filial'}</h2>
              <button onClick={() => setFormOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Nome da filial *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Matriz, Filial Centro, Filial Zona Sul..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                data-testid="settings-branch-name"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setFormOpen(false)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                data-testid="settings-branch-submit"
              >
                <Save className="h-4 w-4" /> {busy ? 'Salvando...' : editing ? 'Atualizar' : 'Criar filial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Excluir filial?</h3>
                <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="mb-6 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">{confirmDelete.name}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDelete} disabled={busy} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50" data-testid="settings-branches-delete-confirm">
                {busy ? 'Excluindo...' : 'Excluir filial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * Página de gestão de Clientes (CRM).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Archive, ArchiveRestore, Trash2, Users, AlertTriangle, X, Check,
  Search, Mail, Phone, MapPin, FileText, User, Tag, ChevronDown, ChevronRight,
  Building2, Calendar, Archive as ArchiveIcon, MessageCircle, Star, Wallet,
} from 'lucide-react'
import {
  customersApi, formatDocument, formatPhone, formatMoneyCents,
  LIFECYCLE_LABELS, LIFECYCLE_TONE,
  type Customer, type CustomerInput, type CustomerLifecycle, type CustomerStats,
} from '@/lib/api/customers'
import { useFetch } from '@/lib/use-fetch'

const KEY = 'customers:list:v1'
const KEY_ARCHIVED = 'customers:list:archived:v1'

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

type FormFields = {
  name: string
  tradeName: string
  taxId: string
  email: string
  phone: string
  whatsapp: string
  address: string
  city: string
  state: string
  zip: string
  tags: string
  lifecycle: CustomerLifecycle
  notes: string
  creditLimit: string
  showAddress: boolean
}

const EMPTY_FIELDS: FormFields = {
  name: '',
  tradeName: '',
  taxId: '',
  email: '',
  phone: '',
  whatsapp: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  tags: '',
  lifecycle: 'active',
  notes: '',
  creditLimit: '',
  showAddress: false,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export default function CustomersPage() {
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState<CustomerLifecycle | 'all'>('all')

  const activeFetch = useFetch(KEY, () => customersApi.list({ includeArchived: false }), { ttl: 5000 })
  const archivedFetch = useFetch(KEY_ARCHIVED, () => customersApi.list({ includeArchived: true }), { ttl: 5000 })
  const { data, mutate, isLoading, error } = showArchived ? archivedFetch : activeFetch
  const statsFetch = useFetch('customers:stats:v1', () => customersApi.stats(), { ttl: 5000 })

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS)
  const [fieldsKey, setFieldsKey] = useState(0)

  const [delCustomer, setDelCustomer] = useState<Customer | null>(null)
  const [delOpen, setDelOpen] = useState(false)

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  useEffect(() => {
    const anyOpen = formOpen || delOpen
    if (anyOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
    return undefined
  }, [formOpen, delOpen])

  useEffect(() => {
    if (!formOpen && !delOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        if (formOpen) closeForm()
        if (delOpen) closeDelete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, delOpen, busy])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditingCustomer(null)
  }, [])

  const closeDelete = useCallback(() => {
    setDelOpen(false)
    setDelCustomer(null)
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([activeFetch.mutate(), archivedFetch.mutate(), statsFetch.mutate()])
  }, [activeFetch, archivedFetch, statsFetch])

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const openCreate = () => {
    setEditingCustomer(null)
    setFields({ ...EMPTY_FIELDS })
    setFieldsKey((k) => k + 1)
    setFormOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditingCustomer(c)
    setFields({
      name: c.name,
      tradeName: c.tradeName ?? '',
      taxId: c.taxId ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      whatsapp: c.whatsapp ?? '',
      address: c.address ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      zip: c.zip ?? '',
      tags: c.tags.join(', '),
      lifecycle: c.lifecycle,
      notes: c.notes ?? '',
      creditLimit: c.creditLimitCents != null ? (c.creditLimitCents / 100).toFixed(2) : '',
      showAddress: !!(c.address || c.city || c.state || c.zip),
    })
    setFieldsKey((k) => k + 1)
    setFormOpen(true)
  }

  const submitForm = async () => {
    const name = fields.name.trim()
    if (!name) {
      flash('err', 'Nome é obrigatório')
      return
    }
    if (fields.email && !EMAIL_RE.test(fields.email.trim())) {
      flash('err', 'E-mail inválido')
      return
    }
    if (fields.creditLimit.trim() && !Number.isFinite(Number(fields.creditLimit.replace(',', '.')))) {
      flash('err', 'Limite de crédito inválido')
      return
    }

    const tags = fields.tags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20)
    const creditLimitCents = fields.creditLimit.trim()
      ? Math.round(Number(fields.creditLimit.replace(',', '.')) * 100)
      : null

    const input: CustomerInput = {
      name,
      tradeName: fields.tradeName.trim() || null,
      taxId: fields.taxId.trim() || null,
      email: fields.email.trim() || null,
      phone: fields.phone.trim() || null,
      whatsapp: fields.whatsapp.trim() || null,
      address: fields.address.trim() || null,
      city: fields.city.trim() || null,
      state: fields.state.trim() ? fields.state.trim().toUpperCase() : null,
      zip: fields.zip.trim() || null,
      tags,
      lifecycle: fields.lifecycle,
      notes: fields.notes.trim() || null,
      creditLimitCents,
    }

    setBusy(true)
    try {
      if (editingCustomer) {
        await customersApi.update(editingCustomer.id, input)
        flash('ok', `Cliente "${name}" atualizado`)
      } else {
        await customersApi.create(input)
        flash('ok', `Cliente "${name}" criado`)
      }
      setFormOpen(false)
      setEditingCustomer(null)
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      flash('err', msg)
    } finally {
      setBusy(false)
    }
  }

  const archive = async (c: Customer) => {
    setBusy(true)
    try {
      await customersApi.archive(c.id)
      flash('ok', `Cliente "${c.name}" arquivado`)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao arquivar')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (c: Customer) => {
    setBusy(true)
    try {
      await customersApi.restore(c.id)
      flash('ok', `Cliente "${c.name}" restaurado`)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao restaurar')
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async () => {
    if (!delCustomer) return
    setBusy(true)
    try {
      await customersApi.delete(delCustomer.id)
      flash('ok', `Cliente "${delCustomer.name}" excluído`)
      setDelOpen(false)
      setDelCustomer(null)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusy(false)
    }
  }

  const all = data?.items ?? []
  const filtered = useMemo(() => {
    let rows = all
    if (lifecycleFilter !== 'all') rows = rows.filter((c) => c.lifecycle === lifecycleFilter)
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true
      if (c.tradeName && c.tradeName.toLowerCase().includes(q)) return true
      if (c.taxId && c.taxId.toLowerCase().includes(q)) return true
      if (c.email && c.email.toLowerCase().includes(q)) return true
      if (c.phone && c.phone.toLowerCase().includes(q)) return true
      if (c.city && c.city.toLowerCase().includes(q)) return true
      if (c.tags.some((t) => t.toLowerCase().includes(q))) return true
      return false
    })
  }, [all, query, lifecycleFilter])

  const stats: CustomerStats | null = statsFetch.data ?? null

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-400" />
            Clientes
          </h1>
          <p className="text-sm text-slate-500">
            {stats ? `${stats.active} ativos · ${stats.vip} VIP` : 'carregando…'}
            {stats && stats.archived > 0 && ` · ${stats.archived} arquivado(s)`}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2 shadow-lg shadow-sky-900/30"
          onClick={openCreate}
          disabled={busy}
        >
          <Plus className="h-5 w-5" />
          <span>Novo cliente</span>
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total" value={stats.total} color="text-slate-200" />
          <StatCard icon={Check} label="Ativos" value={stats.active} color="text-emerald-300" />
          <StatCard icon={User} label="Leads" value={stats.byLifecycle.lead} color="text-sky-300" />
          <StatCard icon={Star} label="VIP" value={stats.vip} color="text-amber-300" />
        </div>
      )}

      {error && (
        <div className="card p-4 text-sm text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Erro ao carregar clientes: {error.message}
        </div>
      )}

      {/* Filtros */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ/CPF, e-mail, telefone, tag ou cidade…"
            className="input-base h-10 w-full pl-10 pr-3 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input-base h-10 text-xs px-2"
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value as CustomerLifecycle | 'all')}
          disabled={busy}
          title="Filtrar por etapa do ciclo de vida"
        >
          <option value="all">Todos os ciclos</option>
          <option value="lead">Leads</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="churned">Perdidos</option>
        </select>
        <button
          type="button"
          className={`h-10 px-3 text-xs font-semibold rounded-md border flex items-center gap-1.5 transition-colors ${
            showArchived
              ? 'border-amber-600 bg-amber-950/40 text-amber-200'
              : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70'
          }`}
          onClick={() => setShowArchived((v) => !v)}
          disabled={busy}
          title={showArchived ? 'Ocultar arquivados' : 'Mostrar arquivados'}
        >
          {showArchived ? <ArchiveIcon className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          {showArchived ? 'Mostrando arquivados' : 'Mostrar arquivados'}
        </button>
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="px-5 py-3 border-b border-slate-800/40 flex items-center gap-3">
          <Users className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Lista de clientes</span>
          <span className="text-xs text-slate-500 ml-auto">
            {isLoading ? 'carregando…' : `${filtered.length} de ${all.length}`}
          </span>
        </div>
        <div className="divide-y divide-slate-800/40">
          {filtered.length === 0 && !isLoading && (
            <div className="p-8 text-center text-sm text-slate-500">
              {query
                ? `Nenhum cliente encontrado para "${query}".`
                : showArchived
                  ? 'Nenhum cliente (ativo ou arquivado) cadastrado.'
                  : 'Nenhum cliente ativo. Clique em Novo cliente para começar.'}
            </div>
          )}
          {filtered.map((c) => (
            <CustomerRow
              key={c.id}
              customer={c}
              busy={busy}
              onEdit={() => openEdit(c)}
              onArchive={() => archive(c)}
              onRestore={() => restore(c)}
              onDelete={() => {
                setDelCustomer(c)
                setDelOpen(true)
              }}
            />
          ))}
        </div>
      </div>

      {/* ====== MODAL: CRIAR / EDITAR ====== */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !busy && closeForm()}
        >
          <div
            className="card max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  {editingCustomer ? 'Editar cliente' : 'Novo cliente'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingCustomer
                    ? `Alterando "${editingCustomer.name}"`
                    : 'Cadastre um novo cliente com dados de contato e ciclo de vida'}
                </p>
              </div>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
                onClick={closeForm}
                disabled={busy}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* DADOS BÁSICOS */}
            <div className="space-y-3">
              <div>
                <label htmlFor="cust-name" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Nome / Razão social *
                </label>
                <input
                  key={`name-${fieldsKey}`}
                  id="cust-name"
                  type="text"
                  className="input-base h-11 w-full px-3 mt-1.5 text-sm font-medium"
                  placeholder="Ex: Bar do Zé Ltda"
                  value={fields.name}
                  onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                  disabled={busy}
                  maxLength={160}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cust-trade" className="text-xs text-slate-400">Nome fantasia</label>
                  <input
                    key={`trade-${fieldsKey}`}
                    id="cust-trade"
                    type="text"
                    className="input-base h-10 w-full px-3 mt-1 text-sm"
                    placeholder="Opcional"
                    value={fields.tradeName}
                    onChange={(e) => setFields((f) => ({ ...f, tradeName: e.target.value }))}
                    disabled={busy}
                    maxLength={160}
                  />
                </div>
                <div>
                  <label htmlFor="cust-taxid" className="text-xs text-slate-400">CNPJ / CPF</label>
                  <input
                    key={`taxid-${fieldsKey}`}
                    id="cust-taxid"
                    type="text"
                    className="input-base h-10 w-full px-3 mt-1 text-sm font-mono"
                    placeholder="00.000.000/0000-00"
                    value={fields.taxId}
                    onChange={(e) => setFields((f) => ({ ...f, taxId: e.target.value }))}
                    disabled={busy}
                    maxLength={20}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cust-email" className="text-xs text-slate-400">E-mail</label>
                  <input
                    key={`email-${fieldsKey}`}
                    id="cust-email"
                    type="email"
                    className="input-base h-10 w-full px-3 mt-1 text-sm"
                    placeholder="contato@empresa.com.br"
                    value={fields.email}
                    onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
                    disabled={busy}
                    maxLength={254}
                  />
                </div>
                <div>
                  <label htmlFor="cust-phone" className="text-xs text-slate-400">Telefone</label>
                  <input
                    key={`phone-${fieldsKey}`}
                    id="cust-phone"
                    type="text"
                    className="input-base h-10 w-full px-3 mt-1 text-sm font-mono"
                    placeholder="(11) 3333-4444"
                    value={fields.phone}
                    onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
                    disabled={busy}
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cust-wa" className="text-xs text-slate-400">WhatsApp</label>
                  <input
                    key={`wa-${fieldsKey}`}
                    id="cust-wa"
                    type="text"
                    className="input-base h-10 w-full px-3 mt-1 text-sm font-mono"
                    placeholder="(11) 99999-9999"
                    value={fields.whatsapp}
                    onChange={(e) => setFields((f) => ({ ...f, whatsapp: e.target.value }))}
                    disabled={busy}
                    maxLength={30}
                  />
                </div>
                <div>
                  <label htmlFor="cust-lifecycle" className="text-xs text-slate-400">Ciclo de vida</label>
                  <select
                    id="cust-lifecycle"
                    className="input-base h-10 w-full px-3 mt-1 text-sm"
                    value={fields.lifecycle}
                    onChange={(e) => setFields((f) => ({ ...f, lifecycle: e.target.value as CustomerLifecycle }))}
                    disabled={busy}
                  >
                    <option value="lead">Lead</option>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="churned">Perdido (churned)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cust-tags" className="text-xs text-slate-400">Tags (separadas por vírgula)</label>
                  <input
                    id="cust-tags"
                    type="text"
                    className="input-base h-10 w-full px-3 mt-1 text-sm"
                    placeholder="VIP, Fidelizado, Atacado"
                    value={fields.tags}
                    onChange={(e) => setFields((f) => ({ ...f, tags: e.target.value }))}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label htmlFor="cust-credit" className="text-xs text-slate-400">Limite de crédito (R$)</label>
                  <input
                    id="cust-credit"
                    type="text"
                    inputMode="decimal"
                    className="input-base h-10 w-full px-3 mt-1 text-sm font-mono"
                    placeholder="0,00"
                    value={fields.creditLimit}
                    onChange={(e) => setFields((f) => ({ ...f, creditLimit: e.target.value }))}
                    disabled={busy}
                  />
                </div>
              </div>
            </div>

            {/* ENDEREÇO (collapsible) */}
            <div className="border border-slate-800 rounded-lg">
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-slate-300 hover:bg-slate-800/40"
                onClick={() => setFields((f) => ({ ...f, showAddress: !f.showAddress }))}
                disabled={busy}
              >
                {fields.showAddress ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <MapPin className="h-3.5 w-3.5" /> Endereço
                <span className="text-[10px] text-slate-500 font-normal normal-case ml-auto">
                  {fields.city ? `${fields.city}${fields.state ? `/${fields.state}` : ''}` : 'opcional'}
                </span>
              </button>
              {fields.showAddress && (
                <div className="p-3 space-y-3 border-t border-slate-800">
                  <div>
                    <label htmlFor="cust-address" className="text-xs text-slate-400">Logradouro</label>
                    <input
                      id="cust-address"
                      type="text"
                      className="input-base h-10 w-full px-3 mt-1 text-sm"
                      placeholder="Rua / Av., número, complemento"
                      value={fields.address}
                      onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
                      disabled={busy}
                      maxLength={300}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label htmlFor="cust-city" className="text-xs text-slate-400">Cidade</label>
                      <input
                        id="cust-city"
                        type="text"
                        className="input-base h-10 w-full px-3 mt-1 text-sm"
                        placeholder="Cidade"
                        value={fields.city}
                        onChange={(e) => setFields((f) => ({ ...f, city: e.target.value }))}
                        disabled={busy}
                        maxLength={80}
                      />
                    </div>
                    <div>
                      <label htmlFor="cust-state" className="text-xs text-slate-400">UF</label>
                      <select
                        id="cust-state"
                        className="input-base h-10 w-full px-3 mt-1 text-sm"
                        value={fields.state}
                        onChange={(e) => setFields((f) => ({ ...f, state: e.target.value }))}
                        disabled={busy}
                      >
                        <option value="">—</option>
                        {BRAZILIAN_STATES.map((uf) => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cust-zip" className="text-xs text-slate-400">CEP</label>
                      <input
                        id="cust-zip"
                        type="text"
                        className="input-base h-10 w-full px-3 mt-1 text-sm font-mono"
                        placeholder="00000-000"
                        value={fields.zip}
                        onChange={(e) => setFields((f) => ({ ...f, zip: e.target.value }))}
                        disabled={busy}
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* OBSERVAÇÕES */}
            <div>
              <label htmlFor="cust-notes" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Observações</label>
              <textarea
                id="cust-notes"
                className="input-base min-h-[60px] w-full px-3 py-2 mt-1.5 text-sm resize-y"
                placeholder="Anotações sobre preferências, histórico, etc…"
                value={fields.notes}
                onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
                disabled={busy}
                maxLength={1000}
              />
            </div>

            {/* BOTÕES */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
              <button
                type="button"
                className="btn-ghost h-10 text-sm px-4"
                onClick={closeForm}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2"
                onClick={submitForm}
                disabled={busy || !fields.name.trim() || fields.name.trim().length < 2}
              >
                {busy ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Salvando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {editingCustomer ? 'Salvar alterações' : 'Criar cliente'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL: EXCLUIR ====== */}
      {delOpen && delCustomer && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !busy && closeDelete()}
        >
          <div
            className="card max-w-md w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-rose-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Excluir cliente</h2>
                <p className="text-sm text-slate-400">
                  <strong>{delCustomer.name}</strong> será removido permanentemente.
                </p>
              </div>
            </div>
            <div className="bg-amber-900/20 border border-amber-800/50 rounded-md p-3 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Esta ação não pode ser desfeita. Use <strong>Arquivar</strong> se quiser apenas desativar.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost h-10 text-sm px-4"
                onClick={closeDelete}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-10 text-sm px-5 font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-md disabled:opacity-50 flex items-center gap-2"
                onClick={submitDelete}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Excluindo…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Excluir permanentemente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md shadow-lg text-sm font-medium ${
            toast.kind === 'ok'
              ? 'bg-emerald-900/90 border border-emerald-700 text-emerald-100'
              : 'bg-rose-900/90 border border-rose-700 text-rose-100'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ============ COMPONENTES ============

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-slate-800/60 flex items-center justify-center shrink-0">
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  )
}

type CustomerRowProps = {
  customer: Customer
  busy: boolean
  onEdit: () => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}

function CustomerRow({ customer, busy, onEdit, onArchive, onRestore, onDelete }: CustomerRowProps) {
  return (
    <div className={`px-5 py-3 flex items-center gap-3 hover:bg-slate-900/40 ${!customer.active ? 'opacity-60' : ''}`}>
      <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600">
        {customer.name.charAt(0).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100 truncate flex items-center gap-2 flex-wrap">
          {customer.name}
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${LIFECYCLE_TONE[customer.lifecycle]}`}>
            {LIFECYCLE_LABELS[customer.lifecycle]}
          </span>
          {customer.tags.includes('VIP') && (
            <span className="text-[10px] uppercase tracking-wider text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
              <Star className="h-2.5 w-2.5" /> VIP
            </span>
          )}
          {!customer.active && (
            <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
              arquivado
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 truncate flex items-center gap-2">
          {customer.taxId && <span className="font-mono">{formatDocument(customer.taxId)}</span>}
          {customer.taxId && (customer.email || customer.phone) && <span>·</span>}
          {customer.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" /> {customer.email}
            </span>
          )}
          {customer.email && (customer.phone || customer.whatsapp) && <span>·</span>}
          {customer.phone && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Phone className="h-3 w-3" /> {formatPhone(customer.phone)}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
          {customer.whatsapp && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {formatPhone(customer.whatsapp)}
            </span>
          )}
          {customer.whatsapp && customer.city && <span>·</span>}
          {customer.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {[customer.city, customer.state].filter(Boolean).join('/')}
            </span>
          )}
          {(customer.city || customer.whatsapp) && customer.creditLimitCents != null && <span>·</span>}
          {customer.creditLimitCents != null && (
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3 w-3" /> {formatMoneyCents(customer.creditLimitCents)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          className="h-8 px-2.5 rounded-md text-xs font-semibold text-sky-300 bg-sky-950/40 hover:bg-sky-900/60 hover:text-sky-100 flex items-center gap-1.5"
          onClick={onEdit}
          disabled={busy}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>Editar</span>
        </button>
        {customer.active ? (
          <button
            type="button"
            className="h-8 px-2.5 rounded-md text-xs font-semibold text-amber-300 bg-amber-950/30 hover:bg-amber-900/50 hover:text-amber-100 flex items-center gap-1.5"
            onClick={onArchive}
            disabled={busy}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Arquivar</span>
          </button>
        ) : (
          <button
            type="button"
            className="h-8 px-2.5 rounded-md text-xs font-semibold text-emerald-300 bg-emerald-950/30 hover:bg-emerald-900/50 hover:text-emerald-100 flex items-center gap-1.5"
            onClick={onRestore}
            disabled={busy}
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            <span>Restaurar</span>
          </button>
        )}
        <button
          type="button"
          className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 hover:text-rose-100 flex items-center gap-1.5"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Excluir</span>
        </button>
      </div>
    </div>
  )
}

'use client'

/**
 * Página de gestão de Fornecedores.
 *
 * UX:
 * - Header com contadores (total / ativos / arquivados) e botão "Novo fornecedor"
 * - Busca por nome, CNPJ/CPF, e-mail, contato ou cidade
 * - Filtro: chip "Arquivados" para incluir inativos
 * - Lista/cards com dados principais (nome, documento, contato, localização, condições)
 * - Ações por linha: Editar / Arquivar (ou Restaurar) / Excluir
 * - Modal de criar/editar com seções colapsáveis:
 *     • Dados básicos (nome, documento, e-mail, telefone, contato)
 *     • Endereço (logradouro, cidade, UF, CEP)
 *     • Condições comerciais (pagamento, lead time, observações)
 * - Modal de exclusão com confirmação
 * - Soft delete (arquivar) com restauração
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Archive, ArchiveRestore, Trash2, Factory, AlertTriangle, X, Check,
  Search, Mail, Phone, MapPin, FileText, User, Clock, ChevronDown, ChevronRight,
  Building2, Calendar, Archive as ArchiveIcon,
} from 'lucide-react'
import {
  suppliersApi, formatDocument, formatPhone, formatDate, type Supplier, type SupplierInput,
} from '@/lib/api/suppliers'
import { useFetch } from '@/lib/use-fetch'

const KEY = 'suppliers:list:v1'
const KEY_ARCHIVED = 'suppliers:list:archived:v1'

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

type FormFields = {
  name: string
  document: string
  email: string
  phone: string
  contactName: string
  address: string
  city: string
  state: string
  zip: string
  paymentTerms: string
  leadTimeDays: string
  notes: string
  showAddress: boolean
  showTerms: boolean
}

const EMPTY_FIELDS: FormFields = {
  name: '',
  document: '',
  email: '',
  phone: '',
  contactName: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  paymentTerms: '',
  leadTimeDays: '',
  notes: '',
  showAddress: false,
  showTerms: true,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export default function SuppliersPage() {
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')

  const activeFetch = useFetch(KEY, () => suppliersApi.list({ includeArchived: false }), { ttl: 5000 })
  const archivedFetch = useFetch(
    KEY_ARCHIVED,
    () => suppliersApi.list({ includeArchived: true }),
    { ttl: 5000 },
  )
  const { data, mutate, isLoading, error } = showArchived ? archivedFetch : activeFetch

  // Modal de criar/editar — visibility separada de fields
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS)
  const [fieldsKey, setFieldsKey] = useState(0) // força reset quando abrir

  // Modal de exclusão
  const [delSupplier, setDelSupplier] = useState<Supplier | null>(null)
  const [delOpen, setDelOpen] = useState(false)

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // Bloquear scroll do body quando modal aberto
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

  // Fechar com ESC
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
    setEditingSupplier(null)
  }, [])

  const closeDelete = useCallback(() => {
    setDelOpen(false)
    setDelSupplier(null)
  }, [])

  const refresh = useCallback(async () => {
    // Refetch ambos (ativos e arquivados) para manter consistência ao alternar
    await Promise.all([activeFetch.mutate(), archivedFetch.mutate()])
  }, [activeFetch, archivedFetch])

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const openCreate = () => {
    setEditingSupplier(null)
    setFields({ ...EMPTY_FIELDS, showTerms: true })
    setFieldsKey((k) => k + 1)
    setFormOpen(true)
  }

  const openEdit = (s: Supplier) => {
    setEditingSupplier(s)
    setFields({
      name: s.name,
      document: s.document ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      contactName: s.contactName ?? '',
      address: s.address ?? '',
      city: s.city ?? '',
      state: s.state ?? '',
      zip: s.zip ?? '',
      paymentTerms: s.paymentTerms ?? '',
      leadTimeDays: s.leadTimeDays != null ? String(s.leadTimeDays) : '',
      notes: s.notes ?? '',
      showAddress: !!(s.address || s.city || s.state || s.zip),
      showTerms: !!(s.paymentTerms || s.leadTimeDays != null || s.notes),
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
    if (name.length < 2) {
      flash('err', 'Nome deve ter pelo menos 2 caracteres')
      return
    }
    if (fields.email && !EMAIL_RE.test(fields.email.trim())) {
      flash('err', 'E-mail inválido')
      return
    }
    if (fields.leadTimeDays.trim() && !Number.isFinite(Number(fields.leadTimeDays))) {
      flash('err', 'Lead time deve ser um número de dias')
      return
    }

    const input: SupplierInput = {
      name,
      document: fields.document.trim() || null,
      email: fields.email.trim() || null,
      phone: fields.phone.trim() || null,
      contactName: fields.contactName.trim() || null,
      address: fields.address.trim() || null,
      city: fields.city.trim() || null,
      state: fields.state.trim() ? fields.state.trim().toUpperCase() : null,
      zip: fields.zip.trim() || null,
      paymentTerms: fields.paymentTerms.trim() || null,
      leadTimeDays: fields.leadTimeDays.trim() ? Number(fields.leadTimeDays) : null,
      notes: fields.notes.trim() || null,
    }

    setBusy(true)
    try {
      if (editingSupplier) {
        await suppliersApi.update(editingSupplier.id, input)
        flash('ok', `Fornecedor "${name}" atualizado`)
      } else {
        await suppliersApi.create(input)
        flash('ok', `Fornecedor "${name}" criado`)
      }
      // Fecha modal PRIMEIRO (síncrono)
      setFormOpen(false)
      setEditingSupplier(null)
      // Depois atualiza lista
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      flash('err', msg)
    } finally {
      setBusy(false)
    }
  }

  const archive = async (s: Supplier) => {
    setBusy(true)
    try {
      await suppliersApi.archive(s.id)
      flash('ok', `Fornecedor "${s.name}" arquivado`)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao arquivar')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (s: Supplier) => {
    setBusy(true)
    try {
      await suppliersApi.restore(s.id)
      flash('ok', `Fornecedor "${s.name}" restaurado`)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao restaurar')
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async () => {
    if (!delSupplier) return
    setBusy(true)
    try {
      await suppliersApi.delete(delSupplier.id)
      flash('ok', `Fornecedor "${delSupplier.name}" excluído`)
      setDelOpen(false)
      setDelSupplier(null)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusy(false)
    }
  }

  const all = data?.items ?? []
  const active = useMemo(() => all.filter((s) => s.active), [all])
  const archived = useMemo(() => all.filter((s) => !s.active), [all])
  const list = showArchived ? all : active

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true
      if (s.document && s.document.toLowerCase().includes(q)) return true
      if (s.email && s.email.toLowerCase().includes(q)) return true
      if (s.contactName && s.contactName.toLowerCase().includes(q)) return true
      if (s.city && s.city.toLowerCase().includes(q)) return true
      return false
    })
  }, [list, query])

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Factory className="h-5 w-5 text-slate-400" />
            Fornecedores
          </h1>
          <p className="text-sm text-slate-500">
            {active.length} {active.length === 1 ? 'fornecedor ativo' : 'fornecedores ativos'}
            {archived.length > 0 && ` · ${archived.length} arquivado(s)`}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2 shadow-lg shadow-sky-900/30"
          onClick={openCreate}
          disabled={busy}
        >
          <Plus className="h-5 w-5" />
          <span>Novo fornecedor</span>
        </button>
      </div>

      {error && (
        <div className="card p-4 text-sm text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Erro ao carregar fornecedores: {error.message}
        </div>
      )}

      {/* Filtros */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ/CPF, e-mail, contato ou cidade…"
            className="input-base h-10 w-full pl-10 pr-3 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
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

      {/* Lista de fornecedores */}
      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="px-5 py-3 border-b border-slate-800/40 flex items-center gap-3">
          <Factory className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Lista de fornecedores</span>
          <span className="text-xs text-slate-500 ml-auto">
            {isLoading ? 'carregando…' : `${filtered.length} de ${list.length}`}
          </span>
        </div>

        <div className="divide-y divide-slate-800/40">
          {filtered.length === 0 && !isLoading && (
            <div className="p-8 text-center text-sm text-slate-500">
              {query
                ? `Nenhum fornecedor encontrado para "${query}".`
                : showArchived
                  ? 'Nenhum fornecedor (ativo ou arquivado) cadastrado.'
                  : 'Nenhum fornecedor ativo. Clique em Novo fornecedor para começar.'}
            </div>
          )}

          {filtered.map((s) => (
            <SupplierRow
              key={s.id}
              supplier={s}
              busy={busy}
              onEdit={() => openEdit(s)}
              onArchive={() => archive(s)}
              onRestore={() => restore(s)}
              onDelete={() => {
                setDelSupplier(s)
                setDelOpen(true)
              }}
            />
          ))}
        </div>
      </div>

      {/* ====== MODAL: CRIAR / EDITAR FORNECEDOR ====== */}
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
            aria-labelledby="sup-form-title"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 id="sup-form-title" className="text-lg font-bold text-slate-100">
                  {editingSupplier ? 'Editar fornecedor' : 'Novo fornecedor'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingSupplier
                    ? `Alterando "${editingSupplier.name}"`
                    : 'Cadastre um novo fornecedor com dados de contato e condições comerciais'}
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
                <label htmlFor="sup-name" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Nome / Razão social *
                </label>
                <input
                  key={`name-${fieldsKey}`}
                  id="sup-name"
                  type="text"
                  className="input-base h-11 w-full px-3 mt-1.5 text-sm font-medium"
                  placeholder="Ex: Distribuidora Atlas Ltda"
                  value={fields.name}
                  onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                  disabled={busy}
                  maxLength={160}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sup-document" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> CNPJ / CPF
                  </label>
                  <input
                    key={`doc-${fieldsKey}`}
                    id="sup-document"
                    type="text"
                    className="input-base h-11 w-full px-3 mt-1.5 text-sm font-mono"
                    placeholder="00.000.000/0000-00"
                    value={fields.document}
                    onChange={(e) => setFields((f) => ({ ...f, document: e.target.value }))}
                    disabled={busy}
                    maxLength={20}
                  />
                </div>
                <div>
                  <label htmlFor="sup-contact" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Contato
                  </label>
                  <input
                    key={`contact-${fieldsKey}`}
                    id="sup-contact"
                    type="text"
                    className="input-base h-11 w-full px-3 mt-1.5 text-sm"
                    placeholder="Nome do vendedor / representante"
                    value={fields.contactName}
                    onChange={(e) => setFields((f) => ({ ...f, contactName: e.target.value }))}
                    disabled={busy}
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sup-email" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> E-mail
                  </label>
                  <input
                    key={`email-${fieldsKey}`}
                    id="sup-email"
                    type="email"
                    className="input-base h-11 w-full px-3 mt-1.5 text-sm"
                    placeholder="vendas@fornecedor.com.br"
                    value={fields.email}
                    onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
                    disabled={busy}
                    maxLength={254}
                  />
                </div>
                <div>
                  <label htmlFor="sup-phone" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Telefone
                  </label>
                  <input
                    key={`phone-${fieldsKey}`}
                    id="sup-phone"
                    type="text"
                    className="input-base h-11 w-full px-3 mt-1.5 text-sm font-mono"
                    placeholder="(11) 3333-4444"
                    value={fields.phone}
                    onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
                    disabled={busy}
                    maxLength={30}
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
                    <label htmlFor="sup-address" className="text-xs text-slate-400">Logradouro</label>
                    <input
                      id="sup-address"
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
                    <div className="col-span-2 md:col-span-2">
                      <label htmlFor="sup-city" className="text-xs text-slate-400">Cidade</label>
                      <input
                        id="sup-city"
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
                      <label htmlFor="sup-state" className="text-xs text-slate-400">UF</label>
                      <select
                        id="sup-state"
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
                      <label htmlFor="sup-zip" className="text-xs text-slate-400">CEP</label>
                      <input
                        id="sup-zip"
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

            {/* CONDIÇÕES COMERCIAIS (collapsible) */}
            <div className="border border-slate-800 rounded-lg">
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-slate-300 hover:bg-slate-800/40"
                onClick={() => setFields((f) => ({ ...f, showTerms: !f.showTerms }))}
                disabled={busy}
              >
                {fields.showTerms ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Clock className="h-3.5 w-3.5" /> Condições comerciais
                <span className="text-[10px] text-slate-500 font-normal normal-case ml-auto">
                  {fields.paymentTerms ? fields.paymentTerms : 'opcional'}
                </span>
              </button>
              {fields.showTerms && (
                <div className="p-3 space-y-3 border-t border-slate-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="sup-payment" className="text-xs text-slate-400">Condição de pagamento</label>
                      <input
                        id="sup-payment"
                        type="text"
                        className="input-base h-10 w-full px-3 mt-1 text-sm"
                        placeholder="Ex: 30/60/90 DDL, à vista"
                        value={fields.paymentTerms}
                        onChange={(e) => setFields((f) => ({ ...f, paymentTerms: e.target.value }))}
                        disabled={busy}
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <label htmlFor="sup-lead" className="text-xs text-slate-400">Prazo de entrega (dias)</label>
                      <input
                        id="sup-lead"
                        type="number"
                        min="0"
                        max="365"
                        className="input-base h-10 w-full px-3 mt-1 text-sm"
                        placeholder="0 a 365"
                        value={fields.leadTimeDays}
                        onChange={(e) => setFields((f) => ({ ...f, leadTimeDays: e.target.value }))}
                        disabled={busy}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sup-notes" className="text-xs text-slate-400">Observações</label>
                    <textarea
                      id="sup-notes"
                      className="input-base min-h-[60px] w-full px-3 py-2 mt-1 text-sm resize-y"
                      placeholder="Anotações internas sobre o fornecedor…"
                      value={fields.notes}
                      onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
                      disabled={busy}
                      maxLength={500}
                    />
                  </div>
                </div>
              )}
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
                    {editingSupplier ? 'Salvar alterações' : 'Criar fornecedor'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL: EXCLUIR ====== */}
      {delOpen && delSupplier && (
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
                <h2 className="text-lg font-bold text-slate-100">Excluir fornecedor</h2>
                <p className="text-sm text-slate-400">
                  <strong>{delSupplier.name}</strong> será removido permanentemente.
                </p>
              </div>
            </div>

            <div className="bg-amber-900/20 border border-amber-800/50 rounded-md p-3 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Esta ação não pode ser desfeita. Use <strong>Arquivar</strong> se quiser apenas desativar temporariamente.
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

// ============ COMPONENTES AUXILIARES ============

type SupplierRowProps = {
  supplier: Supplier
  busy: boolean
  onEdit: () => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}

function SupplierRow({ supplier, busy, onEdit, onArchive, onRestore, onDelete }: SupplierRowProps) {
  return (
    <div className={`px-5 py-3 flex items-center gap-3 hover:bg-slate-900/40 ${!supplier.active ? 'opacity-60' : ''}`}>
      <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 bg-gradient-to-br from-sky-500 to-indigo-600">
        {supplier.name.charAt(0).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100 truncate flex items-center gap-2">
          {supplier.name}
          {!supplier.active && (
            <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
              arquivado
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 truncate flex items-center gap-2">
          {supplier.document && <span className="font-mono">{formatDocument(supplier.document)}</span>}
          {supplier.document && (supplier.contactName || supplier.email || supplier.phone) && <span>·</span>}
          {supplier.contactName && <span>{supplier.contactName}</span>}
          {supplier.contactName && (supplier.email || supplier.phone) && <span>·</span>}
          {supplier.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" /> {supplier.email}
            </span>
          )}
          {supplier.email && supplier.phone && <span>·</span>}
          {supplier.phone && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Phone className="h-3 w-3" /> {formatPhone(supplier.phone)}
            </span>
          )}
        </div>
        {(supplier.city || supplier.paymentTerms || supplier.leadTimeDays != null) && (
          <div className="text-[10px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
            {(supplier.city || supplier.state) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[supplier.city, supplier.state].filter(Boolean).join('/')}
              </span>
            )}
            {(supplier.city || supplier.state) && (supplier.paymentTerms || supplier.leadTimeDays != null) && <span>·</span>}
            {supplier.paymentTerms && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {supplier.paymentTerms}
              </span>
            )}
            {supplier.paymentTerms && supplier.leadTimeDays != null && <span>·</span>}
            {supplier.leadTimeDays != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {supplier.leadTimeDays}d
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          className="h-8 px-2.5 rounded-md text-xs font-semibold text-sky-300 bg-sky-950/40 hover:bg-sky-900/60 hover:text-sky-100 flex items-center gap-1.5"
          onClick={onEdit}
          disabled={busy}
          title="Editar dados de contato, endereço e condições"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>Editar</span>
        </button>
        {supplier.active ? (
          <button
            type="button"
            className="h-8 px-2.5 rounded-md text-xs font-semibold text-amber-300 bg-amber-950/30 hover:bg-amber-900/50 hover:text-amber-100 flex items-center gap-1.5"
            onClick={onArchive}
            disabled={busy}
            title="Arquivar (soft delete — pode ser restaurado depois)"
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
            title="Restaurar fornecedor arquivado"
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
          title="Excluir permanentemente"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Excluir</span>
        </button>
      </div>
    </div>
  )
}

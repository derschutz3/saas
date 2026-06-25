'use client'

/**
 * Página de Documentos Fiscais (NF-e / NFC-e).
 *
 * Mostra:
 *   - KPIs: total, pendentes, autorizadas, rejeitadas, valor total autorizado
 *   - Filtro por status e tipo (NFe/NFCe)
 *   - Tabela com ações (emitir, reprocessar, cancelar, ver detalhes)
 *   - Modal para emitir NF a partir de um pedido
 *   - Modal de detalhes com chave de acesso e protocolo
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, X, Search, FileText, Trash2, Check, AlertTriangle,
  Send, RefreshCw, XCircle, Download, Eye, Clock, CheckCircle, Copy,
} from 'lucide-react'
import {
  fiscalApi, formatMoneyCents, formatDateTime, formatAccessKey,
  FISCAL_STATUS_LABELS, FISCAL_STATUS_TONE, FISCAL_DOC_TYPE_LABELS,
  type FiscalDocument, type FiscalStatus, type FiscalDocType, type FiscalStats,
} from '@/lib/api/fiscal'
import { useFetch } from '@/lib/use-fetch'

const KEY = 'fiscal:list:v1'
const KEY_STATS = 'fiscal:stats:v1'

export default function FiscalPage() {
  const [statusFilter, setStatusFilter] = useState<FiscalStatus | 'all'>('all')
  const [docTypeFilter, setDocTypeFilter] = useState<FiscalDocType | 'all'>('all')
  const [query, setQuery] = useState('')

  const fetch = useFetch(KEY, () => fiscalApi.list(), { ttl: 5000 })
  const statsFetch = useFetch(KEY_STATS, () => fiscalApi.stats(), { ttl: 5000 })
  const { data, mutate, isLoading, error } = fetch

  const [formOpen, setFormOpen] = useState(false)
  const [docToCancel, setDocToCancel] = useState<FiscalDocument | null>(null)
  const [docToDetails, setDocToDetails] = useState<FiscalDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const documents = data?.items ?? []
  const stats: FiscalStats | undefined = statsFetch.data

  useEffect(() => {
    if (!formOpen && !docToCancel && !docToDetails) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [formOpen, docToCancel, docToDetails])

  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const filtered = useMemo(() => {
    let items = documents
    if (statusFilter !== 'all') items = items.filter((d) => d.status === statusFilter)
    if (docTypeFilter !== 'all') items = items.filter((d) => d.docType === docTypeFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      items = items.filter((d) =>
        d.id.toLowerCase().includes(q) ||
        d.orderId.toLowerCase().includes(q) ||
        (d.numero ?? '').includes(q) ||
        (d.accessKey ?? '').includes(q),
      )
    }
    return items
  }, [documents, statusFilter, docTypeFilter, query])

  const emit = async (doc: FiscalDocument, reject = false) => {
    setBusy(true)
    try {
      const updated = await fiscalApi.emit(doc.id, reject)
      showToast('ok', reject ? 'Rejeição simulada aplicada' : `NF-e ${updated.numero} autorizada`)
      await Promise.all([mutate(), statsFetch.mutate()])
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao processar NF')
    } finally {
      setBusy(false)
    }
  }

  const retry = async (doc: FiscalDocument) => {
    setBusy(true)
    try {
      const updated = await fiscalApi.retry(doc.id, { approved: true })
      showToast('ok', `NF-e ${updated.numero ?? ''} reapresentada`)
      await Promise.all([mutate(), statsFetch.mutate()])
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao reprocessar')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (reason: string) => {
    if (!docToCancel) return
    setBusy(true)
    try {
      await fiscalApi.cancel(docToCancel.id, reason)
      showToast('ok', 'NF-e cancelada')
      setDocToCancel(null)
      await Promise.all([mutate(), statsFetch.mutate()])
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao cancelar')
    } finally {
      setBusy(false)
    }
  }

  const copyAccessKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      showToast('ok', 'Chave de acesso copiada')
    } catch {
      showToast('err', 'Não foi possível copiar')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <FileText className="h-6 w-6 text-indigo-600" />
            Documentos Fiscais
          </h1>
          <p className="text-sm text-slate-500">Emissão, consulta e gestão de NF-e / NFC-e</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          data-testid="fiscal-new"
        >
          <Plus className="h-4 w-4" />
          Emitir NF
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <KpiCard label="Total" value={String(stats?.total ?? documents.length)} icon={FileText} tone="slate" />
        <KpiCard label="Pendentes" value={String(stats?.pendingCount ?? documents.filter((d) => d.status === 'PENDING').length)} icon={Clock} tone="amber" />
        <KpiCard label="Autorizadas" value={String(stats?.byStatus?.AUTHORIZED ?? documents.filter((d) => d.status === 'AUTHORIZED').length)} icon={CheckCircle} tone="emerald" />
        <KpiCard label="Rejeitadas" value={String(stats?.rejectedCount ?? documents.filter((d) => d.status === 'REJECTED').length)} icon={AlertTriangle} tone="rose" />
        <KpiCard label="Valor autorizado" value={formatMoneyCents(stats?.totalAuthorizedCents ?? null)} icon={FileText} tone="indigo" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por ID, número, pedido ou chave..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              data-testid="fiscal-search"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as FiscalDocType | 'all')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              data-testid="fiscal-filter-type"
            >
              <option value="all">Todos os tipos</option>
              <option value="NFE">NF-e (55)</option>
              <option value="NFCE">NFC-e (65)</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FiscalStatus | 'all')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              data-testid="fiscal-filter-status"
            >
              <option value="all">Todos os status</option>
              <option value="PENDING">Pendente</option>
              <option value="AUTHORIZED">Autorizada</option>
              <option value="REJECTED">Rejeitada</option>
              <option value="CANCELED">Cancelada</option>
              <option value="DENIED">Denegada</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Erro ao carregar documentos: {error.message}
          </div>
        )}

        {isLoading && documents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setFormOpen(true)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Autorizado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (
                  <FiscalRow
                    key={d.id}
                    doc={d}
                    busy={busy}
                    onView={() => setDocToDetails(d)}
                    onEmit={() => emit(d)}
                    onReject={() => emit(d, true)}
                    onRetry={() => retry(d)}
                    onCancel={() => setDocToCancel(d)}
                    onCopyKey={() => d.accessKey && copyAccessKey(d.accessKey)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <EmitModal
          busy={busy}
          onClose={() => setFormOpen(false)}
          onSuccess={async (msg) => {
            showToast('ok', msg)
            setFormOpen(false)
            await Promise.all([mutate(), statsFetch.mutate()])
          }}
          onError={(msg) => showToast('err', msg)}
        />
      )}

      {docToCancel && (
        <CancelModal
          doc={docToCancel}
          busy={busy}
          onClose={() => setDocToCancel(null)}
          onConfirm={cancel}
        />
      )}

      {docToDetails && (
        <DetailsModal doc={docToDetails} onClose={() => setDocToDetails(null)} onCopyKey={(k) => copyAccessKey(k)} />
      )}

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

// =================================================================
// Subcomponentes
// =================================================================

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof FileText; tone: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  } as const
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="p-12 text-center">
      <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300" />
      <h3 className="text-sm font-semibold text-slate-900">Nenhum documento fiscal</h3>
      <p className="mt-1 text-sm text-slate-500">Emita sua primeira NF-e a partir de um pedido.</p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        Emitir primeira NF
      </button>
    </div>
  )
}

function FiscalRow({
  doc, busy, onView, onEmit, onReject, onRetry, onCancel, onCopyKey,
}: {
  doc: FiscalDocument
  busy: boolean
  onView: () => void
  onEmit: () => void
  onReject: () => void
  onRetry: () => void
  onCancel: () => void
  onCopyKey: () => void
}) {
  return (
    <tr className="hover:bg-slate-50" data-testid={`fiscal-row-${doc.id}`}>
      <td className="px-4 py-3">
        <button onClick={onView} className="font-mono text-xs text-indigo-600 hover:underline">
          {doc.numero ? `${doc.numero}/${doc.serie ?? '1'}` : doc.id.slice(0, 8)}
        </button>
        {doc.accessKey && (
          <button
            onClick={onCopyKey}
            className="ml-2 inline-flex items-center gap-1 rounded text-xs text-slate-500 hover:text-slate-700"
            title="Copiar chave de acesso"
          >
            <Copy className="h-3 w-3" />
            {formatAccessKey(doc.accessKey).slice(0, 14)}…
          </button>
        )}
        <div className="mt-0.5 text-xs text-slate-500">Pedido: {doc.orderId.slice(0, 8)}</div>
      </td>
      <td className="px-4 py-3 text-xs">
        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700">
          {doc.docType}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoneyCents(doc.totalCents)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${FISCAL_STATUS_TONE[doc.status]}`}>
          {FISCAL_STATUS_LABELS[doc.status]}
        </span>
        {doc.errorMessage && (
          <div className="mt-0.5 max-w-[200px] truncate text-xs text-rose-600" title={doc.errorMessage}>
            {doc.errorMessage}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(doc.authorizedAt)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            onClick={onView}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Ver detalhes"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          {doc.status === 'PENDING' && (
            <>
              <button
                onClick={onEmit}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                data-testid={`fiscal-emit-${doc.id}`}
                title="Autorizar NF (simulação SEFAZ)"
              >
                <Send className="h-3 w-3" />
                Autorizar
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                title="Simular rejeição"
              >
                <XCircle className="h-3 w-3" />
                Rejeitar
              </button>
            </>
          )}
          {(doc.status === 'REJECTED' || doc.status === 'DENIED') && (
            <button
              onClick={onRetry}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              title="Reprocessar"
            >
              <RefreshCw className="h-3 w-3" />
              Reprocessar
            </button>
          )}
          {doc.status === 'AUTHORIZED' && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              title="Cancelar NF"
            >
              <Trash2 className="h-3 w-3" />
              Cancelar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function EmitModal({
  busy, onClose, onSuccess, onError,
}: {
  busy: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [orderId, setOrderId] = useState('')
  const [docType, setDocType] = useState<FiscalDocType>('NFE')

  const submit = async () => {
    if (!orderId.trim()) {
      onError('Informe o ID do pedido')
      return
    }
    try {
      const doc = await fiscalApi.create({ orderId: orderId.trim(), docType })
      onSuccess(`Documento #${doc.id.slice(0, 8)} criado em estado pendente`)
      setOrderId('')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao criar documento')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" data-testid="fiscal-emit-modal">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Emitir NF</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">ID do pedido *</label>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              data-testid="fiscal-emit-order"
            />
            <p className="mt-1 text-xs text-slate-500">Cole o ID (UUID) de um pedido existente</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Tipo de documento</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as FiscalDocType)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              data-testid="fiscal-emit-type"
            >
              <option value="NFE">NF-e (55)</option>
              <option value="NFCE">NFC-e (65)</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            data-testid="fiscal-emit-submit"
          >
            <Send className="h-4 w-4" />
            {busy ? 'Criando...' : 'Criar documento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CancelModal({
  doc, busy, onClose, onConfirm,
}: {
  doc: FiscalDocument
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Cancelar NF-e?</h3>
            <p className="text-sm text-slate-500">Informe o motivo do cancelamento.</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Ex: Erro de digitação na NF, pedido cancelado..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
          <div className="font-medium text-slate-900">NF {doc.numero}/{doc.serie}</div>
          <div className="text-slate-500">{formatMoneyCents(doc.totalCents)} • Chave: {formatAccessKey(doc.accessKey).slice(0, 20)}…</div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Voltar</button>
          <button
            onClick={() => onConfirm(reason.trim() || 'Cancelamento solicitado pelo usuário')}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            data-testid="fiscal-cancel-confirm"
          >
            {busy ? 'Cancelando...' : 'Cancelar NF'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailsModal({
  doc, onClose, onCopyKey,
}: {
  doc: FiscalDocument
  onClose: () => void
  onCopyKey: (key: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" data-testid="fiscal-details-modal">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {doc.numero ? `NF ${doc.numero}/${doc.serie}` : `Documento ${doc.id.slice(0, 8)}`}
            </h2>
            <p className="text-xs text-slate-500">{FISCAL_DOC_TYPE_LABELS[doc.docType]}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500">Status</div>
              <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${FISCAL_STATUS_TONE[doc.status]}`}>
                {FISCAL_STATUS_LABELS[doc.status]}
              </span>
            </div>
            <div>
              <div className="text-xs text-slate-500">Valor</div>
              <div className="text-base font-semibold text-slate-900">{formatMoneyCents(doc.totalCents)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Autorizado em</div>
              <div className="text-sm text-slate-900">{formatDateTime(doc.authorizedAt)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Protocolo</div>
              <div className="text-sm font-mono text-slate-900">{doc.protocol ?? '—'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-500">Chave de acesso</div>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <code className="flex-1 font-mono text-xs text-slate-800">{formatAccessKey(doc.accessKey)}</code>
                {doc.accessKey && (
                  <button
                    onClick={() => onCopyKey(doc.accessKey!)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                    title="Copiar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Pedido</div>
              <div className="font-mono text-xs text-slate-700">{doc.orderId}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Filial</div>
              <div className="font-mono text-xs text-slate-700">{doc.branchId}</div>
            </div>
          </div>
          {doc.errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs font-semibold text-rose-700">Mensagem da SEFAZ</div>
              <div className="mt-1 text-sm text-rose-800">{doc.errorMessage}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

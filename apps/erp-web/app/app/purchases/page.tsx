'use client'

/**
 * Página de Pedidos de Compra (Compras) — Dark Luxe.
 *
 * Fluxo:
 *   DRAFT → SENT → CONFIRMED → RECEIVED (gera entrada de estoque) | CANCELED
 *
 * Componentes:
 *   - 4 KPIs (Rascunhos, Abertos, Recebidos, Valor Total)
 *   - Filtros por status e fornecedor
 *   - Tabela com ações (visualizar, avançar status, receber, excluir)
 *   - Modal de criação/edição com lista de produtos
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, X, Search, Truck, Trash2, Check, PackageCheck,
  Send, CheckCircle, XCircle, AlertTriangle, FileText,
  Edit2, Save, Download, ShoppingCart, DollarSign, Clock, Package,
} from 'lucide-react'
import {
  purchasesApi, formatMoneyCents, formatDate, formatDateTime,
  PURCHASE_STATUS_LABELS, PURCHASE_STATUS_TONE,
  calcOrderTotalCents, nextStatusOptions,
  type PurchaseOrder, type PurchaseOrderStatus, type PurchaseOrderItemInput,
  type SupplierLookup, type ProductLookup,
} from '@/lib/api/purchases'
import { suppliersApi } from '@/lib/api/suppliers'
import { productsApi } from '@/lib/api/products'
import { useFetch } from '@/lib/use-fetch'

const KEY = 'purchases:list:v1'

type FormFields = {
  supplierId: string
  expectedDate: string
  notes: string
  items: PurchaseOrderItemInput[]
}

const EMPTY_FIELDS: FormFields = {
  supplierId: '',
  expectedDate: '',
  notes: '',
  items: [],
}

export default function PurchasesPage() {
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const fetchParams = useMemo(() => ({
    status: statusFilter === 'all' ? 'all' as const : statusFilter,
    supplierId: supplierFilter !== 'all' ? supplierFilter : undefined,
  }), [statusFilter, supplierFilter])

  const fetch = useFetch(KEY, (signal) => purchasesApi.list(fetchParams, signal), { ttl: 5000 })
  const { data, mutate, isLoading, error } = fetch

  const suppliersFetch = useFetch('suppliers:list:purchases', (signal) => suppliersApi.list({ includeArchived: true }, signal), { ttl: 60_000 })
  const productsFetch = useFetch('products:list:purchases', (signal) => productsApi.list({}, signal), { ttl: 60_000 })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS)
  const [fieldsKey, setFieldsKey] = useState(0)

  const [delOrder, setDelOrder] = useState<PurchaseOrder | null>(null)
  const [delOpen, setDelOpen] = useState(false)

  const [detailsOrder, setDetailsOrder] = useState<PurchaseOrder | null>(null)

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const orders = data?.items ?? []
  const suppliers = suppliersFetch.data?.items ?? []
  const products = productsFetch.data?.items ?? []

  useEffect(() => {
    const anyOpen = formOpen || delOpen || !!detailsOrder
    if (!anyOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [formOpen, delOpen, detailsOrder])

  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) =>
      o.supplierName.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      (o.notes ?? '').toLowerCase().includes(q) ||
      o.items.some((it) => it.productName.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)),
    )
  }, [orders, query])

  const stats = useMemo(() => {
    const drafts = orders.filter((o) => o.status === 'DRAFT').length
    const openCount = orders.filter((o) => o.status === 'SENT' || o.status === 'CONFIRMED').length
    const received = orders.filter((o) => o.status === 'RECEIVED').length
    const total = orders.reduce((acc, o) => acc + o.totalCents, 0)
    return { drafts, open: openCount, received, total }
  }, [orders])

  const openCreate = () => {
    setEditing(null)
    setFields(EMPTY_FIELDS)
    setFieldsKey((k) => k + 1)
    setFormOpen(true)
  }

  const openEdit = (o: PurchaseOrder) => {
    setEditing(o)
    setFields({
      supplierId: o.supplierId,
      expectedDate: o.expectedDate ? o.expectedDate.slice(0, 10) : '',
      notes: o.notes ?? '',
      items: o.items.map((it) => ({
        productId: it.productId,
        unitCode: it.unitCode,
        quantity: it.quantity,
        unitCostCents: it.unitCostCents,
      })),
    })
    setFieldsKey((k) => k + 1)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const submitForm = async () => {
    if (!fields.supplierId) {
      showToast('err', 'Selecione um fornecedor')
      return
    }
    if (fields.items.length === 0) {
      showToast('err', 'Adicione ao menos um item')
      return
    }
    for (const it of fields.items) {
      if (!it.productId) {
        showToast('err', 'Selecione o produto de todos os itens')
        return
      }
      if (it.quantity <= 0) {
        showToast('err', 'Quantidade deve ser maior que zero')
        return
      }
      if (it.unitCostCents < 0) {
        showToast('err', 'Custo unitário inválido')
        return
      }
    }
    setBusy(true)
    try {
      if (editing) {
        const updateBody: { status?: PurchaseOrderStatus; expectedDate?: string | null; notes?: string | null } = {}
        if (fields.expectedDate) updateBody.expectedDate = new Date(`${fields.expectedDate}T12:00:00Z`).toISOString()
        else updateBody.expectedDate = null
        updateBody.notes = fields.notes.trim() || null
        await purchasesApi.update(editing.id, updateBody)
        showToast('ok', 'Pedido atualizado')
      } else {
        const items = fields.items.map((it) => {
          const p = products.find((pr) => pr.id === it.productId)
          return {
            productId: it.productId,
            productName: p?.name,
            sku: p?.sku,
            unitCode: it.unitCode || p?.baseUnit || 'un',
            quantity: it.quantity,
            unitCostCents: it.unitCostCents,
          }
        })
        await purchasesApi.create({
          supplierId: fields.supplierId,
          status: 'DRAFT',
          expectedDate: fields.expectedDate ? new Date(`${fields.expectedDate}T12:00:00Z`).toISOString() : null,
          items,
          notes: fields.notes.trim() || null,
        })
        showToast('ok', 'Pedido criado')
      }
      await mutate()
      closeForm()
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setBusy(false)
    }
  }

  const advanceStatus = async (o: PurchaseOrder, next: PurchaseOrderStatus) => {
    setBusy(true)
    try {
      await purchasesApi.update(o.id, { status: next })
      showToast('ok', `Status alterado para ${PURCHASE_STATUS_LABELS[next]}`)
      await mutate()
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao alterar status')
    } finally {
      setBusy(false)
    }
  }

  const receiveOrder = async (o: PurchaseOrder) => {
    if (!confirm(`Confirmar o recebimento de ${o.items.length} item(ns)? Isso vai gerar entrada no estoque.`)) {
      return
    }
    setBusy(true)
    try {
      const result = await purchasesApi.receive(o.id)
      showToast('ok', `Pedido recebido — ${result.movementsCreated} entrada(s) de estoque`)
      await mutate()
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao receber pedido')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!delOrder) return
    setBusy(true)
    try {
      await purchasesApi.remove(delOrder.id)
      showToast('ok', 'Pedido excluído')
      await mutate()
      setDelOpen(false)
      setDelOrder(null)
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    if (filtered.length === 0) {
      showToast('err', 'Nenhum pedido para exportar')
      return
    }
    const header = ['id', 'fornecedor', 'status', 'itens', 'total_centavos', 'previsao', 'criado_em']
    const rows = filtered.map((o) => [
      o.id,
      o.supplierName,
      PURCHASE_STATUS_LABELS[o.status],
      String(o.items.length),
      String(o.totalCents),
      o.expectedDate ?? '',
      o.createdAt,
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compras-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('ok', `${filtered.length} pedido(s) exportados`)
  }

  return (
    <div className="space-y-6 anim-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-[28px] font-semibold text-paper serif-h2">
            <span className="h-9 w-9 rounded-md bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/30">
              <Truck className="h-4.5 w-4.5" />
            </span>
            Pedidos <span className="italic-accent">de Compra</span>
          </h1>
          <p className="mt-1 text-sm text-paper-3 font-mono tracking-wide">
            DRAFT → SENT → CONFIRMED → RECEIVED (gera entrada no estoque)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportCsv}
            className="btn-ghost h-10 px-3 text-sm font-semibold flex items-center gap-2"
            data-testid="purchases-export"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <button
            onClick={openCreate}
            className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            disabled={isLoading && products.length === 0}
            data-testid="purchases-new"
          >
            <Plus className="h-4 w-4" />
            Novo pedido
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Rascunhos" value={String(stats.drafts)} icon={FileText} tone="muted" />
        <KpiCard label="Em aberto" value={String(stats.open)} icon={Clock} tone="gold" />
        <KpiCard label="Recebidos" value={String(stats.received)} icon={PackageCheck} tone="emerald" />
        <KpiCard label="Total" value={formatMoneyCents(stats.total)} icon={DollarSign} tone="accent" />
      </div>

      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por fornecedor, item ou observação..."
                className="input-base h-10 w-full pl-10 pr-3 text-sm"
                data-testid="purchases-search"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PurchaseOrderStatus | 'all')}
              className="input-base h-10 px-3 text-sm"
              data-testid="purchases-filter-status"
            >
              <option value="all">Todos os status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="SENT">Enviado</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="RECEIVED">Recebido</option>
              <option value="CANCELED">Cancelado</option>
            </select>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="input-base h-10 px-3 text-sm"
              data-testid="purchases-filter-supplier"
            >
              <option value="all">Todos os fornecedores</option>
              {suppliers.map((s: SupplierLookup) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="border-b border-crimson/30 bg-crimson/10 p-4 text-sm text-crimson">
            Erro ao carregar pedidos: {error.message}
          </div>
        )}

        {isLoading && orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-paper-3 anim-fade-in">Carregando pedidos...</div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-3 text-xs uppercase text-paper-3 font-semibold tracking-wider">
                <tr>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3 text-right">Itens</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Previsão</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    onView={() => setDetailsOrder(o)}
                    onEdit={() => openEdit(o)}
                    onAdvance={(s) => advanceStatus(o, s)}
                    onReceive={() => receiveOrder(o)}
                    onDelete={() => { setDelOrder(o); setDelOpen(true) }}
                    disabled={busy}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <PurchaseFormModal
          fields={fields}
          setFields={setFields}
          editing={editing}
          suppliers={suppliers}
          products={products}
          busy={busy}
          onClose={closeForm}
          onSubmit={submitForm}
          fieldsKey={fieldsKey}
        />
      )}

      {delOpen && delOrder && (
        <DeleteModal order={delOrder} busy={busy} onClose={() => { setDelOpen(false); setDelOrder(null) }} onConfirm={confirmDelete} />
      )}

      {detailsOrder && (
        <DetailsModal order={detailsOrder} onClose={() => setDetailsOrder(null)} />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md px-4 py-3 text-sm font-medium shadow-2xl anim-fade-up ${
            toast.kind === 'ok'
              ? 'bg-emerald/15 border border-emerald/40 text-emerald'
              : 'bg-crimson/15 border border-crimson/40 text-crimson'
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

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Package; tone: 'muted' | 'gold' | 'emerald' | 'accent' }) {
  const tones = {
    muted:   { box: 'bg-bg-3 text-paper-3', ring: 'ring-line' },
    gold:    { box: 'bg-gold/12 text-gold', ring: 'ring-gold/30' },
    emerald: { box: 'bg-emerald/12 text-emerald', ring: 'ring-emerald/30' },
    accent:  { box: 'bg-accent/12 text-accent', ring: 'ring-accent/30' },
  } as const
  const t = tones[tone]
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-paper-3">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ring-1 ${t.box} ${t.ring}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold text-paper font-mono tracking-tight">{value}</div>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="p-12 text-center anim-fade-in">
      <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-bg-3 ring-1 ring-line flex items-center justify-center">
        <ShoppingCart className="h-7 w-7 text-paper-3" />
      </div>
      <h3 className="text-sm font-semibold text-paper">Nenhum pedido de compra</h3>
      <p className="mt-1 text-sm text-paper-3">Crie seu primeiro pedido para começar a repor estoque.</p>
      <button
        onClick={onCreate}
        className="btn-primary mt-5 inline-flex items-center gap-2 h-10 px-4 text-sm font-semibold"
      >
        <Plus className="h-4 w-4" />
        Criar primeiro pedido
      </button>
    </div>
  )
}

function OrderRow({
  order, onView, onEdit, onAdvance, onReceive, onDelete, disabled,
}: {
  order: PurchaseOrder
  onView: () => void
  onEdit: () => void
  onAdvance: (s: PurchaseOrderStatus) => void
  onReceive: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const next = nextStatusOptions(order.status)
  return (
    <tr className="hover:bg-bg-3/40 transition-colors" data-testid={`purchase-row-${order.id}`}>
      <td className="px-4 py-3">
        <button
          onClick={onView}
          className="font-mono text-xs text-accent hover:text-accent-2 transition-colors underline-ink"
        >
          {order.id.slice(0, 8)}
        </button>
        {order.notes && (
          <div className="mt-0.5 max-w-[200px] truncate text-xs text-paper-3" title={order.notes}>
            {order.notes}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-paper-2 font-medium">{order.supplierName}</td>
      <td className="px-4 py-3 text-right tabular-nums font-mono text-paper-2">{order.items.length}</td>
      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-paper">{formatMoneyCents(order.totalCents)}</td>
      <td className="px-4 py-3 text-paper-3 text-sm">{formatDate(order.expectedDate)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${PURCHASE_STATUS_TONE[order.status]}`}>
          {PURCHASE_STATUS_LABELS[order.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-paper-3 font-mono">{formatDate(order.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {next.map((s) => {
            if (s === 'RECEIVED') {
              return (
                <button
                  key={s}
                  onClick={onReceive}
                  disabled={disabled}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald/30 bg-emerald/10 px-2 py-1 text-xs font-semibold text-emerald hover:bg-emerald/20 transition-colors disabled:opacity-50"
                  title="Receber (gera entrada de estoque)"
                  data-testid={`purchase-receive-${order.id}`}
                >
                  <PackageCheck className="h-3 w-3" />
                  Receber
                </button>
              )
            }
            const Icon = s === 'SENT' ? Send : s === 'CONFIRMED' ? CheckCircle : XCircle
            return (
              <button
                key={s}
                onClick={() => onAdvance(s)}
                disabled={disabled}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  s === 'CANCELED'
                    ? 'border-crimson/30 bg-crimson/10 text-crimson hover:bg-crimson/20'
                    : 'border-line bg-bg-2 text-paper-2 hover:bg-bg-3 hover:text-paper'
                }`}
                title={`Marcar como ${PURCHASE_STATUS_LABELS[s]}`}
              >
                <Icon className="h-3 w-3" />
                {PURCHASE_STATUS_LABELS[s]}
              </button>
            )
          })}
          {order.status !== 'RECEIVED' && order.status !== 'CANCELED' && (
            <button
              onClick={onEdit}
              className="rounded-md p-1.5 text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors"
              title="Editar"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
          {order.status !== 'RECEIVED' && (
            <button
              onClick={onDelete}
              className="rounded-md p-1.5 text-paper-3 hover:bg-crimson/15 hover:text-crimson transition-colors"
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function PurchaseFormModal({
  fields, setFields, editing, suppliers, products, busy, onClose, onSubmit, fieldsKey,
}: {
  fields: FormFields
  setFields: React.Dispatch<React.SetStateAction<FormFields>>
  editing: PurchaseOrder | null
  suppliers: SupplierLookup[]
  products: ProductLookup[]
  busy: boolean
  onClose: () => void
  onSubmit: () => void
  fieldsKey: number
}) {
  const isEditing = !!editing
  const total = useMemo(() => calcOrderTotalCents(fields.items), [fields.items])

  const addItem = () => {
    setFields((f) => ({
      ...f,
      items: [...f.items, { productId: '', unitCode: 'un', quantity: 1, unitCostCents: 0 }],
    }))
  }

  const removeItem = (idx: number) => {
    setFields((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const updateItem = (idx: number, patch: Partial<PurchaseOrderItemInput>) => {
    setFields((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 anim-fade-in"
      data-testid="purchase-form-modal"
    >
      <div className="card-elevated flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl anim-fade-up">
        <div className="card-top-line" />
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="serif-h2 text-xl text-paper">
              {isEditing ? <>Editar pedido <span className="italic-accent">#{editing?.id.slice(0, 8)}</span></> : 'Novo pedido de compra'}
            </h2>
            <p className="mt-0.5 text-xs text-paper-3">
              {isEditing ? 'Atualize dados e observações (itens e fornecedor não podem ser alterados após envio)' : 'Selecione fornecedor, previsão e itens'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="label mb-1.5 block">Fornecedor *</label>
              <select
                key={`supplier-${fieldsKey}`}
                value={fields.supplierId}
                onChange={(e) => setFields((f) => ({ ...f, supplierId: e.target.value }))}
                disabled={isEditing}
                className="input-base h-10 w-full px-3 text-sm disabled:opacity-50"
                data-testid="purchase-form-supplier"
              >
                <option value="">Selecione...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label mb-1.5 block">Previsão de entrega</label>
              <input
                type="date"
                value={fields.expectedDate}
                onChange={(e) => setFields((f) => ({ ...f, expectedDate: e.target.value }))}
                className="input-base h-10 w-full px-3 text-sm"
                data-testid="purchase-form-date"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="label mb-1.5 block">Observação</label>
            <textarea
              value={fields.notes}
              onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              maxLength={500}
              placeholder="Ex: Pedido urgente, solicitar NF-e, etc."
              className="input-base min-h-[60px] w-full px-3 py-2 text-sm resize-y"
              data-testid="purchase-form-notes"
            />
          </div>

          {!isEditing && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-paper">Itens do pedido</h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-bg-2 px-2.5 py-1 text-xs font-semibold text-paper-2 hover:bg-bg-3 hover:text-paper transition-colors"
                  data-testid="purchase-form-add-item"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar item
                </button>
              </div>
              {fields.items.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-line p-8 text-center text-sm text-paper-3">
                  Nenhum item. Clique em "Adicionar item" para começar.
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.items.map((it, idx) => {
                    const product = products.find((p) => p.id === it.productId)
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 items-center gap-2 rounded-lg border border-line bg-bg-2 p-2.5"
                        data-testid={`purchase-form-item-${idx}`}
                      >
                        <div className="col-span-5">
                          <select
                            value={it.productId}
                            onChange={(e) => {
                              const p = products.find((pr) => pr.id === e.target.value)
                              updateItem(idx, {
                                productId: e.target.value,
                                unitCode: p?.baseUnit ?? 'un',
                                unitCostCents: p ? 0 : it.unitCostCents,
                              })
                            }}
                            className="input-base h-9 w-full px-2 text-sm"
                          >
                            <option value="">Produto...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0.001}
                            step="0.001"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                            className="input-base h-9 w-full px-2 text-right font-mono text-sm"
                            placeholder="Qtd"
                          />
                        </div>
                        <div className="col-span-1">
                          <span className="text-xs text-paper-3 font-mono">{it.unitCode || 'un'}</span>
                        </div>
                        <div className="col-span-3">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-paper-3 font-mono">R$</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={(it.unitCostCents / 100).toFixed(2)}
                              onChange={(e) => updateItem(idx, { unitCostCents: Math.round((Number(e.target.value) || 0) * 100) })}
                              className="input-base h-9 w-full px-2 text-right font-mono text-sm"
                              placeholder="Custo"
                            />
                          </div>
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="rounded-md p-1.5 text-paper-3 hover:bg-crimson/15 hover:text-crimson transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="col-span-12 -mt-0.5 text-right text-xs text-paper-3">
                          Subtotal: <strong className="text-paper font-mono">{formatMoneyCents(Math.round(it.quantity * it.unitCostCents))}</strong>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
            <span className="text-sm font-semibold text-accent">Total do pedido</span>
            <span className="text-xl font-bold text-accent font-mono" data-testid="purchase-form-total">
              {formatMoneyCents(total)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-bg-2 px-6 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="btn-ghost h-10 px-4 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            data-testid="purchase-form-submit"
          >
            <Save className="h-4 w-4" />
            {busy ? 'Salvando...' : isEditing ? 'Atualizar' : 'Criar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ order, busy, onClose, onConfirm }: { order: PurchaseOrder; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 anim-fade-in">
      <div className="card-elevated w-full max-w-md p-6 shadow-2xl anim-fade-up">
        <div className="card-top-line" />
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-crimson/15 ring-1 ring-crimson/30 text-crimson">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-paper">Excluir pedido?</h3>
            <p className="text-sm text-paper-3">Esta ação não pode ser desfeita.</p>
          </div>
        </div>
        <div className="mb-6 rounded-lg border border-line bg-bg-2 p-3 text-sm">
          <div className="font-semibold text-paper font-mono">Pedido #{order.id.slice(0, 8)}</div>
          <div className="text-paper-3">{order.supplierName} • {order.items.length} item(ns) • {formatMoneyCents(order.totalCents)}</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-ghost h-10 px-4 text-sm">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="h-10 px-4 text-sm font-semibold rounded-md bg-crimson hover:bg-crimson/85 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            data-testid="purchase-delete-confirm"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? 'Excluindo...' : 'Excluir pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailsModal({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 anim-fade-in" data-testid="purchase-details-modal">
      <div className="card-elevated flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl anim-fade-up">
        <div className="card-top-line" />
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="serif-h2 text-xl text-paper">Pedido <span className="italic-accent">#{order.id.slice(0, 8)}</span></h2>
            <p className="mt-0.5 text-xs text-paper-3">{order.supplierName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="label mb-1">Status</div>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${PURCHASE_STATUS_TONE[order.status]}`}>
                {PURCHASE_STATUS_LABELS[order.status]}
              </span>
            </div>
            <div>
              <div className="label mb-1">Previsão</div>
              <div className="text-sm font-semibold text-paper">{formatDate(order.expectedDate)}</div>
            </div>
            <div>
              <div className="label mb-1">Criado em</div>
              <div className="text-sm font-semibold text-paper font-mono">{formatDateTime(order.createdAt)}</div>
            </div>
            <div>
              <div className="label mb-1">Recebido em</div>
              <div className="text-sm font-semibold text-paper font-mono">{formatDateTime(order.receivedAt)}</div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-paper">Itens</h3>
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-bg-3 text-xs uppercase text-paper-3 font-semibold tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Custo un.</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-bg-3/40">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-paper">{it.productName}</div>
                        <div className="text-xs text-paper-3 font-mono">{it.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-mono text-paper-2">{it.quantity} {it.unitCode}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-mono text-paper-2">{formatMoneyCents(it.unitCostCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-mono font-semibold text-paper">{formatMoneyCents(it.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-bg-2">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-paper">Total</td>
                    <td className="px-3 py-2 text-right text-base font-bold text-accent font-mono">{formatMoneyCents(order.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {order.notes && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-paper">Observação</h3>
              <p className="text-sm text-paper-2 leading-relaxed">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

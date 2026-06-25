'use client'

/**
 * Movimentações de Estoque.
 *
 * Funcionalidades:
 * - 4 KPIs (Produtos / Saídas no mês / Entradas no mês / Movimentações)
 * - Tabela com tipo, produto, qtd, ref, data, motivo
 * - Filtros: tipo de movimento, busca por produto
 * - Card "Saldo atual" dos top produtos
 * - Botão "Ajustar estoque" abre modal de ajuste
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  Search,
  X,
  Sliders,
  Hash,
  Layers,
  Loader2,
  RefreshCw,
  Plus,
  Minus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { useFetch } from '@/lib/use-fetch'
import { useDebounce } from '@/lib/use-debounce'
import {
  inventoryApi,
  productsApi,
  formatDateTime,
  formatQty,
  MOVEMENT_LABELS,
  MOVEMENT_TONE,
  TONE_BG,
  type InventoryMovement,
  type MovementType,
  type Product,
} from '@/lib/api/inventory'

const MOVEMENT_FILTERS: { key: MovementType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'SALE', label: 'Vendas' },
  { key: 'ADJUSTMENT', label: 'Ajustes' },
  { key: 'TRANSFER_IN', label: 'Transf. entrada' },
  { key: 'TRANSFER_OUT', label: 'Transf. saída' },
]

const PAGE_SIZE = 25

type MovementsResponse = {
  items: InventoryMovement[]
  total: number
  limit?: number
  offset?: number
}

export default function InventoryMovementsPage() {
  // ===== FILTROS =====
  const [typeFilter, setTypeFilter] = useState<MovementType | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  // PERF: debounce de 250ms no search para evitar refetch a cada tecla
  const debouncedSearch = useDebounce(search, 250)

  // ===== TABELA =====
  const [page, setPage] = useState(1)
  // PERF: paginação server-side — usa offset baseado em (page-1)*PAGE_SIZE
  const offset = (page - 1) * PAGE_SIZE

  // ===== MODAL DE AJUSTE =====
  const [adjustOpen, setAdjustOpen] = useState(false)

  // ===== TOAST =====
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ===== FETCH =====
  // PERF: signal passado para fetch permite cancelar requisição se componente desmontar
  // ou se um novo filtro invalidar o resultado anterior.
  const { data: movementsData, mutate: mutateMovements, isLoading: isLoadingMovs } = useFetch<MovementsResponse>(
    `inventory:movements:p${page}:t${typeFilter}:q${debouncedSearch.trim()}`,
    (signal) => inventoryApi.movements(
      {
        productId: undefined,
        limit: PAGE_SIZE,
        offset,
        ...(typeFilter !== 'ALL' ? { type: typeFilter } : {}),
      },
      signal,
    ),
    {
      ttl: 30_000,
      revalidateOnFocus: true,
    },
  )

  const { data: productsData } = useFetch<{ items: Product[] }>(
    'inventory:products',
    (signal) => productsApi.list({}, signal),
    { ttl: 60_000 },
  )

  const movements = useMemo(() => movementsData?.items ?? [], [movementsData])
  const total = movementsData?.total ?? 0
  const products = useMemo(() => productsData?.items ?? [], [productsData])

  // Map de produtos por id para lookup rápido
  const productMap = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  // ===== KPIs =====
  // Os KPIs agora vêm do total + heurística baseada na primeira página carregada.
  // Para 100% precisão precisaríamos de um endpoint /movements/stats, mas isso seria
  // uma chamada extra a cada carga — optamos por uma aproximação baseada na página atual.
  const kpis = useMemo(() => {
    let salesCount = 0
    let adjustmentsCount = 0
    let transferInCount = 0
    let transferOutCount = 0
    for (const m of movements) {
      if (m.movementType === 'SALE') salesCount++
      else if (m.movementType === 'ADJUSTMENT') adjustmentsCount++
      else if (m.movementType === 'TRANSFER_IN') transferInCount++
      else if (m.movementType === 'TRANSFER_OUT') transferOutCount++
    }
    return { salesCount, adjustmentsCount, transferInCount, transferOutCount, total }
  }, [movements, total])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  // Items já vêm paginados do servidor (slice no servidor)
  const pageItems = movements

  useEffect(() => {
    setPage(1)
  }, [typeFilter, debouncedSearch])

  // ESC fecha modal
  useEffect(() => {
    if (!adjustOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdjustOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adjustOpen])

  const handleAdjusted = useCallback(
    async (msg: string) => {
      setToast({ kind: 'ok', msg })
      setAdjustOpen(false)
      await mutateMovements()
    },
    [mutateMovements],
  )

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 font-semibold">
            <a href="/app/inventory" className="hover:text-white transition-colors">
              ← Voltar para Estoque
            </a>
          </div>
          <h1 className="text-xl font-semibold text-white">Movimentações de Estoque</h1>
          <p className="text-sm text-white/50 mt-1">
            Histórico de entradas, saídas e ajustes · {total} registro
            {total === 1 ? '' : 's'}
            {(typeFilter !== 'ALL' || debouncedSearch.trim()) && movements.length !== total && (
              <span className="text-white/30"> (filtrado, mostrando {movements.length})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mutateMovements()}
            disabled={isLoadingMovs}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${isLoadingMovs ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setAdjustOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-semibold transition-colors"
          >
            <Sliders className="size-3.5" />
            Ajustar estoque
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Activity}
          label="Total de movimentações"
          value={String(kpis.total)}
          tone="blue"
        />
        <Kpi
          icon={ArrowUpFromLine}
          label="Vendas (saídas)"
          value={String(kpis.salesCount)}
          tone="red"
        />
        <Kpi
          icon={ArrowDownToLine}
          label="Ajustes"
          value={String(kpis.adjustmentsCount)}
          tone="blue"
        />
        <Kpi
          icon={Layers}
          label="Transferências"
          value={String(kpis.transferInCount + kpis.transferOutCount)}
          tone="amber"
        />
      </div>

      {/* FILTROS */}
      <div className="card p-4 space-y-3">
        <div className="relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por produto, SKU, motivo, ref…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-5 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.05]"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40 mr-2 font-semibold">
            Tipo
          </span>
          {MOVEMENT_FILTERS.map((f) => {
            const active = typeFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setTypeFilter(f.key)}
                className={`px-3 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* TABELA */}
      <div className="card overflow-hidden">
        {isLoadingMovs && !movementsData ? (
          <div className="p-12 text-center text-xs text-white/40 flex items-center justify-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando movimentações…
          </div>
        ) : total === 0 ? (
          <div className="p-12 text-center">
            <Package className="size-8 text-white/20 mx-auto mb-3" />
            <div className="text-sm text-white/60">Nenhuma movimentação encontrada</div>
            <div className="text-[11px] text-white/30 mt-1">
              Ajuste os filtros ou crie um pedido para gerar saída de estoque
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-white/40 uppercase tracking-wider border-b border-white/[0.05]">
                    <th className="px-4 py-2.5 text-left font-semibold">Tipo</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Produto</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Quantidade</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Referência</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Motivo</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((m) => {
                    const tone = MOVEMENT_TONE[m.movementType]
                    const product = productMap.get(m.productId)
                    const isExit =
                      m.movementType === 'SALE' || m.movementType === 'TRANSFER_OUT'
                    return (
                      <tr
                        key={m.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                          >
                            {MOVEMENT_LABELS[m.movementType]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-white truncate max-w-[260px]">
                            {product?.name ?? '(produto removido)'}
                          </div>
                          {product && (
                            <div className="text-[10px] text-white/40 mt-0.5 font-mono">
                              {product.sku}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div
                            className={`text-sm font-bold tabular-nums ${
                              isExit ? 'text-red-300' : 'text-green-300'
                            }`}
                          >
                            {isExit ? '−' : '+'}
                            {formatQty(Math.abs(m.quantityBase), product?.baseUnit ?? '')}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {m.refType ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-white/60 font-mono">
                              <Hash className="size-2.5 text-white/30" />
                              {m.refId ? m.refId.slice(0, 8).toUpperCase() : '—'}
                              <span className="text-white/30 text-[10px]">{m.refType}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-white/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-white/60 max-w-[200px] truncate">
                            {m.reason ?? <span className="text-white/30">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[11px] text-white/70">
                            {formatDateTime(m.createdAt)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
                <div className="text-[11px] text-white/40">
                  <span className="text-white/60 font-semibold">{offset + 1}</span>–
                  <span className="text-white/60 font-semibold">
                    {Math.min(offset + PAGE_SIZE, total)}
                  </span>{' '}
                  de <span className="text-white/60 font-semibold">{total}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="px-2 h-7 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-[11px] text-white/60 px-2">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-2 h-7 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL DE AJUSTE */}
      {adjustOpen && (
        <AdjustModal
          products={products}
          productMap={productMap}
          onClose={() => setAdjustOpen(false)}
          onAdjusted={handleAdjusted}
          onError={(msg) => setToast({ kind: 'err', msg })}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === 'ok'
              ? 'bg-green-500/15 text-green-300 border border-green-500/30'
              : 'bg-red-500/15 text-red-300 border border-red-500/30'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ============ KPI ============

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  tone: 'blue' | 'red' | 'amber' | 'green'
}) {
  const colorMap: Record<typeof tone, { color: string; bg: string; border: string }> = {
    blue: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.20)' },
    red: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.20)' },
    amber: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
    green: { color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.20)' },
  }
  const t = colorMap[tone]
  return (
    <div className="card p-4 flex items-center gap-3">
      <div
        className="size-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: t.bg, border: `1px solid ${t.border}` }}
      >
        <Icon className="size-4" style={{ color: t.color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          {label}
        </div>
        <div className="text-lg font-black text-white tabular-nums">{value}</div>
      </div>
    </div>
  )
}

// ============ MODAL DE AJUSTE ============

function AdjustModal({
  products,
  productMap,
  onClose,
  onAdjusted,
  onError,
}: {
  products: Product[]
  productMap: Map<string, Product>
  onClose: () => void
  onAdjusted: (msg: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const [productId, setProductId] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products.slice(0, 50)
    const q = search.trim().toLowerCase()
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [products, search])

  const selected = productId ? productMap.get(productId) : null

  const handleSubmit = async () => {
    if (!productId) {
      setError('Selecione um produto')
      return
    }
    const q = parseFloat(qty.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) {
      setError('Quantidade inválida')
      return
    }
    if (reason.trim().length < 3) {
      setError('Motivo é obrigatório (mínimo 3 caracteres)')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await inventoryApi.adjust({
        productId,
        quantity: q,
        type: direction,
        reason: reason.trim(),
      })
      await onAdjusted(
        `Estoque ajustado: ${direction === 'in' ? '+' : '−'}${res.movement.quantityBase} ${selected?.baseUnit ?? ''}`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao ajustar estoque'
      setError(msg)
      onError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-white/[0.08] shadow-2xl rounded-2xl w-full max-w-md">
          <div className="flex items-start justify-between p-5 border-b border-white/[0.05]">
            <div>
              <h2 className="text-base font-bold text-white">Ajustar Estoque</h2>
              <p className="text-xs text-white/50 mt-1">
                Movimentação manual — registra um ajuste de saldo
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Produto */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5 block">
                Produto
              </label>
              {!productId ? (
                <>
                  <div className="relative mb-2">
                    <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar produto…"
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="max-h-[180px] overflow-y-auto rounded-lg border border-white/[0.05]">
                    {filteredProducts.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-white/40">
                        Nenhum produto encontrado
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/[0.05]">
                        {filteredProducts.map((p) => (
                          <li
                            key={p.id}
                            onClick={() => {
                              setProductId(p.id)
                              setSearch('')
                            }}
                            className="px-3 py-2 hover:bg-white/[0.03] cursor-pointer transition-colors"
                          >
                            <div className="text-sm text-white font-medium truncate">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-white/40 mt-0.5 font-mono">
                              {p.sku} · {p.baseUnit}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <div className="card p-3 flex items-center gap-2">
                  <Package className="size-4 text-white/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {selected?.name}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      {selected?.sku} · {selected?.baseUnit}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProductId('')}
                    className="text-[10px] text-white/50 hover:text-white"
                  >
                    Trocar
                  </button>
                </div>
              )}
            </div>

            {/* Direção */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5 block">
                Direção
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('in')}
                  className={`h-10 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    direction === 'in'
                      ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                      : 'bg-white/[0.04] text-white/60 hover:text-white border border-transparent'
                  }`}
                >
                  <Plus className="size-3.5" />
                  Entrada
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('out')}
                  className={`h-10 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    direction === 'out'
                      ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                      : 'bg-white/[0.04] text-white/60 hover:text-white border border-transparent'
                  }`}
                >
                  <Minus className="size-3.5" />
                  Saída
                </button>
              </div>
            </div>

            {/* Quantidade */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5 block">
                Quantidade ({selected?.baseUnit ?? 'unidade base'})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Ex: 10"
                className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 tabular-nums"
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5 block">
                Motivo
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Inventário, perda, contagem…"
                className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
          </div>

          <div className="flex gap-2 p-5 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-10 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !productId}
              className="flex-[2] h-10 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Salvando…
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Confirmar ajuste
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

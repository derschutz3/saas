'use client'

/**
 * Página de Estoque com:
 * - Sidebar (tree view) com contagem por categoria
 * - Listagem agrupada por categoria (collapsible)
 * - Busca global (nome, SKU OU categoria)
 * - Filtro multi-categoria com faceted search
 * - Autocomplete de categorias na busca
 * - Persistência do estado expandido/colapsado (localStorage)
 * - Bulk select + bulk move entre categorias
 */
import { useCallback, useEffect, useMemo, useState, memo } from 'react'
import dynamic from 'next/dynamic'
import {
  Boxes, ChevronRight, ChevronDown, Search, X, CheckSquare, Square,
  Move, Package, Tag, Plus, FileUp, FileSpreadsheet, Check,
  BarChart3, List, Sparkles, ArrowUpRight, MoreHorizontal, Pencil,
} from 'lucide-react'
import { categoriesApi, productsApi, type Category, type Product } from '@/lib/api/categories'
import { useFetch, invalidateCache } from '@/lib/use-fetch'
import { useDebounce } from '@/lib/use-debounce'

// PERF: lazy load dos modais pesados (cada um puxa ~50KB de UI).
// ssr: false porque modais precisam de window/document e nunca renderizam no SSR.
const NfeImportModal = dynamic(() => import('@/components/inventory/nfe-import-modal').then(m => m.NfeImportModal), {
  ssr: false,
  loading: () => <ModalSkeleton />,
})
const SpreadsheetImportModal = dynamic(() => import('@/components/inventory/spreadsheet-import-modal').then(m => m.SpreadsheetImportModal), {
  ssr: false,
  loading: () => <ModalSkeleton />,
})
const ProductFormModalLazy = dynamic(() => import('@/components/inventory/new-product-modal').then(m => m.ProductFormModal), {
  ssr: false,
  loading: () => <ModalSkeleton />,
})
const InventoryOverview = dynamic(() => import('@/components/inventory/inventory-overview').then(m => m.InventoryOverview), {
  ssr: false,
  loading: () => <OverviewSkeleton />,
})

// Placeholder durante carregamento de modal — evita layout shift
function ModalSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="h-96 w-xl animate-pulse rounded-lg border border-slate-700 bg-slate-950/80" />
    </div>
  )
}
function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-lg bg-slate-900/50" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-900/50" />
        ))}
      </div>
    </div>
  )
}

const PRODUCT_KEY = 'products:list'
const CAT_KEY = 'categories:list:v1'
const STORAGE_EXPANDED = 'inventory:expandedCategories'
const STORAGE_FILTER = 'inventory:activeFilter'
const STORAGE_GROUPED = 'inventory:grouped'

const BALANCES_KEY = 'inventory:balances'

export default function InventoryPage() {
  const productsQ = useFetch(PRODUCT_KEY, (signal) => productsApi.list({}, signal), { ttl: 5000 })
  const catsQ = useFetch(CAT_KEY, (signal) => categoriesApi.list({}, signal), { ttl: 5000 })
  const balancesQ = useFetch(BALANCES_KEY, async (signal) => {
    const res = await fetch('/api/v1/inventory/balances', { credentials: 'include', signal })
    if (!res.ok) return { items: [] }
    return res.json() as Promise<{ items: Array<{ productId: string; quantityBase: number }> }>
  }, { ttl: 5000 })

  const products = useMemo(() => productsQ.data?.items ?? [], [productsQ.data])
  const categories = useMemo(() => catsQ.data?.items ?? [], [catsQ.data])
  const balancesByProduct = useMemo(() => {
    const map = new Map<string, { productId: string; quantityBase: number }>()
    ;(balancesQ.data?.items ?? []).forEach((b) => map.set(b.productId, b))
    return map
  }, [balancesQ.data])

  const [query, setQuery] = useState('')
  // PERF: debounce 200ms no query para evitar filtragem a cada tecla
  // (recategorização + re-render de N itens de cada vez)
  const debouncedQuery = useDebounce(query, 200)
  const [filterIds, setFilterIds] = useState<string[]>([]) // [] = todos
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [grouped, setGrouped] = useState<boolean>(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [nfeOpen, setNfeOpen] = useState(false)
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false)
  const [newProductOpen, setNewProductOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [showOverview, setShowOverview] = useState(true)

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Hidratar localStorage
  useEffect(() => {
    try {
      const exp = JSON.parse(localStorage.getItem(STORAGE_EXPANDED) ?? '{}')
      if (exp && typeof exp === 'object') setExpanded(exp)
      const f = JSON.parse(localStorage.getItem(STORAGE_FILTER) ?? '[]')
      if (Array.isArray(f)) setFilterIds(f)
      const g = localStorage.getItem(STORAGE_GROUPED)
      if (g === 'false') setGrouped(false)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_EXPANDED, JSON.stringify(expanded))
    } catch { /* quota */ }
  }, [expanded])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FILTER, JSON.stringify(filterIds))
    } catch { /* quota */ }
  }, [filterIds])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GROUPED, String(grouped))
    } catch { /* quota */ }
  }, [grouped])

  // Tree de categorias (apenas ativas)
  const tree = useMemo(() => {
    const active = categories.filter((c) => !c.archivedAt)
    return active
  }, [categories])

  // Filtra produtos
  // Usamos debouncedQuery em vez de query para evitar re-filtragem a cada tecla.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = products
    if (filterIds.length > 0) {
      list = list.filter((p) => p.categoryId !== null && filterIds.includes(p.categoryId))
    }
    if (q) {
      const catById = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]))
      list = list.filter((p) => {
        if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) return true
        if (p.categoryId) {
          const catName = catById.get(p.categoryId)
          if (catName && catName.includes(q)) return true
        }
        return false
      })
    }
    return list
  }, [products, categories, debouncedQuery, filterIds])

  // Agrupa por categoria
  const groupedItems = useMemo(() => {
    const groups: Record<string, Product[]> = {}
    const noCategory: Product[] = []
    for (const p of filtered) {
      if (p.categoryId === null) {
        noCategory.push(p)
      } else {
        if (!groups[p.categoryId]) groups[p.categoryId] = []
        groups[p.categoryId].push(p)
      }
    }
    return { groups, noCategory }
  }, [filtered])

  // Faceted counts
  const faceted = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of tree) counts[c.id] = 0
    for (const p of products) {
      if (p.categoryId !== null && counts[p.categoryId] !== undefined) {
        counts[p.categoryId]++
      }
    }
    return counts
  }, [products, tree])

  // Autocomplete de categorias com base na query
  const catSuggestions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return []
    return tree.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5)
  }, [debouncedQuery, tree])

  const toggleExpand = (id: string) => setExpanded((e) => ({ ...e, [id]: !(e[id] ?? true) }))
  const expandAll = () => {
    const all: Record<string, boolean> = {}
    for (const c of tree) all[c.id] = true
    setExpanded(all)
  }
  const collapseAll = () => {
    const none: Record<string, boolean> = {}
    for (const c of tree) none[c.id] = false
    setExpanded(none)
  }

  const toggleFilter = (id: string) => {
    setFilterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }
  const clearFilters = () => setFilterIds([])

  // PERF: useCallback mantém referências estáveis → memo do FlatProductList funciona.
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAllVisible = useCallback(() => {
    setSelected(new Set(filtered.map((p) => p.id)))
  }, [filtered])
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  const handleCloseEdit = useCallback(() => setEditingProduct(null), [])

  const refresh = useCallback(async () => {
    await Promise.all([productsQ.mutate(), catsQ.mutate()])
    invalidateCache(PRODUCT_KEY)
    invalidateCache(CAT_KEY)
  }, [productsQ, catsQ])

  const onNfeSuccess = useCallback((msg: string) => {
    flash('ok', msg)
    void refresh()
  }, [flash, refresh])

  const onSpreadsheetSuccess = useCallback((msg: string) => {
    flash('ok', msg)
    void refresh()
  }, [flash, refresh])

  const onNewProductSuccess = useCallback((msg: string) => {
    flash('ok', msg)
    void refresh()
  }, [flash, refresh])

  const bulkMove = async (targetCategoryId: string | null) => {
    if (selected.size === 0) return
    try {
      await categoriesApi.bulkMove(Array.from(selected), targetCategoryId)
      clearSelection()
      setBulkOpen(false)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao mover produtos')
    }
  }

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories])

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Toggle do overview gráfico */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="label flex items-center gap-2">
            <Sparkles className="size-3 text-accent" /> Módulo
          </span>
          <h1 className="mt-1 serif-h2 text-[32px] text-paper">
            <span className="italic-accent text-gradient-accent">Estoque</span>
          </h1>
        </div>
        <div className="flex gap-1 rounded-full bg-bg-2 p-1 border border-line">
          <button
            onClick={() => setShowOverview(true)}
            className={`px-3.5 h-8 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all duration-200 inline-flex items-center gap-1.5 ${
              showOverview
                ? 'bg-accent text-bg shadow-[0_0_0_1px_hsl(225_100%_68%/0.4),0_0_18px_-2px_hsl(225_100%_68%/0.5)]'
                : 'text-paper-3 hover:text-paper'
            }`}
          >
            <BarChart3 className="size-3" /> Gráfico
          </button>
          <button
            onClick={() => setShowOverview(false)}
            className={`px-3.5 h-8 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all duration-200 inline-flex items-center gap-1.5 ${
              !showOverview
                ? 'bg-accent text-bg shadow-[0_0_0_1px_hsl(225_100%_68%/0.4),0_0_18px_-2px_hsl(225_100%_68%/0.5)]'
                : 'text-paper-3 hover:text-paper'
            }`}
          >
            <List className="size-3" /> Lista
          </button>
        </div>
      </div>

      {showOverview && (
        <InventoryOverview
          onImportSpreadsheet={() => setSpreadsheetOpen(true)}
          onImportNfe={() => setNfeOpen(true)}
          onNewProduct={() => setNewProductOpen(true)}
        />
      )}

      {!showOverview && (
        <div className="flex gap-5">
          {/* Sidebar — tree de categorias */}
          <aside className="w-64 shrink-0">
            <div className="card card-hover p-4 sticky top-4">
              <div className="card-top-line" />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent/12 text-accent ring-1 ring-accent/30">
                    <Boxes className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold text-paper">Categorias</h3>
                </div>
                <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5">
                  <button
                    className="size-5 rounded-sm text-[11px] font-mono font-semibold text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors"
                    onClick={expandAll}
                    title="Expandir tudo"
                  >+</button>
                  <span className="text-paper-3/40">/</span>
                  <button
                    className="size-5 rounded-sm text-[11px] font-mono font-semibold text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors"
                    onClick={collapseAll}
                    title="Colapsar tudo"
                  >−</button>
                </div>
              </div>

              <div className="space-y-0.5">
                <button
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
                    filterIds.length === 0
                      ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                      : 'text-paper-2 hover:bg-bg-3 hover:text-paper'
                  }`}
                  onClick={() => setFilterIds([])}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">Todos</span>
                  <span className="font-mono text-[10px] font-semibold text-paper-3 bg-bg-3 px-1.5 py-0.5 rounded">
                    {products.length}
                  </span>
                </button>

                {tree.map((c) => {
                  const isActive = filterIds.length > 0 && filterIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                          : 'text-paper-2 hover:bg-bg-3 hover:text-paper'
                      }`}
                      onClick={() => toggleFilter(c.id)}
                      title="Clique para filtrar (multi)"
                    >
                      <span
                        className="h-3 w-3 rounded-sm shrink-0 ring-1 ring-line"
                        style={{ background: c.color ?? '#64748b' }}
                      />
                      <span className="flex-1 text-left truncate">{c.name}</span>
                      <span className="font-mono text-[10px] font-semibold text-paper-3 bg-bg-3 px-1.5 py-0.5 rounded">
                        {faceted[c.id] ?? 0}
                      </span>
                    </button>
                  )
                })}

                {tree.length === 0 && (
                  <div className="px-2 py-4 text-center text-[11px] text-paper-3">
                    Nenhuma categoria
                  </div>
                )}
              </div>

              {filterIds.length > 0 && (
                <button
                  className="mt-4 w-full text-xs font-semibold text-accent hover:text-accent-2 underline-ink py-1"
                  onClick={clearFilters}
                >
                  Limpar filtros ({filterIds.length})
                </button>
              )}
            </div>
          </aside>

          {/* Conteúdo principal */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Header */}
            <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-paper-3">
                  <span className="status-dot status-dot-emerald anim-pulse" />
                  <span>{filtered.length} de {products.length} {products.length === 1 ? 'item' : 'itens'}</span>
                  {filterIds.length > 0 && (
                    <>
                      <span className="text-paper-3/40">·</span>
                      <span className="text-accent">{filterIds.length} categoria(s)</span>
                    </>
                  )}
                  {selected.size > 0 && (
                    <>
                      <span className="text-paper-3/40">·</span>
                      <span className="text-gold">{selected.size} selecionado(s)</span>
                    </>
                  )}
                </div>
                <h2 className="mt-1.5 serif-h2 text-[22px] text-paper">
                  {grouped ? 'Itens agrupados' : 'Lista contínua'}
                  <span className="italic-accent text-accent">.</span>
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="h-9 px-3 text-xs font-semibold rounded-md border border-line bg-bg-2 text-paper-2 hover:bg-bg-3 hover:text-paper transition-colors flex items-center gap-1.5"
                  onClick={() => setGrouped((g) => !g)}
                  title={grouped ? 'Desagrupar' : 'Agrupar por categoria'}
                >
                  {grouped ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {grouped ? 'Agrupado' : 'Plano'}
                </button>
                <a
                  href="/app/inventory/movements"
                  className="h-9 px-3 text-xs font-semibold rounded-md border border-line bg-bg-2 text-paper-2 hover:bg-bg-3 hover:text-paper transition-colors inline-flex items-center gap-1.5"
                >
                  Movimentações
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                <a
                  href="/app/inventory/sales-import"
                  className="h-9 px-3 text-xs font-semibold rounded-md border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors inline-flex items-center gap-1.5"
                  title="Importar vendas via planilha (clientes sem PDV)"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Importar vendas</span>
                </a>
                <a
                  href="/app/inventory/exits"
                  className="h-9 px-3 text-xs font-semibold rounded-md border border-amber/30 bg-amber/10 text-amber hover:bg-amber/20 transition-colors inline-flex items-center gap-1.5"
                  title="Registrar saída avulsa (venda sem NF, perda, quebra)"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Saída avulsa</span>
                </a>
                <button
                  type="button"
                  className="h-9 px-3 text-xs font-semibold rounded-md border border-emerald/30 bg-emerald/10 text-emerald hover:bg-emerald/20 transition-colors flex items-center gap-1.5"
                  onClick={() => setSpreadsheetOpen(true)}
                  title="Importar produtos a partir de uma planilha (CSV/TSV exportado do Excel)"
                  data-testid="open-spreadsheet-import"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="hidden sm:inline">Importar planilha</span>
                </button>
                <button
                  type="button"
                  className="h-9 px-3 text-xs font-semibold rounded-md border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1.5"
                  onClick={() => setNfeOpen(true)}
                  title="Importar produtos a partir do XML da NFe ou texto da DANFE"
                >
                  <FileUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Importar NFe</span>
                </button>
                <button
                  type="button"
                  className="btn-primary h-9 px-3 text-xs font-semibold flex items-center gap-1.5"
                  onClick={() => setNewProductOpen(true)}
                  title="Criar 1 produto manualmente"
                >
                  <Plus className="h-4 w-4" />
                  <span>Novo produto</span>
                </button>
              </div>
            </div>

            {/* Busca com autocomplete */}
            <div className="card p-1.5">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-paper-3" />
                <input
                  type="text"
                  placeholder="Buscar por SKU, nome ou categoria…"
                  className="input-base h-11 w-full pl-10 pr-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors"
                    onClick={() => setQuery('')}
                    aria-label="Limpar busca"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Autocomplete de categorias */}
                {catSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full card p-1 max-h-56 overflow-auto shadow-2xl anim-fade-up">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-paper-3 px-3 py-1.5 font-mono font-semibold">
                      Categorias
                    </div>
                    {catSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs hover:bg-bg-3 text-left transition-colors"
                        onClick={() => {
                          setQuery('')
                          setFilterIds((prev) => prev.includes(c.id) ? prev : [...prev, c.id])
                        }}
                      >
                        <span
                          className="h-3 w-3 rounded-sm shrink-0 ring-1 ring-line"
                          style={{ background: c.color ?? '#64748b' }}
                        />
                        <span className="flex-1 text-paper-2 font-medium">{c.name}</span>
                        <span className="font-mono text-[10px] text-paper-3 bg-bg-3 px-1.5 py-0.5 rounded">
                          {faceted[c.id] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Barra de bulk actions */}
            {selected.size > 0 && (
              <div className="card p-3 flex items-center justify-between anim-fade-up ring-1 ring-accent/30 bg-accent/[0.04]">
                <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <span className="flex size-6 items-center justify-center rounded-md bg-accent/20">
                    <CheckSquare className="h-3.5 w-3.5" />
                  </span>
                  {selected.size} {selected.size === 1 ? 'item selecionado' : 'itens selecionados'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost h-8 text-xs px-3"
                    onClick={clearSelection}
                  >
                    Cancelar
                  </button>
                  <div className="relative">
                    <button
                      className="btn-primary h-8 text-xs px-3 flex items-center gap-1.5"
                      onClick={() => setBulkOpen((v) => !v)}
                    >
                      <Move className="h-3.5 w-3.5" /> Mover para…
                    </button>
                    {bulkOpen && (
                      <div className="absolute right-0 top-9 z-30 card p-1 w-64 max-h-72 overflow-auto shadow-2xl anim-fade-up">
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs hover:bg-bg-3 text-left transition-colors"
                          onClick={() => bulkMove(null)}
                        >
                          <Package className="h-3.5 w-3.5 text-paper-3" />
                          <span className="flex-1 text-paper-2 font-medium">Sem categoria</span>
                        </button>
                        <div className="border-t border-line my-1" />
                        {tree.filter((c) => !c.isSystem).map((c) => (
                          <button
                            key={c.id}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs hover:bg-bg-3 text-left transition-colors"
                            onClick={() => bulkMove(c.id)}
                          >
                            <span
                              className="h-3 w-3 rounded-sm shrink-0 ring-1 ring-line"
                              style={{ background: c.color ?? '#64748b' }}
                            />
                            <span className="flex-1 text-paper-2 font-medium truncate">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Listagem */}
            {filtered.length === 0 ? (
              <EmptyInventoryState onCreate={() => setNewProductOpen(true)} onImport={() => setSpreadsheetOpen(true)} />
            ) : grouped ? (
              <div className="space-y-3">
                {Object.entries(groupedItems.groups).map(([catId, items]) => {
                  const cat = catById.get(catId)
                  if (!cat) return null
                  const isOpen = expanded[catId] ?? true
                  return (
                    <CategorySection
                      key={catId}
                      category={cat}
                      items={items}
                      isOpen={isOpen}
                      onToggle={() => toggleExpand(catId)}
                      selected={selected}
                      onToggleSelect={toggleSelect}
                    />
                  )
                })}
                {groupedItems.noCategory.length > 0 && (
                  <CategorySection
                    key="__no_category"
                    category={categories.find((c) => c.isSystem) ?? null}
                    items={groupedItems.noCategory}
                    isOpen={expanded['__no_category'] ?? true}
                    onToggle={() => toggleExpand('__no_category')}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                  />
                )}
              </div>
            ) : (
              <FlatProductList
                items={filtered}
                categories={categories}
                selected={selected}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAllVisible}
                onClearSelection={clearSelection}
                allSelected={selected.size === filtered.length && filtered.length > 0}
                onEditProduct={(p) => setEditingProduct(p)}
              />
            )}
          </div>

          {/* Modais — lazy loaded */}
          <ProductFormModalLazy
            open={newProductOpen}
            onClose={() => setNewProductOpen(false)}
            onSuccess={onNewProductSuccess}
            mode="create"
          />
          <ProductFormModalLazy
            open={editingProduct != null}
            onClose={handleCloseEdit}
            onSuccess={onNewProductSuccess}
            mode="edit"
            initialProduct={editingProduct ?? undefined}
            currentStock={editingProduct ? (balancesByProduct.get(editingProduct.id)?.quantityBase ?? 0) : undefined}
          />
          <NfeImportModal
            open={nfeOpen}
            onClose={() => setNfeOpen(false)}
            onSuccess={onNfeSuccess}
          />
          <SpreadsheetImportModal
            open={spreadsheetOpen}
            onClose={() => setSpreadsheetOpen(false)}
            onSuccess={onSpreadsheetSuccess}
          />

          {/* Toast */}
          {toast && (
            <div
              className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md shadow-2xl text-sm font-semibold anim-fade-up border ${
                toast.kind === 'ok'
                  ? 'bg-emerald/15 border-emerald/40 text-emerald'
                  : 'bg-crimson/15 border-crimson/40 text-crimson'
              }`}
            >
              {toast.msg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   SUB-COMPONENTES
   ============================================================ */

function EmptyInventoryState({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div className="card p-12 text-center anim-fade-up">
      <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-accent/12 ring-1 ring-accent/30 flex items-center justify-center anim-float">
        <Package className="h-7 w-7 text-accent" />
      </div>
      <h3 className="serif-h2 text-[24px] text-paper">
        Estoque <span className="italic-accent text-accent">vazio.</span>
      </h3>
      <p className="mt-2 text-sm text-paper-3 max-w-md mx-auto">
        Importe uma planilha do Excel ou crie produtos manualmente para começar a controlar seu inventário.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onImport}
          className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Importar planilha
        </button>
        <button
          onClick={onCreate}
          className="btn-ghost h-10 px-4 text-sm font-semibold flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Criar manualmente
        </button>
      </div>
    </div>
  )
}

type SectionProps = {
  category: Category | null
  items: Product[]
  isOpen: boolean
  onToggle: () => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
}

function CategorySection({ category, items, isOpen, onToggle, selected, onToggleSelect }: SectionProps) {
  return (
    <article className="card overflow-hidden anim-fade-up">
      <div className="card-top-line" />
      <div className="px-5 py-3 border-b border-line flex items-center gap-3 bg-bg-2/40">
        <button
          className="p-1 rounded-md hover:bg-bg-3 transition-colors"
          onClick={onToggle}
          aria-label={isOpen ? 'Colapsar' : 'Expandir'}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-paper-3" />
          ) : (
            <ChevronRight className="h-4 w-4 text-paper-3" />
          )}
        </button>
        {category ? (
          <>
            <span
              className="flex size-7 items-center justify-center rounded-md text-white text-[10px] font-bold ring-1 ring-line"
              style={{ background: category.color ?? '#64748b' }}
            >
              {category.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-paper truncate">{category.name}</div>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-7 items-center justify-center rounded-md bg-bg-3 ring-1 ring-line">
              <Tag className="h-3.5 w-3.5 text-paper-3" />
            </span>
            <div className="flex-1 text-sm font-semibold text-paper-2">Sem categoria</div>
          </>
        )}
        <span className="font-mono text-[10px] uppercase tracking-wider text-paper-3 bg-bg-3 px-2 py-0.5 rounded ring-1 ring-line">
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </div>
      {isOpen && (
        <div className="divide-y divide-line">
          {items.map((p, i) => (
            <ProductRow
              key={p.id}
              product={p}
              isSelected={selected.has(p.id)}
              onToggle={() => onToggleSelect(p.id)}
              delay={i}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function ProductRow({
  product, isSelected, onToggle, delay = 0,
}: { product: Product; isSelected: boolean; onToggle: () => void; delay?: number }) {
  return (
    <div
      className={`px-5 py-3 flex items-center gap-3 transition-all cursor-pointer anim-fade-up ${
        isSelected ? 'bg-accent/[0.06]' : 'hover:bg-bg-3/50'
      }`}
      style={{ animationDelay: `${delay * 30}ms` }}
      onClick={onToggle}
    >
      <button
        className="p-0.5 shrink-0"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        aria-label={isSelected ? 'Desmarcar' : 'Selecionar'}
      >
        {isSelected ? (
          <span className="flex size-4 items-center justify-center rounded-sm bg-accent text-bg">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : (
          <span className="flex size-4 items-center justify-center rounded-sm border border-line hover:border-accent transition-colors">
            <Square className="h-3 w-3 text-transparent" />
          </span>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold truncate ${isSelected ? 'text-accent' : 'text-paper'}`}>
          {product.name}
        </div>
        <div className="font-mono text-[10px] text-paper-3 mt-0.5 flex items-center gap-2">
          <span>{product.sku}</span>
          {product.baseUnit && (
            <>
              <span className="text-paper-3/40">·</span>
              <span>{product.baseUnit}</span>
            </>
          )}
        </div>
      </div>
      <button
        className="p-1.5 rounded-md text-paper-3 hover:bg-bg-3 hover:text-paper transition-colors"
        onClick={(e) => e.stopPropagation()}
        aria-label="Mais ações"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function FlatProductListInner({
  items, categories, selected, onToggleSelect, onSelectAll, onClearSelection, allSelected, onEditProduct,
}: {
  items: Product[]
  categories: Category[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  allSelected: boolean
  onEditProduct: (p: Product) => void
}) {
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories])
  return (
    <article className="card overflow-hidden anim-fade-up">
      <div className="card-top-line" />
      <div className="px-5 py-3 border-b border-line flex items-center gap-3 bg-bg-2/40">
        <button
          className="p-0.5 shrink-0"
          onClick={allSelected ? onClearSelection : onSelectAll}
          aria-label="Selecionar todos"
        >
          {allSelected ? (
            <span className="flex size-4 items-center justify-center rounded-sm bg-accent text-bg">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          ) : (
            <span className="flex size-4 items-center justify-center rounded-sm border border-line hover:border-accent transition-colors">
              <Square className="h-3 w-3 text-transparent" />
            </span>
          )}
        </button>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-paper-3">
          {allSelected ? 'Desselecionar todos' : 'Selecionar todos visíveis'}
        </span>
        <span className="ml-auto font-mono text-[10px] text-paper-3 bg-bg-3 px-2 py-0.5 rounded ring-1 ring-line">
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </div>
      <div className="divide-y divide-line">
        {items.map((p, i) => {
          const cat = p.categoryId ? catById.get(p.categoryId) : null
          const isSelected = selected.has(p.id)
          return (
            <div
              key={p.id}
              className={`px-5 py-3 flex items-center gap-3 transition-all anim-fade-up group ${
                isSelected ? 'bg-accent/[0.06]' : 'hover:bg-bg-3/50'
              }`}
              style={{ animationDelay: `${i * 25}ms` }}
            >
              <button
                className="p-0.5 shrink-0"
                onClick={() => onToggleSelect(p.id)}
                aria-label={isSelected ? 'Desmarcar' : 'Selecionar'}
              >
                {isSelected ? (
                  <span className="flex size-4 items-center justify-center rounded-sm bg-accent text-bg">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="flex size-4 items-center justify-center rounded-sm border border-line hover:border-accent transition-colors">
                    <Square className="h-3 w-3 text-transparent" />
                  </span>
                )}
              </button>
              <button
                type="button"
                className="flex-1 min-w-0 text-left cursor-pointer"
                onClick={() => onEditProduct(p)}
              >
                <div className={`text-sm font-semibold truncate ${isSelected ? 'text-accent' : 'text-paper'}`}>
                  {p.name}
                </div>
                <div className="font-mono text-[10px] text-paper-3 mt-0.5">
                  {p.sku}
                  {p.baseUnit && <span className="text-paper-3/40"> · {p.baseUnit}</span>}
                </div>
              </button>
              {cat && (
                <span
                  className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1.5 ring-1 ring-line"
                  style={{ background: `${cat.color ?? '#64748b'}20`, color: 'hsl(var(--paper-2))' }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: cat.color ?? '#64748b' }} />
                  {cat.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => onEditProduct(p)}
                className="rounded p-1.5 text-slate-500 opacity-0 transition hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
                title="Editar produto"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </article>
  )
}

// PERF: memo com comparação custom — só re-renderiza se algum desses props mudar.
// Selected como Set precisa virar string para comparação estável.
const FlatProductList = memo(FlatProductListInner, (prev, next) => {
  if (prev.items !== next.items) return false
  if (prev.categories !== next.categories) return false
  if (prev.selected !== next.selected && Array.from(prev.selected).join(',') !== Array.from(next.selected).join(',')) return false
  if (prev.allSelected !== next.allSelected) return false
  return true
})
FlatProductList.displayName = 'FlatProductList'

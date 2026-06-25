'use client'

/**
 * Tela de Saída Avulsa de Estoque (multi-produto).
 *
 * Caso de uso: cliente que NÃO usa PDV e precisa registrar manualmente
 * a saída de um ou mais produtos numa única operação. Suporta 8 motivos:
 *
 *   - venda_sem_nf   → vira movimento SALE (afeta relatórios de venda/CMV)
 *   - consumo_interno → ADJUSTMENT (não conta como venda)
 *   - perda           → ADJUSTMENT
 *   - quebra          → ADJUSTMENT
 *   - bonificacao     → ADJUSTMENT
 *   - vencimento      → ADJUSTMENT
 *   - amostragem      → ADJUSTMENT
 *   - outros          → ADJUSTMENT
 *
 * Cada linha tem: produto, quantidade, preço venda (obrigatório só p/ venda_sem_nf),
 * custo unitário (opcional). Backend agrupa tudo numa transação atômica
 * (POST /inventory/exits/batch) — se qualquer linha tiver saldo insuficiente,
 * nenhuma é gravada.
 */
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search, AlertTriangle, Loader2, CheckCircle2,
  TrendingDown, FileText, ShieldAlert,
  Plus, Trash2, ListChecks, Receipt,
} from 'lucide-react'
import { productsApi, type Product } from '@/lib/api/categories'
import {
  inventoryExitBatch,
  type ExitReason,
  type ExitBatchLine,
  type ExitBatchResult,
} from '@/lib/api/sales-import'
import { useDebouncedCallback } from '@/lib/use-debounce'

const REASONS: Array<{ value: ExitReason; label: string; description: string; requiresPrice: boolean; affectsSales: boolean }> = [
  { value: 'venda_sem_nf', label: 'Venda sem NF', description: 'Venda balcão sem nota fiscal', requiresPrice: true, affectsSales: true },
  { value: 'consumo_interno', label: 'Consumo interno', description: 'Uso do dono/funcionários', requiresPrice: false, affectsSales: false },
  { value: 'perda', label: 'Perda', description: 'Extravio, roubo, vencimento', requiresPrice: false, affectsSales: false },
  { value: 'quebra', label: 'Quebra', description: 'Quebra acidental no manuseio', requiresPrice: false, affectsSales: false },
  { value: 'bonificacao', label: 'Bonificação', description: 'Brinde ao cliente', requiresPrice: false, affectsSales: false },
  { value: 'vencimento', label: 'Vencimento', description: 'Produto venceu na prateleira', requiresPrice: false, affectsSales: false },
  { value: 'amostragem', label: 'Amostragem', description: 'Amostra grátis / degustação', requiresPrice: false, affectsSales: false },
  { value: 'outros', label: 'Outros', description: 'Outros motivos (detalhar em notas)', requiresPrice: false, affectsSales: false },
]

type Line = {
  uid: string
  product: Product | null
  quantity: number
  unitPriceBRL: string
  unitCostBRL: string
}

function emptyLine(): Line {
  return {
    uid: Math.random().toString(36).slice(2, 9),
    product: null,
    quantity: 1,
    unitPriceBRL: '',
    unitCostBRL: '',
  }
}

export default function InventoryExitPage() {
  const router = useRouter()
  const [reason, setReason] = useState<ExitReason>('venda_sem_nf')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExitBatchResult | null>(null)

  // Buscar produto é por linha; cada linha tem seu próprio autocomplete
  const [activeSearchUid, setActiveSearchUid] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  // PERF: ref para AbortController — cancela requisição obsoleta em cada digitação
  const searchAbortRef = useRef<AbortController | null>(null)

  function updateLine(uid: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(uid: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.uid !== uid)))
  }

  async function runSearch(uid: string, q: string) {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    // PERF: AbortController para cancelar requisição obsoleta se usuário digitar mais
    const ac = new AbortController()
    // Cancela qualquer requisição anterior
    if (searchAbortRef.current) searchAbortRef.current.abort()
    searchAbortRef.current = ac
    try {
      const res = await productsApi.list({ query: q.trim() }, ac.signal)
      // Só aplica se a busca ainda for a mesma (descarta resultados obsoletos)
      setSearchResults((prev) => {
        if (q !== searchQuery) return prev
        return res.items.slice(0, 8)
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setSearchResults([])
    } finally {
      if (searchAbortRef.current === ac) searchAbortRef.current = null
      setSearching(false)
    }
  }

  const runSearchDebounced = useDebouncedCallback((uid: string, q: string) => {
    runSearch(uid, q)
  }, 250)

  function pickProduct(uid: string, p: Product) {
    updateLine(uid, { product: p })
    setActiveSearchUid(null)
    setSearchQuery('')
    setSearchResults([])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter((l) => l.product && l.quantity > 0)
    if (validLines.length === 0) { setError('Inclua ao menos um produto com quantidade > 0'); return }
    const reasonDef = REASONS.find((r) => r.value === reason)
    const payload: ExitBatchLine[] = []
    for (const l of validLines) {
      if (!l.product) continue
      let unitPriceCents: number | undefined
      if (reasonDef?.requiresPrice) {
        const cents = Math.round(Number(l.unitPriceBRL.replace(',', '.')) * 100)
        if (!Number.isFinite(cents) || cents <= 0) {
          setError(`Preço de venda obrigatório para "${l.product.name}"`)
          return
        }
        unitPriceCents = cents
      }
      let unitCostCents: number | undefined
      if (l.unitCostBRL.trim()) {
        const cents = Math.round(Number(l.unitCostBRL.replace(',', '.')) * 100)
        if (Number.isFinite(cents) && cents >= 0) unitCostCents = cents
      }
      payload.push({
        productId: l.product.id,
        quantityBase: l.quantity,
        unitPriceCents,
        unitCostCents,
      })
    }
    setLoading(true)
    setError(null)
    inventoryExitBatch({
      reason,
      notes: notes.trim() || undefined,
      lines: payload,
    })
      .then((r) => {
        setResult(r)
        // limpa form
        setLines([emptyLine()])
        setNotes('')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao registrar'))
      .finally(() => setLoading(false))
  }

  const reasonDef = REASONS.find((r) => r.value === reason)

  // Resumo agregado
  const validLines = useMemo(() => lines.filter((l) => l.product && l.quantity > 0), [lines])
  const totalItems = useMemo(() => validLines.reduce((acc, l) => acc + l.quantity, 0), [validLines])
  const totalRevenueCents = useMemo(() => {
    if (!reasonDef?.requiresPrice) return 0
    return validLines.reduce((acc, l) => {
      const cents = l.unitPriceBRL.trim() ? Math.round(Number(l.unitPriceBRL.replace(',', '.')) * 100) : 0
      return acc + cents * l.quantity
    }, 0)
  }, [validLines, reasonDef])
  const totalCostCents = useMemo(() => {
    return validLines.reduce((acc, l) => {
      const cmv = l.product?.averageCostCents ?? 0
      const cents = l.unitCostBRL.trim()
        ? Math.round(Number(l.unitCostBRL.replace(',', '.')) * 100)
        : cmv
      return acc + cents * l.quantity
    }, 0)
  }, [validLines])
  const totalMarginPct = totalRevenueCents > 0 ? ((totalRevenueCents - totalCostCents) / totalRevenueCents) * 100 : 0
  const marginColor = totalMarginPct > 0 ? 'text-emerald-400' : totalMarginPct < 0 ? 'text-rose-400' : 'text-slate-500'

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-12">
      <button onClick={() => router.push('/app/inventory')} className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-500 transition hover:text-accent">
        <ArrowLeft className="h-3 w-3" /> § Voltar para Estoque
      </button>

      <header className="mb-10">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <TrendingDown className="h-3 w-3" /> § Saída · Avulsa sem PDV
        </div>
        <h1 className="serif-h1 text-4xl text-slate-100 md:text-5xl">Registrar saída avulsa</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Para clientes que <strong className="text-slate-300">não usam PDV</strong>, registre manualmente uma ou mais saídas
          de estoque numa única operação. Cada linha vira um movimento atômico (SALE ou ADJUSTMENT) com CMV e preço venda congelados.
        </p>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-200">×</button>
        </div>
      )}

      {result && (
        <div className="relative surface-ink rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="card-top-line" />
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-300">
                {result.count} movimento(s) registrado(s)
                {reasonDef?.affectsSales && result.totalRevenueCents > 0 && (
                  <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-mono text-emerald-200">
                    R$ {(result.totalRevenueCents / 100).toFixed(2)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Tipo <code className="font-mono">{reasonDef?.affectsSales ? 'SALE' : 'ADJUSTMENT'}</code>
                {' · '}{totalItems} unidades baixadas
              </p>
              <button onClick={() => setResult(null)} className="mt-2 text-[10px] font-mono uppercase tracking-wider text-accent hover:text-cobalt">
                Registrar nova saída →
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1) Motivo */}
        <section className="relative surface-ink rounded-lg border border-slate-800 p-6">
          <div className="card-top-line" />
          <h2 className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-400">
            <ShieldAlert className="h-3 w-3" /> § 01 · Motivo
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {REASONS.map((r) => {
              const active = reason === r.value
              return (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`rounded border p-3 text-left transition ${
                    active
                      ? 'border-accent bg-accent/10 text-slate-100'
                      : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">{r.label}</p>
                    {r.affectsSales && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">venda</span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{r.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        {/* 2) Linhas de produtos */}
        <section className="relative surface-ink rounded-lg border border-slate-800 p-6">
          <div className="card-top-line" />
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              <ListChecks className="h-3 w-3" /> § 02 · Produtos ({validLines.length}/{lines.length})
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[10px]"
            >
              <Plus className="h-3 w-3" /> Adicionar linha
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <LineRow
                key={line.uid}
                line={line}
                index={idx}
                requiresPrice={reasonDef?.requiresPrice ?? false}
                searching={searching && activeSearchUid === line.uid}
                isSearching={activeSearchUid === line.uid}
                searchQuery={searchQuery}
                searchResults={searchResults}
                onSearchChange={(q) => {
                  setActiveSearchUid(line.uid)
                  setSearchQuery(q)
                  runSearchDebounced(line.uid, q)
                }}
                onPickProduct={(p) => pickProduct(line.uid, p)}
                onChange={(patch) => updateLine(line.uid, patch)}
                onRemove={() => removeLine(line.uid)}
                canRemove={lines.length > 1}
              />
            ))}
          </div>

          {/* Resumo agregado */}
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Linhas válidas</div>
              <div className="mt-1 font-mono text-xl tabular-nums text-slate-200">{validLines.length}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Unidades totais</div>
              <div className="mt-1 font-mono text-xl tabular-nums text-slate-200">{totalItems}</div>
            </div>
            {reasonDef?.requiresPrice && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Receita total</div>
                <div className="mt-1 font-mono text-xl tabular-nums text-accent">
                  R$ {(totalRevenueCents / 100).toFixed(2)}
                </div>
              </div>
            )}
            <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">CMV total</div>
              <div className="mt-1 font-mono text-xl tabular-nums text-amber-300">
                R$ {(totalCostCents / 100).toFixed(2)}
              </div>
            </div>
            {reasonDef?.requiresPrice && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3 md:col-span-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Margem agregada</div>
                    <div className={`mt-1 font-mono text-xl tabular-nums ${marginColor}`}>
                      {totalMarginPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Lucro bruto</div>
                    <div className={`mt-1 font-mono text-xl tabular-nums ${marginColor}`}>
                      R$ {((totalRevenueCents - totalCostCents) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 3) Observações globais */}
        <section className="relative surface-ink rounded-lg border border-slate-800 p-6">
          <div className="card-top-line" />
          <h2 className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-400">
            <FileText className="h-3 w-3" /> § 03 · Observações globais
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas aplicadas a todas as linhas (ex: NF de referência, turno, operador)"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-accent"
          />
        </section>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push('/app/inventory')} className="btn-ghost px-5 py-2.5 text-xs">
            Cancelar
          </button>
          <button type="submit" disabled={loading || validLines.length === 0} className="btn-primary flex items-center gap-1.5 px-5 py-2.5 text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
            Registrar {validLines.length > 0 ? `${validLines.length} linha${validLines.length > 1 ? 's' : ''}` : 'saída'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Subcomponente: cada linha de produto                                */
/* ------------------------------------------------------------------ */

function LineRow({
  line, index, requiresPrice, isSearching, searching, searchQuery, searchResults,
  onSearchChange, onPickProduct, onChange, onRemove, canRemove,
}: {
  line: Line
  index: number
  requiresPrice: boolean
  isSearching: boolean
  searching: boolean
  searchQuery: string
  searchResults: Product[]
  onSearchChange: (q: string) => void
  onPickProduct: (p: Product) => void
  onChange: (patch: Partial<Line>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const unitCostCents = line.unitCostBRL.trim()
    ? Math.round(Number(line.unitCostBRL.replace(',', '.')) * 100)
    : (line.product?.averageCostCents ?? 0)
  const unitPriceCents = line.unitPriceBRL.trim()
    ? Math.round(Number(line.unitPriceBRL.replace(',', '.')) * 100)
    : 0
  const lineRevenue = unitPriceCents * line.quantity
  const lineMargin = unitPriceCents > 0 ? ((unitPriceCents - unitCostCents) / unitPriceCents) * 100 : 0
  const marginColor = lineMargin > 0 ? 'text-emerald-400' : lineMargin < 0 ? 'text-rose-400' : 'text-slate-500'

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950 font-mono text-[10px] tabular-nums text-slate-400">
          {index + 1}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Linha {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded p-1 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
            title="Remover linha"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-2">
        {/* Produto (5/12) */}
        <div className="col-span-12 md:col-span-5">
          {!line.product ? (
            <div className="relative">
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={isSearching ? searchQuery : ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar SKU ou nome…"
                    className="w-full rounded border border-slate-700 bg-slate-950 pl-8 pr-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-accent"
                  />
                </div>
              </div>
              {isSearching && searchResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onPickProduct(p)}
                        className="flex w-full items-center justify-between border-b border-slate-800/60 px-3 py-2 text-left text-xs hover:bg-slate-800"
                      >
                        <span className="font-mono text-accent">{p.sku}</span>
                        <span className="flex-1 px-2 text-slate-300">{p.name}</span>
                        <span className="text-slate-500">CMV R$ {((p.averageCostCents ?? 0) / 100).toFixed(2)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {isSearching && searching && (
                <p className="absolute z-10 mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Buscando…
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/60 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-100">{line.product.name}</p>
                <p className="font-mono text-[10px] text-slate-500">SKU {line.product.sku}</p>
              </div>
              <button type="button" onClick={() => onChange({ product: null })} className="ml-2 text-[10px] text-slate-500 hover:text-slate-300">
                Trocar
              </button>
            </div>
          )}
        </div>

        {/* Quantidade (2/12) */}
        <div className="col-span-4 md:col-span-2">
          <label className="mb-0.5 block font-mono text-[10px] uppercase tracking-wider text-slate-500">Qtd</label>
          <input
            type="number"
            min={1}
            step={1}
            value={line.quantity}
            onChange={(e) => onChange({ quantity: Math.max(1, Math.round(Number(e.target.value))) })}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-mono tabular-nums text-slate-200 outline-none transition focus:border-accent"
          />
        </div>

        {/* Preço venda (2/12) */}
        <div className="col-span-4 md:col-span-2">
          <label className={`mb-0.5 block font-mono text-[10px] uppercase tracking-wider ${requiresPrice ? 'text-rose-400' : 'text-slate-500'}`}>
            Venda {requiresPrice ? '*' : <span className="text-slate-600">· ?</span>}
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={line.unitPriceBRL}
            onChange={(e) => onChange({ unitPriceBRL: e.target.value })}
            placeholder="0,00"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-mono tabular-nums text-slate-200 outline-none transition focus:border-accent"
          />
        </div>

        {/* Custo unitário (3/12) */}
        <div className="col-span-4 md:col-span-3">
          <label className="mb-0.5 block font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Custo <span className="text-slate-600">opcional</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={line.unitCostBRL}
            onChange={(e) => onChange({ unitCostBRL: e.target.value })}
            placeholder={line.product ? `CMV ${((line.product.averageCostCents ?? 0) / 100).toFixed(2)}` : '0,00'}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-mono tabular-nums text-slate-200 outline-none transition focus:border-accent"
          />
        </div>
      </div>

      {/* Linha de totais da linha */}
      <div className="mt-2 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono text-[10px]">
        <div className="flex gap-3 text-slate-500">
          <span>CMV R$ {(unitCostCents / 100).toFixed(2)}</span>
          {requiresPrice && unitPriceCents > 0 && (
            <>
              <span>·</span>
              <span className={marginColor}>Margem {lineMargin.toFixed(1)}%</span>
            </>
          )}
        </div>
        {requiresPrice && lineRevenue > 0 && (
          <div className="text-accent">
            Linha = {line.quantity} × R$ {(unitPriceCents / 100).toFixed(2)} = R$ {(lineRevenue / 100).toFixed(2)}
          </div>
        )}
      </div>
    </div>
  )
}
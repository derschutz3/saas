'use client'

/**
 * Modal de Produto — usado tanto para criar quanto para editar.
 *
 * Campos:
 *  - sku, nome, unidade, categoria, ativo (obrigatórios)
 *  - quantidade atual (opcional)        → cria/atualiza saldo + movimento ADJUSTMENT
 *  - preço de venda (opcional, R$)      → upsert SaleUnit (4 canais)
 *  - custo unitário (opcional, R$)      → entra no CMV
 *
 * Modo 'create' (default): chama productsApi.create
 * Modo 'edit': chama productsApi.update; "estoque atual" mostra o saldo existente
 *              e gera um movimento ADJUSTMENT com a diferença (delta)
 */
import { useEffect, useState } from 'react'
import { X, Plus, Loader2, Package, Tag, BarChart3, Coins, ShoppingCart } from 'lucide-react'
import { productsApi, categoriesApi, type Category } from '@/lib/api/categories'
import type { Product } from '@/lib/api/categories'

type Mode = 'create' | 'edit'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  /** Quando mode='edit', obrigatório. */
  initialProduct?: Product
  /** Saldo atual do produto (para preencher o campo "quantidade" no edit). */
  currentStock?: number
  mode?: Mode
}

export function ProductFormModal({ open, onClose, onSuccess, initialProduct, currentStock, mode = 'create' }: Props) {
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [baseUnit, setBaseUnit] = useState('un')
  const [categoryId, setCategoryId] = useState<string>('')
  const [active, setActive] = useState(true)
  const [initialStock, setInitialStock] = useState<string>('')
  const [priceBRL, setPriceBRL] = useState<string>('')
  const [costBRL, setCostBRL] = useState<string>('')
  const [stockReason, setStockReason] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialProduct) {
      setSku(initialProduct.sku)
      setName(initialProduct.name)
      setBaseUnit(initialProduct.baseUnit ?? 'un')
      setCategoryId(initialProduct.categoryId ?? '')
      setActive(initialProduct.active ?? true)
      setInitialStock(currentStock != null ? String(currentStock) : '')
      setCostBRL(((initialProduct.averageCostCents ?? 0) / 100).toFixed(2))
      setPriceBRL('') // backend não retorna preço; usuário pode editar se quiser
      setStockReason('')
    } else {
      setSku('')
      setName('')
      setBaseUnit('un')
      setCategoryId('')
      setActive(true)
      setInitialStock('')
      setPriceBRL('')
      setCostBRL('')
      setStockReason('')
    }
    setError(null)
    categoriesApi.list().then((r) => {
      setCategories(r.items.filter((c) => !c.archivedAt))
    }).catch(() => {})
  }, [open, mode, initialProduct, currentStock])

  const submit = async () => {
    if (!sku.trim() || !name.trim()) {
      setError('SKU e nome são obrigatórios')
      return
    }
    const stockNum = Number(initialStock.replace(',', '.'))
    const priceCents = priceBRL.trim() ? Math.round(Number(priceBRL.replace(',', '.')) * 100) : undefined
    const costCents = costBRL.trim() ? Math.round(Number(costBRL.replace(',', '.')) * 100) : undefined
    if (initialStock.trim() && (!Number.isFinite(stockNum) || stockNum < 0)) {
      setError('Quantidade inválida')
      return
    }
    if (priceBRL.trim() && (!Number.isFinite(Number(priceBRL.replace(',', '.'))) || Number(priceBRL.replace(',', '.')) < 0)) {
      setError('Preço de venda inválido')
      return
    }
    if (costBRL.trim() && (!Number.isFinite(Number(costBRL.replace(',', '.'))) || Number(costBRL.replace(',', '.')) < 0)) {
      setError('Custo unitário inválido')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'create') {
        await productsApi.create({
          sku: sku.trim(),
          name: name.trim(),
          baseUnit,
          categoryId: categoryId || undefined,
          active,
          stock: stockNum > 0 ? stockNum : undefined,
          priceCents,
          costCents,
        })
      } else {
        if (!initialProduct) throw new Error('Produto não informado')
        await productsApi.update(initialProduct.id, {
          sku: sku.trim(),
          name: name.trim(),
          baseUnit,
          categoryId: categoryId || null,
          active,
          stock: initialStock.trim() ? Math.round(stockNum) : undefined,
          stockReason: stockReason.trim() || undefined,
          priceCents,
          costCents,
        })
      }
      const details: string[] = []
      if (mode === 'edit' && initialStock.trim() && currentStock != null && stockNum !== currentStock) {
        const delta = Math.round(stockNum) - currentStock
        details.push(`estoque ${delta > 0 ? '+' : ''}${delta}`)
      } else if (mode === 'create' && stockNum > 0) {
        details.push(`estoque ${stockNum}`)
      }
      if (priceCents && priceCents > 0) details.push(`preço R$ ${(priceCents / 100).toFixed(2)}`)
      if (costCents && costCents > 0) details.push(`custo R$ ${(costCents / 100).toFixed(2)}`)
      const detailSuffix = details.length > 0 ? ` (${details.join(', ')})` : ''
      const verb = mode === 'create' ? 'criado' : 'atualizado'
      onSuccess(`Produto "${name}" ${verb}${detailSuffix}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao ${mode === 'create' ? 'criar' : 'atualizar'} produto`)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const isEdit = mode === 'edit'
  const stockChanged = isEdit && initialStock.trim() && currentStock != null && Number(initialStock.replace(',', '.')) !== currentStock

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="card-top-line" />
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
              <Package className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="serif-h1 text-lg text-slate-100">
                {isEdit ? 'Editar produto' : 'Novo produto'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {isEdit ? 'Atualize dados, estoque e preço' : 'Adicionar item ao estoque'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">SKU *</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: BEB-001"
                className="input-base h-10 w-full px-3 mt-1 text-sm font-mono"
                disabled={busy}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Cerveja Pilsen 350ml"
                className="input-base h-10 w-full px-3 mt-1 text-sm"
                disabled={busy}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Unidade</label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className="input-base h-10 w-full px-3 mt-1 text-sm"
                disabled={busy}
              >
                <option value="un">un (unidade)</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="cx">cx (caixa)</option>
                <option value="pct">pct (pacote)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Status</label>
              <button
                type="button"
                onClick={() => setActive(!active)}
                disabled={busy}
                className={`h-10 w-full mt-1 rounded border text-xs font-semibold transition ${
                  active
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                {active ? '✓ Ativo' : '✕ Inativo'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Categoria
            </label>
            <select
              className="input-base h-10 w-full px-3 mt-1 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={busy}
            >
              <option value="">— Selecionar (vai para "Sem categoria") —</option>
              {categories.filter((c) => !c.isSystem).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Estoque + preços */}
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              <BarChart3 className="h-3 w-3" /> § Estoque e preço {isEdit ? '(ajuste)' : '(opcional)'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  {isEdit ? 'Qtd atual' : 'Qtd inicial'}
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  placeholder="0"
                  className="input-base h-10 w-full px-2.5 mt-1 text-sm font-mono tabular-nums"
                  disabled={busy}
                />
                {isEdit && currentStock != null && (
                  <p className="mt-1 text-[10px] text-slate-600">
                    Antes: <span className="font-mono tabular-nums">{currentStock}</span>
                    {stockChanged && (
                      <span className={`ml-1 font-mono tabular-nums ${Number(initialStock.replace(',', '.')) > currentStock ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ({Number(initialStock.replace(',', '.')) > currentStock ? '+' : ''}{Math.round(Number(initialStock.replace(',', '.'))) - currentStock})
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3" /> Venda R$
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={priceBRL}
                  onChange={(e) => setPriceBRL(e.target.value)}
                  placeholder="0,00"
                  className="input-base h-10 w-full px-2.5 mt-1 text-sm font-mono tabular-nums"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Coins className="h-3 w-3" /> Custo R$
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costBRL}
                  onChange={(e) => setCostBRL(e.target.value)}
                  placeholder="0,00"
                  className="input-base h-10 w-full px-2.5 mt-1 text-sm font-mono tabular-nums"
                  disabled={busy}
                />
              </div>
            </div>

            {isEdit && stockChanged && (
              <div className="mt-2">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Motivo do ajuste (opcional)
                </label>
                <input
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  placeholder="Ex: contagem de inventário"
                  className="input-base h-9 w-full px-2.5 mt-1 text-xs"
                  disabled={busy}
                />
              </div>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
              {isEdit
                ? 'Alterar estoque gera um movimento ADJUSTMENT com a diferença. Custo atualiza o CMV médio.'
                : 'Quantidade gera movimento de estoque inicial. Preço/custo alimentam relatórios de CMV e prejuízo.'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-xs" disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isEdit ? <Coins className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {isEdit ? 'Salvar alterações' : 'Criar produto'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Backwards-compatible wrapper usado pela página /app/inventory para criar.
 */
export function NewProductModal(props: { open: boolean; onClose: () => void; onSuccess: (msg: string) => void }) {
  return <ProductFormModal {...props} mode="create" />
}
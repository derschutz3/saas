'use client'

/**
 * Página de gestão de Categorias de estoque.
 *
 * UX:
 * - Header com contadores e botão "Nova categoria" grande
 * - Lista com drag-and-drop reordering
 * - Cada linha: grip + swatch grande + nome + descrição + contagem + ações (Editar/Arquivar/Excluir)
 * - Modal de criar/editar com:
 *     • Preview grande ao vivo
 *     • Nome (input grande)
 *     • Descrição (opcional)
 *     • Seletor de cor: 12 presets + input hex customizado
 * - Modal de exclusão com fallback
 * - Soft delete (arquivar) com restauração
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Archive, ArchiveRestore, Trash2, Tag, GripVertical, AlertTriangle, X, ChevronRight, Package, Check, Hash, FolderOpen,
} from 'lucide-react'
import { categoriesApi, type Category } from '@/lib/api/categories'
import { useFetch, invalidateCache } from '@/lib/use-fetch'

const KEY = 'categories:list:v1'

// 12 cores preset cobrindo o espectro comum de negócios
const PRESET_COLORS = [
  { hex: '#0ea5e9', name: 'Azul' },
  { hex: '#3b82f6', name: 'Azul royal' },
  { hex: '#8b5cf6', name: 'Roxo' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#f43f5e', name: 'Vermelho' },
  { hex: '#ef4444', name: 'Crimson' },
  { hex: '#f59e0b', name: 'Âmbar' },
  { hex: '#eab308', name: 'Amarelo' },
  { hex: '#10b981', name: 'Verde' },
  { hex: '#22c55e', name: 'Lima' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#64748b', name: 'Cinza' },
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/u

type FormState = {
  open: boolean
  category: Category | null
  name: string
  description: string
  color: string | null
  colorCustom: string // hex do input custom (string livre)
}

type DeleteState = {
  open: boolean
  category: Category | null
  fallback: string | null
}

export default function CategoriesPage() {
  const { data, mutate, isLoading, error } = useFetch(KEY, () => categoriesApi.list(), { ttl: 5000 })
  const categories = data?.items ?? []

  const [form, setForm] = useState<FormState>({
    open: false, category: null, name: '', description: '', color: '#0ea5e9', colorCustom: '',
  })
  const [del, setDel] = useState<DeleteState>({ open: false, category: null, fallback: null })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [expandedArchived, setExpandedArchived] = useState(false)

  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Bloquear scroll do body quando modal aberto
  useEffect(() => {
    if (form.open || del.open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
    return undefined
  }, [form.open, del.open])

  // Fechar com ESC
  useEffect(() => {
    if (!form.open && !del.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        if (form.open) setForm((f) => ({ ...f, open: false }))
        if (del.open) setDel({ open: false, category: null, fallback: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [form.open, del.open, busy])

  const refresh = useCallback(async () => {
    await mutate()
    invalidateCache('products:list')
  }, [mutate])

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const openCreate = () => {
    setForm({
      open: true,
      category: null,
      name: '',
      description: '',
      color: '#0ea5e9',
      colorCustom: '',
    })
  }

  const openEdit = (c: Category) => {
    const isPreset = c.color ? PRESET_COLORS.some((p) => p.hex.toLowerCase() === c.color!.toLowerCase()) : false
    setForm({
      open: true,
      category: c,
      name: c.name,
      description: c.description ?? '',
      color: isPreset || !c.color ? c.color : null, // se for custom, vai pro input
      colorCustom: !isPreset && c.color ? c.color : '',
    })
  }

  const submitForm = async () => {
    const name = form.name.trim()
    if (!name) {
      flash('err', 'Nome é obrigatório')
      return
    }
    if (name.length < 2) {
      flash('err', 'Nome deve ter pelo menos 2 caracteres')
      return
    }
    // Resolver cor final: preset > custom hex > null
    const finalColor: string | null = form.color ?? (HEX_RE.test(form.colorCustom) ? form.colorCustom : null)
    if (form.colorCustom && !HEX_RE.test(form.colorCustom)) {
      flash('err', 'Cor customizada inválida. Use formato #RRGGBB (ex: #ff5733)')
      return
    }

    setBusy(true)
    try {
      if (form.category) {
        await categoriesApi.update(form.category.id, {
          name,
          description: form.description.trim() || null,
          color: finalColor,
          icon: form.category.icon ?? null,
        })
        flash('ok', `Categoria "${name}" atualizada`)
      } else {
        await categoriesApi.create({
          name,
          description: form.description.trim() || null,
          color: finalColor,
          icon: null,
        })
        flash('ok', `Categoria "${name}" criada`)
      }
      setForm((f) => ({ ...f, open: false }))
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      flash('err', msg)
    } finally {
      setBusy(false)
    }
  }

  const archive = async (c: Category) => {
    if (c.isSystem) {
      flash('err', 'Categoria do sistema não pode ser arquivada')
      return
    }
    setBusy(true)
    try {
      await categoriesApi.archive(c.id)
      flash('ok', `Categoria "${c.name}" arquivada`)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao arquivar')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (c: Category) => {
    setBusy(true)
    try {
      await categoriesApi.restore(c.id)
      flash('ok', `Categoria "${c.name}" restaurada`)
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao restaurar')
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async () => {
    if (!del.category) return
    setBusy(true)
    try {
      const r = await categoriesApi.delete(del.category.id, del.fallback)
      flash('ok', `Categoria "${del.category.name}" excluída (${r.movedItems} ${r.movedItems === 1 ? 'item movido' : 'itens movidos'})`)
      setDel({ open: false, category: null, fallback: null })
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setBusy(false)
    }
  }

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    setDragOverId(id)
  }
  const onDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const active = categories.filter((c) => !c.archivedAt && !c.isSystem)
    const fromIdx = active.findIndex((c) => c.id === dragId)
    const toIdx = active.findIndex((c) => c.id === targetId)
    if (fromIdx === -1 || toIdx === -1) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const newOrder = [...active]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setDragId(null)
    setDragOverId(null)
    try {
      await categoriesApi.reorder(newOrder.map((c) => c.id))
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao reordenar')
    }
  }

  const active = useMemo(() => categories.filter((c) => !c.archivedAt && !c.isSystem), [categories])
  const archived = useMemo(() => categories.filter((c) => c.archivedAt), [categories])
  const systemCat = useMemo(() => categories.find((c) => c.isSystem), [categories])

  const fallbackOptions = useMemo(
    () => categories.filter((c) => c.id !== del.category?.id && !c.archivedAt),
    [categories, del.category?.id],
  )

  // Preview da cor final
  const previewColor = form.color ?? (HEX_RE.test(form.colorCustom) ? form.colorCustom : null) ?? '#64748b'

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Categorias</h1>
          <p className="text-sm text-slate-500">
            {active.length} {active.length === 1 ? 'categoria ativa' : 'categorias ativas'}
            {archived.length > 0 && ` · ${archived.length} arquivada(s)`}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2 shadow-lg shadow-sky-900/30"
          onClick={openCreate}
          disabled={busy}
        >
          <Plus className="h-5 w-5" />
          <span>Nova categoria</span>
        </button>
      </div>

      {error && (
        <div className="card p-4 text-sm text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Erro ao carregar categorias: {error.message}
        </div>
      )}

      {/* Lista de categorias ativas */}
      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="px-5 py-3 border-b border-slate-800/40 flex items-center gap-3">
          <Tag className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Lista de categorias</span>
          <span className="text-xs text-slate-500 ml-auto">
            {isLoading ? 'carregando…' : `${active.length} ativa(s)`}
          </span>
        </div>

        <div className="divide-y divide-slate-800/40">
          {active.length === 0 && !isLoading && (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhuma categoria cadastrada. Clique em <strong>Nova categoria</strong> para começar.
            </div>
          )}

          {active.map((c) => (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => onDragStart(e, c.id)}
              onDragOver={(e) => onDragOver(e, c.id)}
              onDragEnd={() => { setDragId(null); setDragOverId(null) }}
              onDrop={(e) => onDrop(e, c.id)}
              className={`px-5 py-3 flex items-center gap-3 transition-colors ${
                dragOverId === c.id ? 'bg-sky-900/30' : 'hover:bg-slate-900/40'
              } ${dragId === c.id ? 'opacity-50' : ''}`}
            >
              <GripVertical className="h-5 w-5 text-slate-600 cursor-grab active:cursor-grabbing shrink-0" />
              <span
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
                style={{ background: c.color ?? '#64748b' }}
                title={c.color ?? 'sem cor'}
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">
                  {c.name}
                </div>
                {c.description && (
                  <div className="text-xs text-slate-500 truncate">{c.description}</div>
                )}
              </div>
              <div className="text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-md shrink-0">
                {c.productCount ?? 0} {c.productCount === 1 ? 'item' : 'itens'}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className="h-8 px-2.5 rounded-md text-xs font-semibold text-sky-300 bg-sky-950/40 hover:bg-sky-900/60 hover:text-sky-100 flex items-center gap-1.5"
                  onClick={() => openEdit(c)}
                  disabled={busy}
                  title="Editar nome, descrição e cor"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  className="h-8 px-2.5 rounded-md text-xs font-semibold text-amber-300 bg-amber-950/30 hover:bg-amber-900/50 hover:text-amber-100 flex items-center gap-1.5"
                  onClick={() => archive(c)}
                  disabled={busy}
                  title="Arquivar (soft delete — pode ser restaurada depois)"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>Arquivar</span>
                </button>
                <button
                  type="button"
                  className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 hover:text-rose-100 flex items-center gap-1.5"
                  onClick={() => setDel({ open: true, category: c, fallback: null })}
                  disabled={busy}
                  title="Excluir permanentemente (mover itens para fallback)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Excluir</span>
                </button>
              </div>
            </div>
          ))}

          {systemCat && (
            <div className="px-5 py-3 flex items-center gap-3 bg-slate-900/30">
              <Package className="h-5 w-5 text-slate-600 shrink-0" />
              <span
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 opacity-70"
                style={{ background: systemCat.color ?? '#64748b' }}
              >
                {systemCat.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-300 truncate flex items-center gap-2">
                  {systemCat.name}
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded">
                    sistema
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate">{systemCat.description}</div>
              </div>
              <div className="text-xs text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-md shrink-0">
                {systemCat.productCount ?? 0} {systemCat.productCount === 1 ? 'item' : 'itens'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arquivadas */}
      {archived.length > 0 && (
        <div className="card overflow-hidden">
          <button
            type="button"
            className="w-full px-5 py-3 flex items-center gap-2 text-sm text-slate-400 hover:bg-slate-900/40"
            onClick={() => setExpandedArchived((v) => !v)}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expandedArchived ? 'rotate-90' : ''}`} />
            <span>{archived.length} {archived.length === 1 ? 'categoria arquivada' : 'categorias arquivadas'}</span>
          </button>
          {expandedArchived && (
            <div className="divide-y divide-slate-800/40 border-t border-slate-800/40">
              {archived.map((c) => (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <Archive className="h-4 w-4 text-slate-600" />
                  <span
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm opacity-50"
                    style={{ background: c.color ?? '#64748b' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-400 truncate line-through">{c.name}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost h-8 text-xs px-3 flex items-center gap-1.5"
                    onClick={() => restore(c)}
                    disabled={busy}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== MODAL: CRIAR / EDITAR CATEGORIA ====== */}
      {form.open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !busy && setForm((f) => ({ ...f, open: false }))}
        >
          <div
            className="card max-w-lg w-full p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cat-form-title"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 id="cat-form-title" className="text-lg font-bold text-slate-100">
                  {form.category ? 'Editar categoria' : 'Nova categoria'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {form.category
                    ? `Alterando "${form.category.name}"`
                    : 'Defina um nome e escolha uma cor'}
                </p>
              </div>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
                onClick={() => setForm((f) => ({ ...f, open: false }))}
                disabled={busy}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* PREVIEW GRANDE */}
            <div className="flex items-center gap-3 p-4 bg-slate-900/60 border border-slate-800 rounded-lg">
              <span
                className="h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow shrink-0 transition-colors"
                style={{ background: previewColor }}
              >
                {(form.name.trim().charAt(0) || '?').toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-100 truncate">
                  {form.name.trim() || 'Nome da categoria'}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {form.description.trim() || 'Sem descrição'}
                </div>
                <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                  {previewColor}
                </div>
              </div>
            </div>

            {/* NOME */}
            <div>
              <label htmlFor="cat-name" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Nome *
              </label>
              <input
                id="cat-name"
                type="text"
                className="input-base h-12 w-full px-3 mt-2 text-base font-medium"
                placeholder="Ex: Bebidas, Limpeza, Açougue…"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={busy || (form.category?.isSystem ?? false)}
                maxLength={80}
                autoFocus
              />
              {form.category?.isSystem && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Categoria do sistema — apenas descrição e cor podem ser alterados.
                </p>
              )}
            </div>

            {/* DESCRIÇÃO */}
            <div>
              <label htmlFor="cat-desc" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Descrição (opcional)
              </label>
              <input
                id="cat-desc"
                type="text"
                className="input-base h-11 w-full px-3 mt-2 text-sm"
                placeholder="Ex: Refrigerantes, sucos, água…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                disabled={busy}
                maxLength={300}
              />
            </div>

            {/* COR — PRESETS */}
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Cor
              </label>
              <div className="flex flex-wrap gap-2.5 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    className={`h-9 w-9 rounded-lg transition-all ${
                      form.color === c.hex
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110 shadow-lg'
                        : 'hover:scale-105 hover:ring-1 hover:ring-slate-500'
                    }`}
                    style={{ background: c.hex }}
                    onClick={() => setForm((f) => ({ ...f, color: c.hex, colorCustom: '' }))}
                    title={c.name}
                    aria-label={`Cor ${c.name}`}
                    disabled={busy}
                  >
                    {form.color === c.hex && <Check className="h-4 w-4 text-white mx-auto drop-shadow" />}
                  </button>
                ))}
              </div>
            </div>

            {/* COR — CUSTOM HEX */}
            <div>
              <label htmlFor="cat-color-hex" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" /> Cor personalizada (hex)
              </label>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="h-10 w-10 rounded-lg border border-slate-700 shrink-0"
                  style={{ background: HEX_RE.test(form.colorCustom) ? form.colorCustom : 'transparent' }}
                />
                <input
                  id="cat-color-hex"
                  type="text"
                  className="input-base h-10 flex-1 px-3 text-sm font-mono"
                  placeholder="#RRGGBB  (ex: #ff5733)"
                  value={form.colorCustom}
                  onChange={(e) => {
                    let v = e.target.value.trim()
                    if (v && !v.startsWith('#')) v = '#' + v
                    v = v.slice(0, 7)
                    setForm((f) => ({ ...f, colorCustom: v, color: null }))
                  }}
                  disabled={busy}
                  maxLength={7}
                  pattern="#[0-9a-fA-F]{6}"
                />
                <input
                  type="color"
                  className="h-10 w-10 rounded-lg border border-slate-700 bg-transparent cursor-pointer shrink-0"
                  value={HEX_RE.test(form.colorCustom) ? form.colorCustom : '#0ea5e9'}
                  onChange={(e) => setForm((f) => ({ ...f, colorCustom: e.target.value, color: null }))}
                  disabled={busy}
                  title="Abrir seletor de cor do navegador"
                  aria-label="Seletor de cor visual"
                />
              </div>
              {form.colorCustom && !HEX_RE.test(form.colorCustom) && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Formato inválido. Use 6 dígitos hex (ex: #0ea5e9).
                </p>
              )}
            </div>

            {/* BOTÕES */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
              <button
                type="button"
                className="btn-ghost h-10 text-sm px-4"
                onClick={() => setForm((f) => ({ ...f, open: false }))}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2"
                onClick={submitForm}
                disabled={busy || !form.name.trim() || form.name.trim().length < 2}
              >
                {busy ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Salvando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {form.category ? 'Salvar alterações' : 'Criar categoria'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL: EXCLUIR ====== */}
      {del.open && del.category && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !busy && setDel({ open: false, category: null, fallback: null })}
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
                <h2 className="text-lg font-bold text-slate-100">Excluir categoria</h2>
                <p className="text-sm text-slate-400">
                  <strong>{del.category.name}</strong> será removida permanentemente.
                </p>
              </div>
            </div>

            <div className="bg-amber-900/20 border border-amber-800/50 rounded-md p-3 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Esta ação não pode ser desfeita. Itens vinculados serão movidos para a categoria de fallback abaixo.
            </div>

            <div>
              <label htmlFor="del-fallback" className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> Mover itens para:
              </label>
              <select
                id="del-fallback"
                className="input-base h-11 w-full px-3 mt-2 text-sm"
                value={del.fallback ?? 'system'}
                onChange={(e) =>
                  setDel((d) => ({
                    ...d,
                    fallback: e.target.value === 'system' ? null : e.target.value,
                  }))
                }
                disabled={busy}
              >
                <option value="system">Sem categoria (padrão do sistema)</option>
                {fallbackOptions
                  .filter((c) => !c.isSystem)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost h-10 text-sm px-4"
                onClick={() => setDel({ open: false, category: null, fallback: null })}
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

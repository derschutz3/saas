'use client'

/**
 * Modal de Importação de NFe / NFCe / DANFE em texto.
 *
 * Fluxo em 2 passos:
 *  1) O usuário cola o XML da NFe (ou texto da DANFE) e clica em "Analisar".
 *     O backend parseia e retorna a lista de produtos.
 *  2) O usuário revisa os produtos, atribui categoria manualmente e confirma.
 *     Produtos com SKU já existente são marcados (toggle "Somar ao estoque").
 *
 * Suporta colar XML de NFe completa (4.00) ou texto puro de DANFE (heurístico).
 */
import { useEffect, useState, useMemo } from 'react'
import { X, FileText, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, FileUp } from 'lucide-react'
import { nfeApi, categoriesApi, type NfeParseResult, type Category } from '@/lib/api/categories'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

type ReviewItem = {
  selected: boolean
  sku: string | null
  name: string
  unit: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  existingProductId: string | null
  categoryId: string | null
  addToStockIfExists: boolean
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe35260112345678000199550010000123451000000011" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <serie>1</serie>
        <nNF>12345</nNF>
        <dhEmi>2025-06-15T10:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000190</CNPJ>
        <xNome>DISTRIBUIDORA EXEMPLO LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>SKU-1001</cProd>
          <xProd>REFRIGERANTE COLA 2L</xProd>
          <uCom>UN</uCom>
          <qCom>24.0000</qCom>
          <vUnCom>9.50</vUnCom>
          <vProd>228.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>SKU-1002</cProd>
          <xProd>AGUA MINERAL 500ML</xProd>
          <uCom>UN</uCom>
          <qCom>48.0000</qCom>
          <vUnCom>2.10</vUnCom>
          <vProd>100.80</vProd>
        </prod>
      </det>
      <det nItem="3">
        <prod>
          <cProd>SKU-1003</cProd>
          <xProd>CERVEJA PILSEN 350ML</xProd>
          <uCom>UN</uCom>
          <qCom>36.0000</qCom>
          <vUnCom>3.80</vUnCom>
          <vProd>136.80</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>465.60</vProd>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`

export function NfeImportModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [xml, setXml] = useState('')
  const [busy, setBusy] = useState(false)
  const [parseResult, setParseResult] = useState<NfeParseResult | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [defaultCategory, setDefaultCategory] = useState<string>('')

  // Reset ao abrir/fechar
  useEffect(() => {
    if (open) {
      setStep(1)
      setXml('')
      setBusy(false)
      setParseResult(null)
      setItems([])
      setError(null)
      setDefaultCategory('')
      // Carregar categorias para o select
      categoriesApi.list().then((r) => {
        const active = r.items.filter((c) => !c.archivedAt)
        setCategories(active)
      }).catch(() => {})
    }
  }, [open])

  // Bloquear scroll do body quando aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleParse = async () => {
    if (!xml.trim()) {
      setError('Cole o XML da NFe ou texto da DANFE')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await nfeApi.parse({ xml })
      setParseResult(res)
      setItems(
        res.products.map((p) => ({
          selected: true,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          quantity: p.quantity,
          unitPriceCents: p.unitPriceCents,
          totalCents: p.totalCents,
          existingProductId: p.existingProductId,
          categoryId: defaultCategory || null,
          addToStockIfExists: p.existingProductId !== null,
        })),
      )
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar')
    } finally {
      setBusy(false)
    }
  }

  const handleCommit = async () => {
    const selected = items.filter((i) => i.selected)
    if (selected.length === 0) {
      setError('Selecione ao menos 1 item')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await nfeApi.commit(
        selected.map((i) => ({
          sku: i.sku,
          name: i.name,
          unit: i.unit,
          quantity: i.quantity,
          categoryId: i.categoryId,
          addToStockIfExists: i.addToStockIfExists,
        })),
      )
      onSuccess(
        `Importado: ${r.summary.created} novo(s), ${r.summary.updated} atualizado(s)${r.summary.errors > 0 ? `, ${r.summary.errors} erro(s)` : ''}`,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar')
    } finally {
      setBusy(false)
    }
  }

  const toggleAll = (val: boolean) => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: val })))
  }

  const applyDefaultCategory = (catId: string) => {
    setDefaultCategory(catId)
    setItems((prev) => prev.map((i) => ({ ...i, categoryId: catId || i.categoryId })))
  }

  const totalSelected = useMemo(() => items.filter((i) => i.selected), [items])
  const totalCents = useMemo(
    () => totalSelected.reduce((acc, i) => acc + i.totalCents, 0),
    [totalSelected],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="card max-w-4xl w-full p-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-900/40 flex items-center justify-center">
              <FileUp className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Importar NFe / DANFE</h2>
              <p className="text-xs text-slate-500">
                {step === 1 ? 'Cole o XML ou texto da nota fiscal' : 'Revise e categorize os produtos'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
            onClick={() => !busy && onClose()}
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-5 text-xs">
          <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-sky-300' : 'text-slate-500'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 1 ? 'bg-sky-600' : 'bg-slate-700'}`}>1</span>
            <span>Analisar</span>
          </div>
          <div className="flex-1 h-px bg-slate-800" />
          <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-sky-300' : 'text-slate-500'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 2 ? 'bg-sky-600' : 'bg-slate-700'}`}>2</span>
            <span>Revisar e categorizar</span>
          </div>
        </div>

        {error && (
          <div className="bg-rose-900/30 border border-rose-800/60 rounded p-3 mb-3 text-sm text-rose-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                XML da NFe / NFCe ou texto da DANFE
              </label>
              <button
                type="button"
                className="text-xs text-sky-400 hover:text-sky-200"
                onClick={() => setXml(SAMPLE_XML)}
              >
                Usar exemplo
              </button>
            </div>
            <textarea
              className="input-base w-full flex-1 px-3 py-2 text-xs font-mono min-h-[300px] resize-none"
              placeholder="Cole aqui o XML da nota fiscal (NFe/NFCe) ou o texto da DANFE..."
              value={xml}
              onChange={(e) => setXml(e.target.value)}
              disabled={busy}
            />
            <p className="text-[11px] text-slate-500">
              O agente de IA identifica automaticamente os produtos, quantidades, valores e dados do emitente.
            </p>
          </div>
        )}

        {step === 2 && parseResult && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Header da NFe */}
            <div className="bg-slate-900/50 rounded-md p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
              {parseResult.issuerName && (
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Emitente</div>
                  <div className="text-slate-200 font-medium">{parseResult.issuerName}</div>
                </div>
              )}
              {parseResult.issuerCnpj && (
                <div>
                  <div className="text-[10px] uppercase text-slate-500">CNPJ</div>
                  <div className="text-slate-200 font-mono text-xs">{parseResult.issuerCnpj}</div>
                </div>
              )}
              {parseResult.nfeNumber && (
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Nº NF</div>
                  <div className="text-slate-200">{parseResult.nfeNumber}{parseResult.series ? ` / série ${parseResult.series}` : ''}</div>
                </div>
              )}
              {parseResult.emissionDate && (
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Emissão</div>
                  <div className="text-slate-200 text-xs">{new Date(parseResult.emissionDate).toLocaleString('pt-BR')}</div>
                </div>
              )}
              <div className="ml-auto text-right">
                <div className="text-[10px] uppercase text-slate-500">Total selecionado</div>
                <div className="text-sky-300 font-bold text-base">R$ {(totalCents / 100).toFixed(2)}</div>
              </div>
            </div>

            {/* Default category */}
            <div className="flex items-center gap-2 p-2 bg-slate-900/30 rounded">
              <span className="text-xs text-slate-400">Aplicar categoria a todos:</span>
              <select
                className="input-base h-8 px-2 text-xs flex-1 max-w-xs"
                value={defaultCategory}
                onChange={(e) => applyDefaultCategory(e.target.value)}
              >
                <option value="">— Selecionar —</option>
                {categories.filter((c) => !c.isSystem).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-300"
                onClick={() => toggleAll(items.every((i) => i.selected) ? false : true)}
              >
                {items.every((i) => i.selected) ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-auto border border-slate-800 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 sticky top-0">
                  <tr className="text-[10px] uppercase text-slate-500">
                    <th className="px-2 py-2 text-center w-8">
                      <input
                        type="checkbox"
                        checked={items.every((i) => i.selected)}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-left">Produto</th>
                    <th className="px-2 py-2 text-right w-20">Qtd</th>
                    <th className="px-2 py-2 text-left w-12">Un</th>
                    <th className="px-2 py-2 text-right w-24">Vlr Unit</th>
                    <th className="px-2 py-2 text-right w-24">Total</th>
                    <th className="px-2 py-2 text-left w-44">Categoria</th>
                    <th className="px-2 py-2 text-center w-32">Existente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {items.map((it, idx) => (
                    <tr key={idx} className={!it.selected ? 'opacity-40' : 'hover:bg-slate-900/30'}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={it.selected}
                          onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, selected: e.target.checked } : x))}
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{it.sku ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-100">
                        {it.name}
                        {it.existingProductId && (
                          <span className="ml-2 text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
                            já existe
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-200 font-mono">{it.quantity}</td>
                      <td className="px-2 py-2 text-slate-400 text-xs">{it.unit}</td>
                      <td className="px-2 py-2 text-right text-slate-300 font-mono text-xs">R$ {(it.unitPriceCents / 100).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-slate-200 font-mono text-xs">R$ {(it.totalCents / 100).toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <select
                          className="input-base h-7 px-1.5 text-xs w-full"
                          value={it.categoryId ?? ''}
                          onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, categoryId: e.target.value || null } : x))}
                          disabled={!it.selected}
                        >
                          <option value="">Sem categoria</option>
                          {categories.filter((c) => !c.isSystem).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {it.existingProductId && (
                          <label className="inline-flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={it.addToStockIfExists}
                              onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, addToStockIfExists: e.target.checked } : x))}
                            />
                            <span>somar</span>
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500">
              <span className="text-amber-400">Produtos já existentes</span> serão atualizados (somando ao estoque) caso a opção &quot;somar&quot; esteja marcada.
              <br />
              <span className="text-sky-400">Produtos novos</span> serão criados com a categoria selecionada e o estoque inicial definido pela quantidade da NFe.
            </p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-between items-center gap-2 mt-4 pt-3 border-t border-slate-800/50">
          {step === 1 ? (
            <>
              <span className="text-xs text-slate-500">
                {xml.length.toLocaleString('pt-BR')} caracteres
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost h-10 text-sm px-4"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2"
                  onClick={handleParse}
                  disabled={busy || !xml.trim()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  <span>{busy ? 'Analisando…' : 'Analisar'}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-ghost h-10 text-sm px-4"
                onClick={() => setStep(1)}
                disabled={busy}
              >
                ← Voltar
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {totalSelected.length} selecionado(s) · R$ {(totalCents / 100).toFixed(2)}
                </span>
                <button
                  type="button"
                  className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2"
                  onClick={handleCommit}
                  disabled={busy || totalSelected.length === 0}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>{busy ? 'Importando…' : 'Importar produtos'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

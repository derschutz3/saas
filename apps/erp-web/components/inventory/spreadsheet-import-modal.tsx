'use client'

/**
 * Modal de Importação de Planilha (CSV / TSV) para o Estoque.
 *
 * Fluxo em 2 passos:
 *  1) Usuário faz upload de um arquivo CSV/TSV exportado do Excel.
 *     O sistema parseia client-side (detecta separador, normaliza cabeçalhos)
 *     e mostra uma prévia dos produtos detectados.
 *  2) Usuário escolhe a categoria de destino (pode criar uma nova na hora,
 *     ex: "Bebidas"), seleciona quais produtos quer importar e confirma.
 *
 * Colunas reconhecidas (case-insensitive, normalizadas):
 *   - sku       (opcional)
 *   - nome / name / produto / descrição  (obrigatório)
 *   - unidade / unit / un  (opcional, default: UN)
 *   - preço / price / valor / preco      (opcional, em reais)
 *   - quantidade / qty / estoque / stock (opcional)
 *   - categoria / category               (opcional, apenas informativo)
 */
import { useEffect, useMemo, useState } from 'react'
import {
  X, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Plus, Trash2,
  Upload, FileUp, Tag, ArrowRight, Check,
} from 'lucide-react'
import { categoriesApi, productsApi, type Category } from '@/lib/api/categories'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

type ParsedRow = {
  rowIndex: number
  selected: boolean
  sku: string | null
  name: string
  unit: string
  priceCents: number | null
  quantity: number | null
  rawCategory: string | null
  // preenchidos após cruzar com produtos existentes
  existingProductId: string | null
  isNew: boolean
  // categoria atribuída (vem do destino no passo 2)
  assignedCategoryId: string | null
}

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'código', 'cod', 'code', 'ref', 'referencia', 'referência'],
  name: ['nome', 'name', 'produto', 'product', 'descricao', 'descrição', 'description', 'item'],
  unit: ['unidade', 'unit', 'un', 'u', 'medida'],
  price: ['preco', 'preço', 'price', 'valor', 'value', 'preco_venda', 'preço_venda', 'venda'],
  quantity: ['quantidade', 'qty', 'qtd', 'estoque', 'stock', 'quant', 'quantity'],
  category: ['categoria', 'category', 'cat', 'grupo'],
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detecta o separador (vírgula, ponto-e-vírgula ou tab) olhando a primeira
 * linha não-vazia. Tab é o separador padrão do "Salvar como .tsv" do Excel.
 */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const counts = {
    '\t': (firstLine.match(/\t/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
  }
  // retorna o que aparece mais vezes (com fallback para vírgula)
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0 || entries[0][1] === 0) return ','
  return entries[0][0]
}

/**
 * Parser CSV/TSV que respeita aspas duplas. Suporta campos com vírgula/quebra
 * de linha dentro de aspas. Retorna matriz de strings (sem a primeira linha
 * se ela parecer cabeçalho).
 */
function parseDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === sep) {
      cur.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      cur.push(field)
      field = ''
      if (cur.some((f) => f.trim() !== '')) rows.push(cur)
      cur = []
    } else {
      field += c
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field)
    if (cur.some((f) => f.trim() !== '')) rows.push(cur)
  }
  return rows
}

/** Converte "R$ 1.234,56" / "1,99" / "2.5" → centavos (inteiro). */
function parseBRLPrice(s: string | null | undefined): number | null {
  if (!s) return null
  const cleaned = s.replace(/[R$\s]/gi, '').trim()
  if (!cleaned) return null
  // Se tem vírgula E ponto, ponto é milhar e vírgula é decimal
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',')) {
    // só vírgula: assume decimal brasileiro
    normalized = cleaned.replace(',', '.')
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function parseQty(s: string | null | undefined): number | null {
  if (!s) return null
  const n = Number(s.replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

function findColumnIndex(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key].map(normalize)
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(normalize(headers[i]))) return i
  }
  return -1
}

const SAMPLE_CSV = `sku;nome;unidade;preco;quantidade;categoria
HEI-350;Cerveja Heineken 350ml;UN;4,50;120;Bebidas
HEI-600;Cerveja Heineken 600ml;UN;8,90;80;Bebidas
BRA-350;Cerveja Brahma 350ml;UN;3,20;200;Bebidas
COR-2L;Refrigerante Coca-Cola 2L;UN;9,50;60;Bebidas
AGU-500;Agua Mineral 500ml;UN;2,10;300;Bebidas
SAL-1KG;Sal Refinado 1kg;UN;2,80;150;Temperos
ACO-1KG;Acucar Refinado 1kg;UN;4,20;100;Temperos
FAR-1KG;Farinha de Trigo 1kg;UN;5,50;80;Mercearia
MAC-500;Macarrao Espaguete 500g;UN;3,80;120;Mercearia
OLE-900;Oleo de Soja 900ml;UN;6,90;90;Mercearia
`

const PALETTE = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4']

export function SpreadsheetImportModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [rawText, setRawText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [targetCategoryId, setTargetCategoryId] = useState<string>('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState(PALETTE[0])
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Reset ao abrir/fechar
  useEffect(() => {
    if (open) {
      setStep(1)
      setRawText('')
      setFileName(null)
      setBusy(false)
      setError(null)
      setRows([])
      setTargetCategoryId('')
      setNewCategoryName('')
      setNewCategoryColor(PALETTE[0])
      setCreatingCategory(false)
      // Carrega categorias para o select (incluindo arquivadas para o bulk-move)
      categoriesApi.list({ includeArchived: false })
        .then((r) => setCategories(r.items))
        .catch(() => {})
    }
  }, [open])

  // Bloqueia scroll
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const handleFile = async (file: File) => {
    setError(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      setRawText(text)
    } catch (err) {
      setError('Não foi possível ler o arquivo')
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // permite colar texto direto
    const text = e.clipboardData.getData('text')
    if (text) {
      setRawText(text)
      setFileName('texto colado')
    }
  }

  const handleUseSample = () => {
    setRawText(SAMPLE_CSV)
    setFileName('exemplo.csv')
  }

  const handleAnalyze = async () => {
    if (!rawText.trim()) {
      setError('Anexe um arquivo CSV/TSV ou cole o conteúdo')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const sep = detectSeparator(rawText)
      const grid = parseDelimited(rawText, sep)
      if (grid.length < 2) {
        throw new Error('Arquivo precisa ter cabeçalho + ao menos 1 linha de dados')
      }
      const headers = grid[0]
      const nameIdx = findColumnIndex(headers, 'name')
      if (nameIdx === -1) {
        throw new Error('Coluna "nome" não encontrada. Esperado: nome, name, produto, descrição…')
      }
      const skuIdx = findColumnIndex(headers, 'sku')
      const unitIdx = findColumnIndex(headers, 'unit')
      const priceIdx = findColumnIndex(headers, 'price')
      const qtyIdx = findColumnIndex(headers, 'quantity')
      const catIdx = findColumnIndex(headers, 'category')

      const dataRows = grid.slice(1)
      const parsed: ParsedRow[] = []
      for (let idx = 0; idx < dataRows.length; idx++) {
        const cells = dataRows[idx]
        const name = (cells[nameIdx] ?? '').trim()
        if (!name) continue
        parsed.push({
          rowIndex: idx,
          selected: true,
          sku: skuIdx !== -1 ? (cells[skuIdx] ?? '').trim() || null : null,
          name,
          unit: unitIdx !== -1 ? (cells[unitIdx] ?? '').trim() || 'UN' : 'UN',
          priceCents: priceIdx !== -1 ? parseBRLPrice(cells[priceIdx]) : null,
          quantity: qtyIdx !== -1 ? parseQty(cells[qtyIdx]) : null,
          rawCategory: catIdx !== -1 ? (cells[catIdx] ?? '').trim() || null : null,
          existingProductId: null,
          isNew: true,
          assignedCategoryId: null,
        })
      }

      if (parsed.length === 0) {
        throw new Error('Nenhuma linha válida encontrada (coluna nome vazia)')
      }

      // Cruza com produtos existentes por SKU
      try {
        const existing = await productsApi.list()
        const bySku = new Map<string, string>()
        for (const p of existing.items) {
          if (p.sku) bySku.set(p.sku.toLowerCase(), p.id)
        }
        for (const r of parsed) {
          if (r.sku) {
            const found = bySku.get(r.sku.toLowerCase())
            if (found) {
              r.existingProductId = found
              r.isNew = false
            }
          }
        }
      } catch {
        // best-effort: se falhar o cruzamento, segue com todos como novos
      }

      setRows(parsed)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar planilha')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) {
      setError('Informe o nome da categoria')
      return
    }
    setCreatingCategory(true)
    setError(null)
    try {
      const created = await categoriesApi.create({ name, color: newCategoryColor })
      setCategories((prev) => [...prev, created])
      setTargetCategoryId(created.id)
      setNewCategoryName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar categoria')
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleCommit = async () => {
    const selected = rows.filter((r) => r.selected)
    if (selected.length === 0) {
      setError('Selecione ao menos 1 produto')
      return
    }
    if (!targetCategoryId) {
      setError('Escolha a categoria de destino')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // 1) Cria os produtos que não existem
      const createdIds: string[] = []
      const errorCount = { value: 0 }
      for (const r of selected) {
        if (r.isNew) {
          // normaliza unidade para os valores aceitos pelo schema
          let baseUnit = (r.unit || 'UN').toLowerCase()
          if (!['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct', 'm', 'm2', 'm3'].includes(baseUnit)) {
            baseUnit = 'un'
          }
          try {
            const created = await productsApi.create({
              sku: r.sku ?? `IMP-${Date.now()}-${r.rowIndex}`,
              name: r.name,
              baseUnit,
              categoryId: targetCategoryId,
              active: true,
            })
            createdIds.push(created.id)
          } catch {
            errorCount.value++
          }
        } else if (r.existingProductId) {
          createdIds.push(r.existingProductId)
        }
      }
      // 2) Move tudo para a categoria de destino (garantia)
      if (createdIds.length > 0) {
        await categoriesApi.bulkMove(createdIds, targetCategoryId)
      }
      const catName = categories.find((c) => c.id === targetCategoryId)?.name ?? 'categoria'
      onSuccess(
        `Importado: ${selected.length} produto(s) → ${catName}` +
          (errorCount.value > 0 ? ` (${errorCount.value} falha(s))` : ''),
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar')
    } finally {
      setBusy(false)
    }
  }

  const toggleAll = (val: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: val })))
  }
  const toggleOne = (idx: number, val: boolean) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, selected: val } : r))
  }

  const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows])
  const newCount = useMemo(() => rows.filter((r) => r.selected && r.isNew).length, [rows])
  const existingCount = useMemo(() => rows.filter((r) => r.selected && !r.isNew).length, [rows])
  const totalPriceCents = useMemo(
    () => rows.filter((r) => r.selected).reduce((acc, r) => acc + (r.priceCents ?? 0) * (r.quantity ?? 0), 0),
    [rows],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="card max-w-5xl w-full p-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-900/40 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Importar planilha</h2>
              <p className="text-xs text-slate-500">
                {step === 1 ? 'Anexe um CSV/TSV exportado do Excel' : 'Escolha a categoria e confirme os produtos'}
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
          <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-emerald-300' : 'text-slate-500'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 1 ? 'bg-emerald-600' : 'bg-slate-700'}`}>1</span>
            <span>Upload</span>
          </div>
          <div className="flex-1 h-px bg-slate-800" />
          <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-emerald-300' : 'text-slate-500'}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 2 ? 'bg-emerald-600' : 'bg-slate-700'}`}>2</span>
            <span>Revisar e mover</span>
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
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-emerald-500/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('csv-file-input')?.click()}
              data-testid="csv-dropzone"
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-slate-500" />
              <p className="text-sm text-slate-300 mb-1">
                {fileName ? (
                  <span className="font-semibold text-emerald-300">{fileName}</span>
                ) : (
                  <>Arraste um arquivo <span className="text-emerald-400">.csv</span> ou <span className="text-emerald-400">.tsv</span> aqui</>
                )}
              </p>
              <p className="text-xs text-slate-500">
                ou clique para selecionar · aceita Excel exportado como CSV/TSV
              </p>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
                data-testid="csv-file-input"
              />
            </div>

            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] uppercase tracking-widest text-slate-500">ou cole o conteúdo</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <textarea
              className="input-base w-full px-3 py-2 text-xs font-mono min-h-[140px] resize-none"
              placeholder="Cole aqui o conteúdo CSV/TSV…"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onPaste={handlePaste}
              disabled={busy}
              data-testid="csv-textarea"
            />

            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer hover:text-slate-300">Colunas reconhecidas</summary>
              <div className="mt-2 grid grid-cols-2 gap-1 pl-3 text-[10px]">
                <div><span className="text-emerald-400">nome</span> (obrigatório) — nome do produto</div>
                <div><span className="text-emerald-400">sku</span> (opcional) — código</div>
                <div><span className="text-emerald-400">unidade</span> — UN, KG, L, CX…</div>
                <div><span className="text-emerald-400">preço</span> — em reais (1,99 ou R$ 1,99)</div>
                <div><span className="text-emerald-400">quantidade</span> — estoque inicial</div>
                <div><span className="text-emerald-400">categoria</span> — apenas informativo</div>
              </div>
              <p className="mt-2 pl-3">O separador é detectado automaticamente (vírgula, ponto-e-vírgula ou tab).</p>
            </details>

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-xs text-emerald-400 hover:text-emerald-200 inline-flex items-center gap-1"
                onClick={handleUseSample}
              >
                <FileUp className="h-3 w-3" /> Usar planilha de exemplo (10 produtos)
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {rawText.length.toLocaleString('pt-BR')} caracteres
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Cabeçalho de seleção de categoria */}
            <div className="bg-slate-900/50 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">
                  Mover produtos selecionados para:
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input-base h-9 px-2 text-sm flex-1 min-w-[180px]"
                  value={targetCategoryId}
                  onChange={(e) => setTargetCategoryId(e.target.value)}
                  data-testid="target-category-select"
                >
                  <option value="">— Selecionar categoria —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <span className="text-xs text-slate-500">ou crie agora:</span>

                <input
                  type="text"
                  placeholder="Nome da nova categoria (ex: Bebidas)"
                  className="input-base h-9 px-2 text-sm flex-1 min-w-[180px]"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  data-testid="new-category-name"
                />

                <div className="flex items-center gap-1">
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-6 w-6 rounded-full border-2 transition-all ${
                        newCategoryColor === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ background: color }}
                      onClick={() => setNewCategoryColor(color)}
                      title={color}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="btn-ghost h-9 px-3 text-xs flex items-center gap-1.5"
                  onClick={handleCreateCategory}
                  disabled={creatingCategory || !newCategoryName.trim()}
                  data-testid="create-category-btn"
                >
                  {creatingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Criar
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                {selectedCount} selecionado(s)
              </span>
              <span>·</span>
              <span>{newCount} novo(s)</span>
              <span>·</span>
              <span>{existingCount} já existente(s) (atualizar categoria)</span>
              {totalPriceCents > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-300 font-semibold">
                    Valor total: R$ {(totalPriceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </>
              )}
              <div className="ml-auto">
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-300"
                  onClick={() => toggleAll(rows.every((r) => r.selected) ? false : true)}
                >
                  {rows.every((r) => r.selected) ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
            </div>

            {/* Tabela de produtos */}
            <div className="flex-1 overflow-auto border border-slate-800 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 sticky top-0 z-10">
                  <tr className="text-[10px] uppercase text-slate-500">
                    <th className="px-2 py-2 text-center w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => r.selected)}
                        onChange={(e) => toggleAll(e.target.checked)}
                        data-testid="csv-select-all"
                      />
                    </th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-left">Produto</th>
                    <th className="px-2 py-2 text-left w-12">Un</th>
                    <th className="px-2 py-2 text-right w-20">Qtd</th>
                    <th className="px-2 py-2 text-right w-24">Preço</th>
                    <th className="px-2 py-2 text-left w-32">Categoria</th>
                    <th className="px-2 py-2 text-center w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {rows.map((r, idx) => (
                    <tr key={idx} className={!r.selected ? 'opacity-40' : 'hover:bg-slate-900/30'}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={(e) => toggleOne(idx, e.target.checked)}
                          data-testid={`csv-row-${idx}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{r.sku ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-100">{r.name}</td>
                      <td className="px-2 py-2 text-slate-400 text-xs">{r.unit}</td>
                      <td className="px-2 py-2 text-right text-slate-200 font-mono text-xs">
                        {r.quantity != null ? r.quantity : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-300 font-mono text-xs">
                        {r.priceCents != null ? `R$ ${(r.priceCents / 100).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-400">
                        {r.rawCategory ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-slate-500" />
                            {r.rawCategory}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {r.isNew ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-sky-400 bg-sky-950/40 px-1.5 py-0.5 rounded">
                            <Plus className="h-2.5 w-2.5" /> novo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
                            já existe
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500">
              <span className="text-amber-400">Produtos já existentes</span> (com mesmo SKU) terão a categoria atualizada.
              <br />
              <span className="text-sky-400">Produtos novos</span> serão criados e já adicionados à categoria escolhida.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 mt-4 pt-3 border-t border-slate-800/50">
          {step === 1 ? (
            <>
              <span className="text-xs text-slate-500">
                Suporta .csv (vírgula/ponto-e-vírgula) e .tsv (tab)
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
                  onClick={handleAnalyze}
                  disabled={busy || !rawText.trim()}
                  data-testid="csv-analyze-btn"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
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
                  {selectedCount} produto(s) → {categories.find((c) => c.id === targetCategoryId)?.name ?? '(escolha a categoria)'}
                </span>
                <button
                  type="button"
                  className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2"
                  onClick={handleCommit}
                  disabled={busy || selectedCount === 0 || !targetCategoryId}
                  data-testid="csv-commit-btn"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>
                    {busy
                      ? 'Importando…'
                      : `Mover ${selectedCount} → ${categories.find((c) => c.id === targetCategoryId)?.name ?? 'categoria'}`}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

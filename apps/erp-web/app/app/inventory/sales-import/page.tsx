'use client'

/**
 * Wizard de Importação de Vendas via Planilha (CSV / TSV).
 *
 * Use case principal: clientes que NÃO usam o PDV do ERP mas querem
 * contabilizar vendas e movimentar estoque. O fluxo:
 *
 *  1) Upload de CSV com colunas:  sku, quantidade (ou qtd), preco_venda, data, canal, nf
 *  2) Preview mostra SKUs reconhecidos × faltantes × sem estoque
 *  3) Dry-run via /inventory/sales-import (dryRun=true) confirma que está OK
 *  4) Commit real gera movimentos SALE com unitCostCents (= CMV) e unitRevenueCents (= preço venda)
 *
 * Reconhece aliases PT-BR: sku/codigo, quantidade/qtd, preco/valor, data/emissao, nf/numero, canal/origem.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X,
  ArrowRight, FileUp, Download, Filter, RefreshCw, Package, BarChart3,
} from 'lucide-react'
import { salesImport, type SalesImportRow, type SalesImportPreview, type SalesImportResult } from '@/lib/api/sales-import'

type ParsedRow = {
  rowIndex: number
  sku: string
  quantityBase: number
  unitPriceCents: number
  soldAt: string
  channel: string
  nfNumber: string | null
  errors: string[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'código', 'cod', 'code', 'ref', 'referencia', 'referência'],
  quantity: ['quantidade', 'qty', 'qtd', 'quant', 'quantity'],
  price: ['preco', 'preço', 'price', 'valor', 'value', 'preco_venda', 'preço_venda', 'venda', 'preco_unitario'],
  date: ['data', 'date', 'emissao', 'emissão', 'data_venda', 'dt'],
  channel: ['canal', 'channel', 'origem', 'source'],
  nf: ['nf', 'nfe', 'numero_nf', 'número_nf', 'numero', 'número', 'invoice'],
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

function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const counts = {
    '\t': (firstLine.match(/\t/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0 || entries[0][1] === 0) return ','
  return entries[0][0]
}

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
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === sep) { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else if (c === '\r') { /* ignore */ }
      else field += c
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

function mapHeader(header: string): string | null {
  const h = normalize(header)
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return key
  }
  return null
}

function parsePriceBRL(raw: string): number {
  // aceita "R$ 1.500,00" ou "1500" ou "1500.50"
  const cleaned = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function parseDate(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return new Date().toISOString()
  // tenta dd/mm/yyyy
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (br) {
    const [, d, m, y] = br
    const yr = y.length === 2 ? `20${y}` : y
    const iso = `${yr}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00.000Z`
    return iso
  }
  const d = new Date(trimmed)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  return new Date().toISOString()
}

const SAMPLE_CSV = `sku,quantidade,preco_venda,data,canal,nf
HEINEKEN-350,10,5.50,18/06/2026,balcao,
BRAHMA-350,12,4.80,18/06/2026,balcao,
COCA-2L,5,9.90,18/06/2026,ifood,12345
AGUA-500,20,3.00,18/06/2026,balcao,
`

export default function SalesImportPage() {
  const router = useRouter()
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [preview, setPreview] = useState<SalesImportPreview[]>([])
  const [dryResult, setDryResult] = useState<SalesImportResult | null>(null)
  const [commitResult, setCommitResult] = useState<SalesImportResult | null>(null)
  const [loading, setLoading] = useState<'idle' | 'parsing' | 'dryrun' | 'commit'>('idle')
  const [error, setError] = useState<string | null>(null)

  function handleFile(file: File) {
    setLoading('parsing')
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const sep = detectSeparator(text)
        const grid = parseDelimited(text, sep)
        if (grid.length < 2) {
          setError('Arquivo vazio ou só com cabeçalho')
          setLoading('idle')
          return
        }
        const header = grid[0]
        const idx: Record<string, number> = {}
        header.forEach((h, i) => {
          const key = mapHeader(h)
          if (key) idx[key] = i
        })
        if (idx.sku === undefined || idx.quantity === undefined) {
          setError('Cabeçalho precisa ter pelo menos "sku" e "quantidade"')
          setLoading('idle')
          return
        }
        const rows: ParsedRow[] = []
        for (let i = 1; i < grid.length; i++) {
          const cols = grid[i]
          if (!cols || cols.length === 0) continue
          const sku = (cols[idx.sku] ?? '').trim()
          if (!sku) continue
          const qty = Number(String(cols[idx.quantity] ?? '').replace(',', '.'))
          const priceRaw = idx.price !== undefined ? cols[idx.price] ?? '' : '0'
          const dateRaw = idx.date !== undefined ? cols[idx.date] ?? '' : ''
          const channelRaw = idx.channel !== undefined ? cols[idx.channel] ?? '' : 'planilha'
          const nfRaw = idx.nf !== undefined ? cols[idx.nf] ?? '' : ''
          const errors: string[] = []
          if (!Number.isFinite(qty) || qty <= 0) errors.push('quantidade inválida')
          const priceCents = parsePriceBRL(priceRaw)
          if (priceCents <= 0) errors.push('preço ausente ou zero')
          rows.push({
            rowIndex: i,
            sku,
            quantityBase: Math.round(qty),
            unitPriceCents: priceCents,
            soldAt: parseDate(dateRaw),
            channel: channelRaw.trim() || 'planilha',
            nfNumber: nfRaw.trim() || null,
            errors,
          })
        }
        setParsedRows(rows)
        setStep('preview')
        setLoading('idle')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao parsear arquivo')
        setLoading('idle')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleDryRun() {
    setLoading('dryrun')
    setError(null)
    salesImport(parsedRows.map((r) => ({
      sku: r.sku,
      quantityBase: r.quantityBase,
      unitPriceCents: r.unitPriceCents,
      soldAt: r.soldAt,
      channel: r.channel,
      nfNumber: r.nfNumber,
    })), true)
      .then((res) => {
        setDryResult(res)
        setPreview(res.preview)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao validar'))
      .finally(() => setLoading('idle'))
  }

  function handleCommit() {
    if (!confirm(`Confirma importação de ${parsedRows.length} venda(s)? Esta ação baixa estoque e fica registrada como SALE.`)) return
    setLoading('commit')
    setError(null)
    salesImport(parsedRows.map((r) => ({
      sku: r.sku,
      quantityBase: r.quantityBase,
      unitPriceCents: r.unitPriceCents,
      soldAt: r.soldAt,
      channel: r.channel,
      nfNumber: r.nfNumber,
    })), false)
      .then((res) => {
        setCommitResult(res)
        setStep('done')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao importar'))
      .finally(() => setLoading('idle'))
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-vendas.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const validRows = useMemo(() => parsedRows.filter((r) => r.errors.length === 0), [parsedRows])
  const errorRows = useMemo(() => parsedRows.filter((r) => r.errors.length > 0), [parsedRows])
  const totalRevenue = useMemo(() => validRows.reduce((acc, r) => acc + r.unitPriceCents * r.quantityBase, 0), [validRows])

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-12">
      {/* Masthead */}
      <button onClick={() => router.push('/app/inventory')} className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-500 transition hover:text-accent">
        <ArrowLeft className="h-3 w-3" /> § Voltar para Estoque
      </button>

      <header className="mb-10">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <FileSpreadsheet className="h-3 w-3" /> § Import · Vendas sem PDV
        </div>
        <h1 className="serif-h1 text-4xl text-slate-100 md:text-5xl">Importar vendas via planilha</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Para clientes que <strong className="text-slate-300">não usam PDV</strong>, registre as vendas por aqui.
          O sistema converte cada linha em um movimento de saída (SALE) com custo médio (CMV) e preço de venda congelados,
          alimentando os relatórios de faturamento, CMV e prejuízo.
        </p>
      </header>

      {/* Steps indicator */}
      <ol className="mb-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
        {(['upload', 'preview', 'done'] as const).map((s, i) => {
          const labels = { upload: '01 · Upload', preview: '02 · Validar', done: '03 · Concluído' }
          const active = step === s
          const done = (s === 'upload' && step !== 'upload') || (s === 'preview' && step === 'done')
          return (
            <li key={s} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${active ? 'border-accent bg-accent/10 text-accent' : done ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-500'}`}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              <span className={active ? 'text-accent' : done ? 'text-emerald-400' : 'text-slate-500'}>{labels[s]}</span>
              {i < 2 && <span className="text-slate-700">→</span>}
            </li>
          )
        })}
      </ol>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-200"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <section className="relative surface-ink rounded-lg border border-slate-800 p-8">
          <div className="card-top-line" />
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/50 p-12 text-center transition hover:border-accent hover:bg-accent/5"
            onDragOver={(e) => { e.preventDefault() }}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
          >
            <FileUp className="h-10 w-10 text-slate-500" />
            <div>
              <p className="text-sm font-semibold text-slate-200">Arraste um arquivo CSV aqui</p>
              <p className="mt-1 text-xs text-slate-500">ou clique para selecionar · aceita .csv, .tsv, .txt</p>
            </div>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="block w-full max-w-xs cursor-pointer rounded border border-slate-700 bg-slate-900 text-xs text-slate-300 file:mr-3 file:cursor-pointer file:border-0 file:bg-accent file:px-4 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-wider file:text-slate-950 hover:file:bg-cobalt"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 text-xs text-slate-400 md:grid-cols-2">
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">§ Colunas reconhecidas</p>
              <ul className="space-y-1 font-mono">
                <li><span className="text-accent">sku</span> · codigo, code, ref</li>
                <li><span className="text-accent">quantidade</span> · qtd, qty, quant</li>
                <li><span className="text-accent">preco_venda</span> · preco, valor, venda, R$</li>
                <li><span className="text-accent">data</span> · emissao, dt (dd/mm/yyyy)</li>
                <li><span className="text-accent">canal</span> · channel, origem</li>
                <li><span className="text-accent">nf</span> · nfe, numero, invoice</li>
              </ul>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">§ Não tem PDV?</p>
              <p className="leading-relaxed">
                Sem problemas. Esse caminho <strong className="text-slate-200">substitui o PDV</strong> para registrar vendas.
                Cada linha vira um movimento SALE com CMV congelado — o que alimenta os relatórios de prejuízo,
                mais vendidos e giro de estoque.
              </p>
              <button onClick={downloadSample} className="mt-3 inline-flex items-center gap-1.5 text-accent hover:text-cobalt">
                <Download className="h-3 w-3" /> Baixar modelo CSV
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 2 — Preview */}
      {step === 'preview' && (
        <section className="space-y-6">
          <div className="card-top-line surface-ink rounded-lg border border-slate-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-400">§ Prévia · {parsedRows.length} linha(s)</h2>
              <div className="flex gap-2">
                <button onClick={() => setStep('upload')} className="btn-ghost px-3 py-1.5 text-[10px]">
                  ← Trocar arquivo
                </button>
                <button onClick={handleDryRun} disabled={loading !== 'idle'} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
                  {loading === 'dryrun' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Re-validar
                </button>
                <button onClick={handleCommit} disabled={loading !== 'idle' || validRows.length === 0} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
                  {loading === 'commit' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  Confirmar ({validRows.length})
                </button>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Linhas</div>
                <div className="mt-1 font-mono text-xl tabular-nums text-slate-200">{parsedRows.length}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Válidas</div>
                <div className="mt-1 font-mono text-xl tabular-nums text-emerald-400">{validRows.length}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Com erro</div>
                <div className="mt-1 font-mono text-xl tabular-nums text-rose-400">{errorRows.length}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Receita total</div>
                <div className="mt-1 font-mono text-xl tabular-nums text-accent">R$ {(totalRevenue / 100).toFixed(2)}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Canal</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Preço venda</th>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">NF</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => {
                    const p = preview[i]
                    const status = r.errors.length > 0 ? 'erro' : p?.status === 'ok' ? 'ok' : p?.status === 'missing_sku' ? 'sku?' : 'estoque?'
                    return (
                      <tr key={r.rowIndex} className={`border-t border-slate-800/60 ${status === 'ok' ? 'bg-emerald-500/[0.03]' : status === 'erro' ? 'bg-rose-500/[0.03]' : 'bg-amber-500/[0.03]'}`}>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-200">{r.sku}</td>
                        <td className="px-3 py-2 text-slate-400">{r.channel}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">{r.quantityBase}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-accent">R$ {(r.unitPriceCents / 100).toFixed(2)}</td>
                        <td className="px-3 py-2 text-slate-500">{new Date(r.soldAt).toLocaleDateString('pt-BR')}</td>
                        <td className="px-3 py-2 text-slate-500">{r.nfNumber ?? '—'}</td>
                        <td className="px-3 py-2">
                          {status === 'ok' && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> ok</span>}
                          {status === 'sku?' && <span className="inline-flex items-center gap-1 text-amber-400"><AlertCircle className="h-3 w-3" /> SKU não existe</span>}
                          {status === 'estoque?' && <span className="inline-flex items-center gap-1 text-amber-400"><AlertCircle className="h-3 w-3" /> Sem estoque (disponível: {p?.available ?? 0})</span>}
                          {status === 'erro' && <span className="inline-flex items-center gap-1 text-rose-400"><AlertCircle className="h-3 w-3" /> {r.errors[0]}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* STEP 3 — Done */}
      {step === 'done' && commitResult && (
        <section className="relative surface-ink rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
          <div className="card-top-line" />
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
          <h2 className="serif-h1 text-2xl text-slate-100">Importação concluída</h2>
          <p className="mt-2 text-sm text-slate-400">
            <strong className="text-emerald-300">{commitResult.created}</strong> movimento(s) SALE criados · batch <code className="font-mono text-xs">{commitResult.batchId}</code>
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => router.push('/app/inventory')} className="btn-ghost px-4 py-2 text-xs">
              <Package className="mr-1.5 inline h-3 w-3" /> Ver Estoque
            </button>
            <button onClick={() => router.push('/app/reports')} className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs">
              <BarChart3 className="h-3 w-3" /> Ir para Relatórios
            </button>
            <button onClick={() => { setStep('upload'); setParsedRows([]); setCommitResult(null); setPreview([]); }} className="btn-ghost px-4 py-2 text-xs">
              Importar mais
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
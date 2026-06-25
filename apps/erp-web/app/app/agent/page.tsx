'use client'

import { useCallback, useState } from 'react'
import { useFetch } from '@/lib/use-fetch'

type StockLevel = 'OK' | 'HIGH' | 'OVERSTOCK' | 'LOW'

type ProductAnalysis = {
  productId: string
  productName: string
  branchId: string
  purchasedBase: number
  soldBase: number
  onHandBase: number
  coveragePct: number
  level: StockLevel
  insight: string
}

type InsightsResponse = {
  items: ProductAnalysis[]
  meta: { lookbackDays: number; coverageThreshold: number; branchId: string; generatedAt: string }
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const r = await fetch(input, { ...init, credentials: 'include' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

const levelCopy: Record<StockLevel, { label: string; tone: string; chip: string }> = {
  OVERSTOCK: {
    label: 'Excesso de estoque',
    tone: 'text-rose-300',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
  HIGH: {
    label: 'Cobertura alta',
    tone: 'text-amber-300',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  OK: {
    label: 'Saudável',
    tone: 'text-emerald-300',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  LOW: {
    label: 'Estoque baixo',
    tone: 'text-sky-300',
    chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
}

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n)
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

export default function AgentInsightsPage() {
  const [branchId, setBranchId] = useState('br_default')
  const [threshold, setThreshold] = useState(0.6)
  const [lookback, setLookback] = useState(30)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)

  const key = `/api/v1/agent/insights?branchId=${branchId}&limit=50&lookbackDays=${lookback}&coverageThreshold=${threshold}`
  const { data, error, isLoading, mutate } = useFetch<InsightsResponse>(key, () =>
    fetchJson<InsightsResponse>(key),
  )

  const seedDemo = useCallback(async () => {
    setSeeding(true)
    setSeedResult(null)
    try {
      const r = await fetch('/api/v1/dev/seed-agent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, customerPhone: '11999887766' }),
      })
      if (!r.ok) {
        const text = await r.text()
        throw new Error(`HTTP ${r.status} — ${text.slice(0, 200)}`)
      }
      const out = await r.json()
      setSeedResult(`Cenário do Bar do Zé criado. Cerveja A: ${out.products.cervejaA.id}`)
      await mutate()
    } catch (e) {
      setSeedResult(`Falha: ${(e as Error).message}`)
    } finally {
      setSeeding(false)
    }
  }, [branchId, mutate])

  const items = data?.items ?? []
  const totals = {
    overstock: items.filter((i) => i.level === 'OVERSTOCK').length,
    high: items.filter((i) => i.level === 'HIGH').length,
    healthy: items.filter((i) => i.level === 'OK').length,
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-base font-bold text-slate-100">Agente de IA — Estoque Inteligente</div>
          <div className="text-xs text-slate-500 mt-1">
            Detecta produtos comprados, vendidos e parados no estoque. Alerta quando um cliente quer
            recomprar algo que ainda tem cobertura alta do mês anterior.
          </div>
        </div>
        <button
          onClick={seedDemo}
          disabled={seeding}
          className="btn-ghost h-9 text-xs px-3 disabled:opacity-50"
        >
          {seeding ? 'Criando…' : 'Popular dados demo (Bar do Zé)'}
        </button>
      </div>

      {seedResult && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2.5 text-xs text-slate-300">
          {seedResult}
        </div>
      )}

      {/* Filtros */}
      <div className="card p-4">
        <div className="card-top-line" />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Loja</span>
            <input
              className="input-base h-9 px-3 text-xs"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Janela (dias)
            </span>
            <input
              type="number"
              min={1}
              max={180}
              className="input-base h-9 px-3 text-xs"
              value={lookback}
              onChange={(e) => setLookback(parseInt(e.target.value, 10) || 30)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Limite de cobertura ({Math.round(threshold * 100)}%)
            </span>
            <input
              type="range"
              min={0.2}
              max={1.0}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
            />
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Excesso" value={totals.overstock} tone="rose" />
        <KpiCard label="Cobertura alta" value={totals.high} tone="amber" />
        <KpiCard label="Saudáveis" value={totals.healthy} tone="emerald" />
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-200">Produtos analisados</div>
          {data && (
            <div className="text-[10px] text-slate-600">
              atualizado {new Date(data.meta.generatedAt).toLocaleTimeString('pt-BR')}
            </div>
          )}
        </div>
        {isLoading && <div className="px-4 pb-4 text-xs text-slate-500">carregando…</div>}
        {error && (
          <div className="px-4 pb-4 text-xs text-rose-400">
            erro: {error.message}
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/40">
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 px-4 pb-2">
                Produto
              </th>
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">
                Comprado
              </th>
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">
                Vendido
              </th>
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">
                Em estoque
              </th>
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">
                Cobertura
              </th>
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 px-4 pb-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                  Nenhum produto. Clique em <b>Popular dados demo</b> para criar o cenário do Bar do Zé.
                </td>
              </tr>
            )}
            {items.map((it) => {
              const c = levelCopy[it.level]
              return (
                <tr key={it.productId} className="border-b border-slate-800/20 last:border-0 hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-slate-200">{it.productName}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">{it.insight}</div>
                  </td>
                  <td className="text-right text-xs font-semibold text-slate-300 tabular-nums px-2">
                    {fmt(it.purchasedBase)}
                  </td>
                  <td className="text-right text-xs font-semibold text-slate-300 tabular-nums px-2">
                    {fmt(it.soldBase)}
                  </td>
                  <td className="text-right text-xs font-bold tabular-nums px-2">
                    <span className={c.tone}>{fmt(it.onHandBase)}</span>
                  </td>
                  <td className="text-right text-xs font-bold tabular-nums px-2 text-slate-300">
                    {pct(it.coveragePct)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c.chip}`}>
                      {c.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'amber' | 'emerald' }) {
  const toneClass = {
    rose: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  }[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

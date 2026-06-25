'use client'

import { useState } from 'react'
import { useFetch } from '@/lib/use-fetch'

type RecurringItem = {
  productId: string
  productName: string
  lastOrderAt: string
  lastQuantityBase: number
  totalOrdersLast30d: number
  totalQuantityBaseLast30d: number
}

type RecurringResponse = {
  items: RecurringItem[]
  customerPhone: string
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const r = await fetch(input, { ...init, credentials: 'include' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n)
}

function phoneFmt(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

export default function AgentCustomerPage({ params }: { params: { phone: string } }) {
  const phone = decodeURIComponent(params.phone)
  const [branchId, setBranchId] = useState('br_default')
  const key = `/api/v1/agent/customers/${encodeURIComponent(phone)}/recurring?branchId=${branchId}`
  const { data, isLoading, error } = useFetch<RecurringResponse>(key, () => fetchJson<RecurringResponse>(key))

  const items = data?.items ?? []
  const totalQtd = items.reduce((s, it) => s + it.totalQuantityBaseLast30d, 0)
  const totalOrders = items.reduce((s, it) => s + it.totalOrdersLast30d, 0)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-base font-bold text-slate-100">Cliente — {phoneFmt(phone)}</div>
        <div className="text-xs text-slate-500 mt-1">
          Produtos que esse cliente costuma comprar. O agente usa esse histórico para alertar
          quando uma nova compra coincidir com alta cobertura de estoque.
        </div>
      </div>

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
          <KpiSmall label="Produtos" value={items.length} />
          <KpiSmall label="Pedidos (30d)" value={totalOrders} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="p-4 text-sm font-bold text-slate-200">Recorrências</div>
        {isLoading && <div className="px-4 pb-4 text-xs text-slate-500">carregando…</div>}
        {error && <div className="px-4 pb-4 text-xs text-rose-400">erro: {error.message}</div>}
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/40">
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 px-4 pb-2">Produto</th>
              <th className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">Pedidos 30d</th>
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">Qtd última compra</th>
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 px-2 pb-2">Qtd total 30d</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 px-4 pb-2">Última compra</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                  Nenhuma compra recorrente encontrada nos últimos 30 dias.
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.productId} className="border-b border-slate-800/20 last:border-0 hover:bg-slate-800/20">
                <td className="px-4 py-3 text-xs font-semibold text-slate-200">{it.productName}</td>
                <td className="text-center text-xs font-bold text-slate-300 tabular-nums px-2">{fmt(it.totalOrdersLast30d)}</td>
                <td className="text-right text-xs font-bold text-slate-300 tabular-nums px-2">{fmt(it.lastQuantityBase)}</td>
                <td className="text-right text-xs font-bold text-slate-300 tabular-nums px-2">{fmt(it.totalQuantityBaseLast30d)}</td>
                <td className="px-4 py-3 text-[11px] text-slate-500">{new Date(it.lastOrderAt).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalQtd > 0 && (
          <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-800/40">
            Total comprado pelo cliente nos últimos 30 dias: <b className="text-slate-300">{fmt(totalQtd)} un</b>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiSmall({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
      <div className="text-xl font-extrabold text-slate-200 tabular-nums mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

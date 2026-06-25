'use client'

import { Plus, Edit2, Trash2, Tag, Truck, Layers, Hash } from 'lucide-react'

type MasterTable = {
  id: string
  name: string
  desc: string
  count: number
  icon: typeof Tag
}

const TABLES: MasterTable[] = [
  { id: 'categories', name: 'Categorias de produto', desc: 'Categorias usadas em todos os tenants', count: 48, icon: Tag },
  { id: 'units', name: 'Unidades de medida', desc: 'kg, un, cx, lt, m, m²…', count: 22, icon: Hash },
  { id: 'carriers', name: 'Transportadoras', desc: 'Operadoras logísticas disponíveis', count: 14, icon: Truck },
  { id: 'taxes', name: 'Tributações (NCM/CFOP)', desc: 'Códigos fiscais padrão', count: 312, icon: Layers },
  { id: 'payment-methods', name: 'Meios de pagamento', desc: 'Pix, cartão, boleto, etc.', count: 16, icon: Tag },
  { id: 'business-types', name: 'Tipos de negócio', desc: '11 segmentos suportados', count: 11, icon: Layers },
]

export default function MasterDataPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Dados mestre</h1>
          <p className="text-sm text-white/50 mt-1">Tabelas globais compartilhadas entre todos os tenants</p>
        </div>
        <button className="btn-primary h-9 gap-2 px-4 text-xs">
          <Plus className="size-3.5" />
          Novo registro
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Tabelas" value={TABLES.length.toString()} />
        <KpiTile label="Registros totais" value={TABLES.reduce((s, t) => s + t.count, 0).toString()} />
        <KpiTile label="Última atualização" value="hoje" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TABLES.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.id} className="panel-solid p-4 flex items-center gap-4 group hover:border-blue-500/30 transition-colors">
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-100 truncate">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
                <div className="text-[10px] text-slate-600 font-mono mt-1">{t.count} registros</div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="btn-icon size-7" title="Editar">
                  <Edit2 className="size-3.5" />
                </button>
                <button className="btn-icon size-7" title="Excluir">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-solid p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums">{value}</div>
    </div>
  )
}

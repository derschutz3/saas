'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table/data-table'

export type InventoryRow = {
  id: string
  sku: string
  name: string
  baseUnit: string
  quantityBase: number
}

const fmtQty = new Intl.NumberFormat('pt-BR')

const columns: ColumnDef<InventoryRow, unknown>[] = [
  {
    id: 'sku',
    accessorKey: 'sku',
    header: () => <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">SKU</span>,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-semibold text-accent">{getValue() as string}</span>
    ),
    size: 120,
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: () => <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Produto</span>,
    cell: ({ getValue }) => (
      <span className="text-xs font-semibold text-slate-200">{getValue() as string}</span>
    ),
    size: 260,
  },
  {
    id: 'baseUnit',
    accessorKey: 'baseUnit',
    header: () => <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Un</span>,
    cell: ({ getValue }) => (
      <span className="text-xs text-slate-500">{getValue() as string}</span>
    ),
    size: 80,
  },
  {
    id: 'quantityBase',
    accessorKey: 'quantityBase',
    header: () => <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 text-right">Saldo</span>,
    cell: ({ getValue }) => {
      const v = getValue() as number
      return (
        <span
          className="text-xs font-bold tabular-nums"
          style={{ fontVariantNumeric: 'tabular-nums', color: v < 100 ? 'hsl(0 86% 65%)' : 'hsl(142 71% 45%)' }}
        >
          {fmtQty.format(v)}
        </span>
      )
    },
    meta: { align: 'right' },
    size: 100,
  },
  {
    id: 'actions',
    header: () => null,
    cell: () => (
      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="btn-ghost h-6 text-[10px] px-2">Edit</button>
        <button className="btn-ghost h-6 text-[10px] px-2 text-red-400 hover:text-red-300">Del</button>
      </div>
    ),
    enableSorting: false,
    size: 120,
  },
]

export function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      density="default"
    />
  )
}

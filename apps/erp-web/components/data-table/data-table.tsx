'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type ColumnPinningState,
  type Table as TableType,
  useReactTable,
} from '@tanstack/react-table'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type DataTableRowAction<TData> = {
  key: string
  label: string
  onSelect: (row: TData) => void
  variant?: 'outline' | 'destructive'
}

export type DataTableProps<TData> = {
  data: TData[]
  columns: Array<ColumnDef<TData, unknown>>
  getRowId?: (row: TData, index: number) => string
  rowActions?: Array<DataTableRowAction<TData>>
  stickyHeader?: boolean
  maxBodyHeight?: number | string
  density?: 'compact' | 'default'
}

export function DataTable<TData>(props: DataTableProps<TData>) {
  const columnPinning = React.useMemo<ColumnPinningState>(() => ({ right: props.rowActions?.length ? ['__actions'] : [] }), [
    props.rowActions?.length,
  ])

  const columns = React.useMemo<Array<ColumnDef<TData, unknown>>>(() => {
    if (!props.rowActions?.length) return props.columns
    return [
      ...props.columns,
      {
        id: '__actions',
        header: '',
        cell: () => null,
        size: 1,
      },
    ]
  }, [props.columns, props.rowActions?.length])

  const table = useReactTable({
    data: props.data,
    columns,
    getRowId: props.getRowId,
    getCoreRowModel: getCoreRowModel(),
    state: { columnPinning },
    enableColumnPinning: true,
  })

  const dense = props.density === 'compact'

  return (
    <div className="panel-solid flex min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <DataTableHeader table={table} sticky={props.stickyHeader ?? true} dense={dense} />
          <tbody>
            {table.getRowModel().rows.map((row, idx) => {
              const zebra = idx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className={cn(
                    'group outline-none',
                    zebra,
                    'hover:bg-slate-900/45 focus-within:bg-slate-900/45',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isActions = cell.column.id === '__actions'
                    const pinned = cell.column.getIsPinned()
                    const pinnedCls =
                      pinned === 'right'
                        ? 'sticky right-0 z-[1] bg-inherit'
                        : pinned === 'left'
                          ? 'sticky left-0 z-[1] bg-inherit'
                          : ''

                    if (isActions && props.rowActions?.length) {
                      return (
                        <td key={cell.id} className={cn('p-0', pinnedCls)}>
                          <div
                            className={cn(
                              'flex h-full items-center justify-end gap-2 px-3',
                              dense ? 'py-1.5' : 'py-2.5',
                              'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                            )}
                          >
                            {props.rowActions.map((a) => (
                              <Button
                                key={a.key}
                                variant={a.variant ?? 'outline'}
                                size="sm"
                                onClick={() => a.onSelect(row.original)}
                                className="h-8 rounded-lg"
                              >
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'border-b border-slate-800 px-4 align-middle',
                          dense ? 'py-2' : 'py-3',
                          pinnedCls,
                        )}
                      >
                        <div
                          className={cn(
                            'min-w-0 truncate',
                            cell.column.columnDef.meta?.align === 'right' ? 'text-right tabular-nums' : '',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DataTableHeader<TData>(props: { table: TableType<TData>; sticky: boolean; dense: boolean }) {
  return (
    <thead className={cn(props.sticky ? 'sticky top-0 z-[2]' : '', 'bg-slate-950')}>
      {props.table.getHeaderGroups().map((hg) => (
        <tr key={hg.id}>
          {hg.headers.map((header) => {
            const pinned = header.column.getIsPinned()
            const pinnedCls =
              pinned === 'right'
                ? 'sticky right-0 z-[3] bg-slate-950'
                : pinned === 'left'
                  ? 'sticky left-0 z-[3] bg-slate-950'
                  : ''
            return (
              <th
                key={header.id}
                className={cn(
                  'border-b border-slate-800 px-4 text-left text-xs font-semibold tracking-wide text-slate-400',
                  props.dense ? 'py-2' : 'py-3',
                  pinnedCls,
                )}
              >
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            )
          })}
        </tr>
      ))}
    </thead>
  )
}

import { apiFetch } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

type Product = { id: string; sku: string; name: string; baseUnit: string }

export default function AdminMasterData() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    apiFetch<{ items: Product[] }>('/api/v1/products')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-app-text">Cadastros</div>
          <div className="text-xs text-app-muted">Produtos (demo)</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="ui-btn ui-btn-ghost text-app-muted hover:text-app-text"
        >
          <RefreshCw className="size-4" />
          Atualizar
        </button>
      </div>

      <div className="ui-panel p-4">
        <div className="text-sm font-semibold text-app-text">Novo produto</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SKU (ex.: SKOL-350)"
            className="ui-input"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Skol Lata 350ml)"
            className="ui-input md:col-span-2"
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</div>
        ) : null}
        <button
          type="button"
          disabled={busy || sku.trim().length < 2 || name.trim().length < 2}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await apiFetch('/api/v1/products', {
                method: 'POST',
                body: JSON.stringify({ sku: sku.trim(), name: name.trim(), baseUnit: 'un' }),
              })
              setSku('')
              setName('')
              load()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Falha ao criar produto')
            } finally {
              setBusy(false)
            }
          }}
          className={cn(
            'ui-btn ui-btn-primary mt-3',
            busy || sku.trim().length < 2 || name.trim().length < 2 ? 'opacity-50' : '',
          )}
        >
          <Plus className="size-4" />
          {busy ? 'Criando…' : 'Criar'}
        </button>
      </div>

      {loading ? <div className="text-sm text-app-muted">Carregando…</div> : null}
      {!loading ? (
        <div className="ui-panel">
          <div className="grid grid-cols-[140px_1fr_80px] gap-3 px-4 py-3 text-xs font-semibold text-app-muted">
            <div>SKU</div>
            <div>Produto</div>
            <div>Un</div>
          </div>
          <div className="divide-y divide-app-border">
            {items.map((p) => (
              <div key={p.id} className="grid grid-cols-[140px_1fr_80px] items-center gap-3 px-4 py-3">
                <div className="font-mono text-xs text-app-muted/85">{p.sku}</div>
                <div className="truncate text-sm text-app-text">{p.name}</div>
                <div className="text-xs text-app-muted/85">{p.baseUnit}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

import { apiFetch } from '@/lib/apiClient'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import Pill from '@/components/ui/Pill'
import { Minus, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Channel = 'BALCAO' | 'WHATSAPP' | 'CATALOGO' | 'DELIVERY'

type SaleUnit = {
  unitCode: string
  label: string
  factorToBase: number
  prices: Record<Channel, number>
}

type Product = { id: string; sku: string; name: string; baseUnit: string; saleUnits: SaleUnit[] }

type Line = {
  product: Product
  unitCode: string
  quantity: number
  quantityBase: number
  unitPriceCents: number
}

type Customer = { id: string; name: string; phone: string; address: string | null }

export default function OrderNew() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [channel, setChannel] = useState<Channel>('WHATSAPP')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const q = query.trim()
    setLoadingProducts(true)
    apiFetch<{ items: Product[] }>(`/api/v1/products${q ? `?query=${encodeURIComponent(q)}` : ''}`)
      .then((r) => {
        if (cancelled) return
        setProducts(r.items.slice(0, 12))
      })
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false))
    return () => {
      cancelled = true
    }
  }, [query])

  const subtotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0),
    [lines],
  )

  const canSubmit = lines.length > 0 && !submitting

  const getSaleUnit = (product: Product, unitCode: string) => {
    return product.saleUnits.find((u) => u.unitCode === unitCode) ?? null
  }

  const addProduct = (p: Product) => {
    setLines((prev) => {
      const defaultUnit = p.saleUnits.find((u) => u.unitCode === p.baseUnit) ?? p.saleUnits[0] ?? null
      if (!defaultUnit) return prev

      const existing = prev.find((l) => l.product.id === p.id && l.unitCode === defaultUnit.unitCode)
      if (existing) {
        return prev.map((l) =>
          l.product.id === p.id && l.unitCode === defaultUnit.unitCode
            ? {
                ...l,
                quantity: l.quantity + 1,
                quantityBase: Math.round((l.quantity + 1) * defaultUnit.factorToBase),
              }
            : l,
        )
      }
      const price = defaultUnit.prices[channel] ?? 0
      return [
        {
          product: p,
          unitCode: defaultUnit.unitCode,
          quantity: 1,
          quantityBase: Math.round(defaultUnit.factorToBase),
          unitPriceCents: price > 0 ? price : 600,
        },
        ...prev,
      ]
    })
  }

  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => {
        const u = getSaleUnit(l.product, l.unitCode)
        if (!u) return l
        const nextPrice = u.prices[channel] ?? l.unitPriceCents
        return {
          ...l,
          unitPriceCents: nextPrice > 0 ? nextPrice : l.unitPriceCents,
        }
      }),
    )
  }, [channel])

  useEffect(() => {
    let cancelled = false
    const q = customerPhone.trim() || customerName.trim()
    if (q.length < 3) {
      setCustomerSuggestions([])
      return
    }
    setLoadingCustomers(true)
    apiFetch<{ items: Customer[] }>(`/api/v1/customers?query=${encodeURIComponent(q)}`)
      .then((r) => {
        if (cancelled) return
        setCustomerSuggestions(r.items.slice(0, 6))
      })
      .catch(() => setCustomerSuggestions([]))
      .finally(() => setLoadingCustomers(false))
    return () => {
      cancelled = true
    }
  }, [customerPhone, customerName])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-app-text">Pedido rápido</div>
          <div className="text-xs text-app-muted">Crie pedidos em poucos cliques com busca de produtos</div>
        </div>
        <div className="flex items-center gap-2">
          <Pill label={channel} tone="neutral" />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="ui-select w-auto"
          >
            <option value="WHATSAPP">WhatsApp</option>
            <option value="BALCAO">Balcão</option>
            <option value="DELIVERY">Delivery</option>
            <option value="CATALOGO">Catálogo</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="ui-panel p-4">
            <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-s2 px-3 py-2 focus-within:ring-2 focus-within:ring-app-primary/25">
              <Search className="size-4 text-app-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto por nome ou SKU…"
                className="w-full bg-transparent text-sm text-app-text outline-none placeholder:text-app-muted/60"
              />
              {loadingProducts ? <div className="text-xs text-app-muted">…</div> : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {products.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="rounded-xl border border-app-border bg-app-s1 p-3 text-left transition hover:bg-app-s2"
                >
                  <div className="truncate text-sm font-semibold text-app-text">{p.name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-app-muted">
                    <span className="font-mono text-app-muted/85">{p.sku}</span>
                    <span className="uppercase">{p.baseUnit}</span>
                  </div>
                </button>
              ))}
              {products.length === 0 ? (
                <div className="col-span-full rounded-xl border border-app-border bg-app-s1 px-3 py-4 text-sm text-app-muted">
                  Nenhum produto encontrado
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-panel p-4">
            <div className="text-sm font-semibold text-app-text">Cliente</div>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente (opcional)"
                className="ui-input"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Telefone (opcional)"
                className="ui-input"
              />
              {channel === 'DELIVERY' ? (
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Endereço de entrega (opcional)"
                  className="ui-input"
                />
              ) : null}

              {loadingCustomers ? <div className="text-xs text-app-muted">Buscando clientes…</div> : null}
              {customerSuggestions.length > 0 ? (
                <div className="rounded-xl border border-app-border bg-app-s1 p-2">
                  <div className="px-2 pb-2 text-[11px] font-semibold text-app-muted">Sugestões</div>
                  <div className="space-y-1">
                    {customerSuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomerName(c.name)
                          setCustomerPhone(c.phone)
                          setDeliveryAddress(c.address ?? '')
                          setCustomerSuggestions([])
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs text-app-text transition hover:bg-app-s2"
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="ml-3 font-mono text-app-muted">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="ui-panel p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-app-text">Itens</div>
              <div className="text-xs text-app-muted">{lines.length} itens</div>
            </div>

            <div className="mt-3 space-y-2">
              {lines.length === 0 ? (
                <div className="rounded-xl border border-app-border bg-app-s1 px-3 py-4 text-sm text-app-muted">
                  Adicione produtos à esquerda
                </div>
              ) : null}

              {lines.map((l) => (
                <div key={`${l.product.id}:${l.unitCode}`} className="rounded-xl border border-app-border bg-app-s1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-app-text">{l.product.name}</div>
                      <div className="mt-1 text-xs text-app-muted">
                        <span className="font-mono">{l.product.sku}</span> · {l.product.baseUnit}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                      className="rounded-lg border border-app-border bg-app-s2 px-2 py-1 text-xs text-app-muted transition hover:bg-[#232B3B] hover:text-app-text"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-app-border bg-app-s2 p-2">
                      <div className="text-[11px] text-app-muted">Quantidade</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.product.id === l.product.id
                                  ? {
                                      ...x,
                                      quantity: Math.max(1, x.quantity - 1),
                                      quantityBase: Math.round(
                                        Math.max(1, x.quantity - 1) * (getSaleUnit(x.product, x.unitCode)?.factorToBase ?? 1),
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="grid size-8 place-items-center rounded-lg border border-app-border bg-app-s1 text-app-muted transition hover:bg-[#232B3B] hover:text-app-text"
                        >
                          <Minus className="size-4" />
                        </button>
                        <div className="text-lg font-semibold text-app-text">{l.quantity}</div>
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.product.id === l.product.id
                                  ? {
                                      ...x,
                                      quantity: x.quantity + 1,
                                      quantityBase: Math.round(
                                        (x.quantity + 1) * (getSaleUnit(x.product, x.unitCode)?.factorToBase ?? 1),
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="grid size-8 place-items-center rounded-lg border border-app-border bg-app-s1 text-app-muted transition hover:bg-[#232B3B] hover:text-app-text"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-app-muted">
                        <span>Unidade</span>
                        <select
                          value={l.unitCode}
                          onChange={(e) => {
                            const nextUnitCode = e.target.value
                            setLines((prev) =>
                              prev.map((x) => {
                                if (x.product.id !== l.product.id) return x
                                const u = getSaleUnit(x.product, nextUnitCode)
                                if (!u) return x
                                return {
                                  ...x,
                                  unitCode: nextUnitCode,
                                  unitPriceCents: u.prices[channel] > 0 ? u.prices[channel] : x.unitPriceCents,
                                  quantityBase: Math.round(x.quantity * u.factorToBase),
                                }
                              }),
                            )
                          }}
                          className="rounded-lg border border-app-border bg-app-s1 px-2 py-1 text-xs text-app-text outline-none focus:ring-2 focus:ring-app-primary/25"
                        >
                          {(l.product.saleUnits ?? []).map((u) => (
                            <option key={u.unitCode} value={u.unitCode}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-2 text-[11px] text-app-muted/80">
                        Base: {l.quantityBase} {l.product.baseUnit}
                      </div>
                    </div>

                    <div className="rounded-xl border border-app-border bg-app-s2 p-2">
                      <div className="text-[11px] text-app-muted">Preço unitário</div>
                      <input
                        value={(l.unitPriceCents / 100).toFixed(2).replace('.', ',')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(',', '.')
                          const n = Number(raw)
                          if (!Number.isFinite(n)) return
                          setLines((prev) =>
                            prev.map((x) => (x.product.id === l.product.id ? { ...x, unitPriceCents: Math.max(0, Math.round(n * 100)) } : x)),
                          )
                        }}
                        className="mt-1 w-full rounded-lg border border-app-border bg-app-s1 px-2 py-1 text-sm text-app-text outline-none focus:ring-2 focus:ring-app-primary/25"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-app-muted">
                    <span>Total</span>
                    <span className="font-semibold text-app-text">{formatMoney(l.quantity * l.unitPriceCents)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-app-border bg-app-s2 p-3">
              <div className="flex items-center justify-between text-sm text-app-muted">
                <span>Subtotal</span>
                <span className="font-semibold text-app-text">{formatMoney(subtotalCents)}</span>
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={async () => {
                if (!canSubmit) return
                setSubmitting(true)
                setError(null)
                try {
                  await apiFetch('/api/v1/orders', {
                    method: 'POST',
                    body: JSON.stringify({
                      channel,
                      customerName: customerName.trim() || null,
                      customerPhone: customerPhone.trim() || null,
                      deliveryAddress: deliveryAddress.trim() || null,
                      items: lines.map((l) => ({
                        productId: l.product.id,
                        unitCode: l.unitCode,
                        quantity: l.quantity,
                        unitPriceCents: l.unitPriceCents,
                      })),
                    }),
                  })
                  navigate('/app/orders/queue')
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Falha ao criar pedido')
                } finally {
                  setSubmitting(false)
                }
              }}
              className={cn(
                'ui-btn ui-btn-primary mt-4 w-full',
                !canSubmit ? 'opacity-50' : '',
              )}
            >
              {submitting ? 'Criando…' : 'Confirmar pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * Novo Pedido (PDV).
 *
 * Fluxo:
 * 1. Selecionar canal de venda
 * 2. (Opcional) Informar cliente (nome + telefone)
 * 3. Buscar produtos e adicionar ao carrinho
 * 4. (Opcional) Informar endereço de entrega e observações
 * 5. Revisar resumo e criar pedido
 *
 * Após criar, redireciona para a fila (/app/orders/queue).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  User,
  MapPin,
  Phone,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Package,
  Hash,
} from 'lucide-react'
import { useFetch } from '@/lib/use-fetch'
import {
  productsApi,
  centsToBRL,
  priceForUnit,
  unitLabel,
  defaultUnit,
  type Product,
} from '@/lib/api/products'
import {
  ordersApi,
  type CreateOrderInput,
  type OrderChannel,
  type OrderItemInput,
} from '@/lib/api/orders'

const CHANNEL_OPTIONS: { key: OrderChannel; label: string }[] = [
  { key: 'balcao', label: 'Balcão' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'site', label: 'Site' },
  { key: 'ifood', label: 'iFood' },
  { key: 'rappi', label: 'Rappi' },
  { key: '99eats', label: '99 Eats' },
]

type CartItem = {
  productId: string
  productName: string
  sku: string
  unitCode: string
  unitLabel: string
  quantity: number
  unitPriceCents: number
}

const DEBOUNCE_MS = 300

export default function NewOrderPage() {
  const router = useRouter()

  // ===== FORM STATE =====
  const [channel, setChannel] = useState<OrderChannel>('balcao')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [deliveryFeeReais, setDeliveryFeeReais] = useState('')

  // ===== CART =====
  const [cart, setCart] = useState<CartItem[]>([])

  // ===== PRODUCT SEARCH =====
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce da busca
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // ===== PRODUCTS FETCH =====
  const productsKey = `new-order:products:${debouncedSearch}`
  const { data: productsData, isLoading: isLoadingProducts } = useFetch<{ items: Product[] }>(
    productsKey,
    (signal) => productsApi.list({ query: debouncedSearch || undefined }, signal),
    { ttl: 30_000 },
  )

  const products = useMemo(() => productsData?.items ?? [], [productsData])

  // ===== CART HELPERS =====

  const addToCart = useCallback(
    (product: Product) => {
      const unit = defaultUnit(product)
      const suggestedPrice = priceForUnit(unit, channel)
      setCart((prev) => {
        // Se já existe o mesmo produto+unidade, soma
        const existing = prev.find(
          (c) => c.productId === product.id && c.unitCode === unit.unitCode,
        )
        if (existing) {
          return prev.map((c) =>
            c.productId === product.id && c.unitCode === unit.unitCode
              ? { ...c, quantity: c.quantity + 1 }
              : c,
          )
        }
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unitCode: unit.unitCode,
            unitLabel: unitLabel(unit),
            quantity: 1,
            unitPriceCents: suggestedPrice,
          },
        ]
      })
    },
    [channel],
  )

  const updateQuantity = (productId: string, unitCode: string, qty: number) => {
    if (qty < 1) {
      removeFromCart(productId, unitCode)
      return
    }
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId && c.unitCode === unitCode ? { ...c, quantity: qty } : c,
      ),
    )
  }

  const updatePrice = (productId: string, unitCode: string, priceCents: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId && c.unitCode === unitCode
          ? { ...c, unitPriceCents: Math.max(0, priceCents) }
          : c,
      ),
    )
  }

  const removeFromCart = (productId: string, unitCode: string) => {
    setCart((prev) => prev.filter((c) => !(c.productId === productId && c.unitCode === unitCode)))
  }

  // ===== TOTAIS =====

  const subtotalCents = useMemo(
    () => cart.reduce((s, c) => s + c.unitPriceCents * c.quantity, 0),
    [cart],
  )
  const deliveryFeeCents = useMemo(() => {
    const n = parseFloat(deliveryFeeReais.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
  }, [deliveryFeeReais])
  const totalCents = subtotalCents + deliveryFeeCents

  // ===== SUBMIT =====

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const canSubmit =
    !submitting &&
    cart.length > 0 &&
    cart.every((c) => c.quantity > 0 && c.unitPriceCents > 0)

  const invalidItems = cart.filter((c) => c.quantity < 1 || c.unitPriceCents <= 0)
  const hasInvalidItems = invalidItems.length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const items: OrderItemInput[] = cart.map((c) => ({
        productId: c.productId,
        unitCode: c.unitCode,
        quantity: c.quantity,
        unitPriceCents: c.unitPriceCents,
      }))
      const input: CreateOrderInput = {
        channel,
        items,
      }
      if (customerName.trim()) input.customerName = customerName.trim()
      if (customerPhone.trim()) input.customerPhone = customerPhone.trim()
      if (deliveryAddress.trim()) input.deliveryAddress = deliveryAddress.trim()
      if (notes.trim()) input.notes = notes.trim()
      if (deliveryFeeCents > 0) input.deliveryFeeCents = deliveryFeeCents

      const res = await ordersApi.create(input)
      const created = res.order
      setSubmitSuccess(true)
      // Pequeno delay para mostrar o toast
      setTimeout(() => {
        router.push(`/app/orders/queue?new=${created.id}`)
      }, 800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao criar pedido'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ===== VALIDAÇÕES (declaradas acima, próximo ao canSubmit) =====

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => router.push('/app/orders/queue')}
            className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white mb-1 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Voltar para fila
          </button>
          <h1 className="text-xl font-semibold text-white">Novo Pedido</h1>
          <p className="text-sm text-white/50 mt-1">
            Selecione o canal, adicione produtos e finalize o pedido
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* COLUNA ESQUERDA — busca + carrinho */}
        <div className="flex flex-col gap-4">
          {/* CANAL */}
          <section className="card p-5">
            <SectionTitle icon={MessageSquare} title="Canal de venda" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {CHANNEL_OPTIONS.map((c) => {
                const active = channel === c.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setChannel(c.key)}
                    className={`px-3 h-9 rounded-lg text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                    }`}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* BUSCA DE PRODUTOS */}
          <section className="card p-5">
            <SectionTitle icon={Search} title="Adicionar produtos" />
            <div className="relative mb-3">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou SKU…"
                className="w-full h-10 pl-10 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 size-6 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.05]"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-white/[0.05]">
              {isLoadingProducts && products.length === 0 ? (
                <div className="p-8 text-center text-xs text-white/40 flex items-center justify-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  Buscando produtos…
                </div>
              ) : products.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="size-6 text-white/20 mx-auto mb-2" />
                  <div className="text-xs text-white/60">
                    {debouncedSearch
                      ? 'Nenhum produto encontrado'
                      : 'Digite algo para buscar ou aguarde'}
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {products.map((p) => {
                    const unit = defaultUnit(p)
                    const price = priceForUnit(unit, channel)
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {p.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-white/40 mt-0.5">
                            <Hash className="size-2.5" />
                            <span className="font-mono">{p.sku}</span>
                            <span>·</span>
                            <span>{unitLabel(unit)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-white tabular-nums">
                            {price > 0 ? centsToBRL(price) : 's/ preço'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(p)}
                          className="size-8 rounded-lg flex items-center justify-center bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors"
                          aria-label="Adicionar"
                        >
                          <Plus className="size-4" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* CARRINHO */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon={ShoppingBag} title="Itens do pedido" inline />
              <div className="text-[10px] text-white/40">
                {cart.length} {cart.length === 1 ? 'item' : 'itens'}
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="size-7 text-white/20 mx-auto mb-2" />
                <div className="text-sm text-white/50">Carrinho vazio</div>
                <div className="text-[11px] text-white/30 mt-1">
                  Adicione produtos acima para começar
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {cart.map((c) => (
                  <CartRow
                    key={`${c.productId}-${c.unitCode}`}
                    item={c}
                    onQuantity={(q) => updateQuantity(c.productId, c.unitCode, q)}
                    onPrice={(p) => updatePrice(c.productId, c.unitCode, p)}
                    onRemove={() => removeFromCart(c.productId, c.unitCode)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* COLUNA DIREITA — cliente + resumo + submit */}
        <div className="flex flex-col gap-4">
          {/* CLIENTE */}
          <section className="card p-5">
            <SectionTitle icon={User} title="Cliente" subtitle="Opcional" inline />
            <div className="space-y-2.5">
              <Field
                icon={User}
                placeholder="Nome do cliente"
                value={customerName}
                onChange={setCustomerName}
              />
              <Field
                icon={Phone}
                placeholder="Telefone (com DDD)"
                value={customerPhone}
                onChange={setCustomerPhone}
                inputMode="tel"
              />
            </div>
          </section>

          {/* ENTREGA */}
          <section className="card p-5">
            <SectionTitle
              icon={MapPin}
              title="Entrega & observações"
              subtitle="Opcional"
              inline
            />
            <div className="space-y-2.5">
              <Field
                icon={MapPin}
                placeholder="Endereço de entrega"
                value={deliveryAddress}
                onChange={setDeliveryAddress}
              />
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Field
                  icon={MessageSquare}
                  placeholder="Observações"
                  value={notes}
                  onChange={setNotes}
                />
                <div className="relative">
                  <input
                    type="text"
                    value={deliveryFeeReais}
                    onChange={(e) => setDeliveryFeeReais(e.target.value)}
                    placeholder="Frete R$"
                    inputMode="decimal"
                    className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 tabular-nums"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* RESUMO + SUBMIT */}
          <section className="card p-5 sticky top-4">
            <SectionTitle icon={ShoppingBag} title="Resumo" inline />
            <div className="space-y-2 mb-4 mt-3">
              <Row label="Itens" value={String(cart.length)} />
              <Row
                label="Subtotal"
                value={centsToBRL(subtotalCents)}
                mono
              />
              {deliveryFeeCents > 0 && (
                <Row
                  label="Frete"
                  value={centsToBRL(deliveryFeeCents)}
                  mono
                />
              )}
              <div className="border-t border-white/[0.05] pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Total</span>
                  <span className="text-lg font-black text-accent tabular-nums">
                    {centsToBRL(totalCents)}
                  </span>
                </div>
              </div>
            </div>

            {hasInvalidItems && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <div>{invalidItems.length} item(ns) com quantidade ou preço inválido. Defina um preço unitário maior que zero.</div>
              </div>
            )}

            {submitError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <div>{submitError}</div>
              </div>
            )}

            {submitSuccess && (
              <div className="mb-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-[11px] text-green-300 flex items-start gap-2">
                <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
                <div>Pedido criado! Redirecionando…</div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push('/app/orders/queue')}
                disabled={submitting}
                className="flex-1 h-10 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-[2] h-10 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Criando…
                  </>
                ) : (
                  <>
                    <ShoppingBag className="size-3.5" />
                    Criar pedido · {centsToBRL(totalCents)}
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ============ COMPONENTES AUXILIARES ============

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  inline = false,
}: {
  icon: typeof Search
  title: string
  subtitle?: string
  inline?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${inline ? '' : 'mb-3'}`}>
      <Icon className="size-3.5 text-white/40" />
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {subtitle && (
        <span className="text-[10px] text-white/30 font-normal">({subtitle})</span>
      )}
    </div>
  )
}

function Field({
  icon: Icon,
  placeholder,
  value,
  onChange,
  inputMode,
}: {
  icon: typeof Search
  placeholder: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'text' | 'tel' | 'decimal' | 'numeric'
}) {
  return (
    <div className="relative">
      <Icon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
      />
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/50">{label}</span>
      <span className={`text-white ${mono ? 'tabular-nums font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

function CartRow({
  item,
  onQuantity,
  onPrice,
  onRemove,
}: {
  item: CartItem
  onQuantity: (q: number) => void
  onPrice: (p: number) => void
  onRemove: () => void
}) {
  const [priceText, setPriceText] = useState(() =>
    (item.unitPriceCents / 100).toFixed(2).replace('.', ','),
  )
  const totalCents = item.unitPriceCents * item.quantity

  // Sincroniza priceText se o preço mudar externamente
  useEffect(() => {
    setPriceText((item.unitPriceCents / 100).toFixed(2).replace('.', ','))
  }, [item.unitPriceCents])

  const handlePriceBlur = () => {
    const v = parseFloat(priceText.replace(',', '.'))
    if (Number.isFinite(v) && v >= 0) {
      onPrice(Math.round(v * 100))
    } else {
      // restaura
      setPriceText((item.unitPriceCents / 100).toFixed(2).replace('.', ','))
    }
  }

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{item.productName}</div>
        <div className="text-[10px] text-white/40 mt-0.5 font-mono">
          {item.sku} · {item.unitLabel}
        </div>
      </div>

      {/* Quantidade */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onQuantity(item.quantity - 1)}
          className="size-6 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          <Minus className="size-3" />
        </button>
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => onQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="w-12 h-7 text-center text-sm font-bold text-white bg-white/[0.04] border border-white/[0.08] rounded-md focus:outline-none focus:border-accent/50 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onQuantity(item.quantity + 1)}
          className="size-6 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          <Plus className="size-3" />
        </button>
      </div>

      {/* Preço unitário (editável) */}
      <div className="relative w-24">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white/40">
          R$
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          onBlur={handlePriceBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="w-full h-7 pl-6 pr-1 text-right text-sm font-semibold text-white bg-white/[0.04] border border-white/[0.08] rounded-md focus:outline-none focus:border-accent/50 tabular-nums"
        />
      </div>

      {/* Total */}
      <div className="w-20 text-right text-sm font-bold text-accent tabular-nums">
        {centsToBRL(totalCents)}
      </div>

      {/* Remover */}
      <button
        type="button"
        onClick={onRemove}
        className="size-7 rounded-md flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        aria-label="Remover"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export interface AggregatedOrder {
  id: string
  externalId: string
  provider: 'ifood' | '99eats' | 'rappi' | string
  providerName: string
  providerIcon: string
  status: 'RECEBIDO' | 'CONFIRMADO' | 'PREPARANDO' | 'PRONTO' | 'SAIU' | 'ENTREGUE' | 'CANCELADO'
  customerName: string
  customerPhone: string
  address: string
  items: AggregatedOrderItem[]
  subtotal: number
  deliveryFee: number
  total: number
  paymentMethod: string
  createdAt: string
  estimatedDelivery?: string
  priority: 'high' | 'normal' | 'low'
  hasDivergence: boolean
}

export interface AggregatedOrderItem {
  name: string
  quantity: number
  notes?: string
}

export interface MarketplaceStats {
  totalOrders: number
  pendingOrders: number
  preparingOrders: number
  readyOrders: number
  deliveredToday: number
  cancelledToday: number
  revenueToday: number
  avgPreparationTime: number
}

export interface ProviderConnection {
  provider: string
  connected: boolean
  pendingOrders: number
  lastSync: string
}

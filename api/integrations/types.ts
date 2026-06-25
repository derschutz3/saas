export type IntegrationProvider = 
  | 'ifood'
  | '99eats'
  | 'rappi'
  | 'mercadolivre'
  | 'shopify'
  | 'woocommerce'
  | 'pagseguro'
  | 'stripe'
  | 'totvs'
  | 'sankhya'
  | 'totall'
  | 'whatsapp'
  | 'custom'

export type IntegrationStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'syncing'

export type CanonicalEventType =
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_READY'
  | 'ORDER_DISPATCHED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REFUNDED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'INVENTORY_UPDATED'
  | 'CATALOG_UPDATED'
  | 'CUSTOMER_UPDATED'
  | 'INTEGRATION_CONNECTED'
  | 'INTEGRATION_DISCONNECTED'
  | 'INTEGRATION_ERROR'

export interface CanonicalOrderItem {
  sku: string
  name: string
  quantity: number
  unitPrice: number
  discount?: number
  notes?: string
}

export interface CanonicalOrder {
  externalId: string
  provider: IntegrationProvider
  tenantId: string
  branchId: string
  status: CanonicalEventType
  customer: {
    name: string
    document?: string
    phone?: string
    email?: string
    address?: {
      street: string
      number: string
      complement?: string
      neighborhood: string
      city: string
      state: string
      zipcode: string
    }
    coordinates?: {
      lat: number
      lng: number
    }
  }
  items: CanonicalOrderItem[]
  subtotal: number
  tax: number
  deliveryFee: number
  discount: number
  total: number
  paymentMethod: 'card' | 'pix' | 'money' | 'voucher' | 'unknown'
  paymentStatus: 'pending' | 'confirmed' | 'failed' | 'refunded'
  channel: 'marketplace' | 'pos' | 'whatsapp' | 'web' | 'app'
  channelName?: string
  scheduledAt?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface CanonicalEvent<T = unknown> {
  id: string
  traceId: string
  tenantId: string
  branchId: string
  provider: IntegrationProvider
  eventType: CanonicalEventType
  payload: T
  timestamp: string
  retryCount: number
  maxRetries: number
  metadata?: Record<string, unknown>
}

export interface IntegrationCredentials {
  provider: IntegrationProvider
  tenantId: string
  branchId?: string
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
  merchantId?: string
  environment: 'sandbox' | 'production'
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

export interface IntegrationConfig {
  provider: IntegrationProvider
  name: string
  description: string
  icon: string
  capabilities: IntegrationCapability[]
  authType: 'oauth2' | 'apikey' | 'webhook'
  endpoints: {
    api?: string
    webhook?: string
    docs?: string
  }
  events: CanonicalEventType[]
}

export type IntegrationCapability =
  | 'orders_read'
  | 'orders_write'
  | 'orders_update'
  | 'orders_cancel'
  | 'catalog_read'
  | 'catalog_write'
  | 'catalog_sync'
  | 'inventory_read'
  | 'inventory_write'
  | 'customers_read'
  | 'customers_write'
  | 'payments_read'
  | 'payments_write'
  | 'webhooks'

export interface WebhookPayload {
  provider: IntegrationProvider
  tenantId: string
  branchId?: string
  headers: Record<string, string>
  body: unknown
  signature?: string
  timestamp: string
  rawEvent?: unknown
}

export interface SyncResult {
  provider: IntegrationProvider
  success: boolean
  itemsProcessed: number
  errors: string[]
  startedAt: string
  completedAt: string
  nextSyncAt?: string
}

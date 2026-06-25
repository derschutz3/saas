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

export interface IntegrationProviderInfo {
  id: IntegrationProvider
  name: string
  description: string
  icon: string
  capabilities: string[]
  authType: 'oauth2' | 'apikey' | 'webhook'
  color: string
  connected: boolean
  status?: 'sandbox' | 'production' | null
}

export interface IntegrationConnection {
  provider: IntegrationProvider
  environment: 'sandbox' | 'production'
  connected: boolean
  expiresAt?: string
  lastSync?: string
  createdAt: string
}

export interface IntegrationStats {
  adaptersRegistered: number
  handlersSubscribed: number
  eventsInHistory: number
  deadLetterCount: number
}

export interface WebhookEvent {
  id: string
  traceId: string
  tenantId: string
  branchId: string
  provider: IntegrationProvider
  eventType: string
  timestamp: string
  retryCount: number
  metadata?: Record<string, unknown>
}

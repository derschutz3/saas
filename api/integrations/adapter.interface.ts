import type {
  IntegrationProvider,
  CanonicalEvent,
  CanonicalOrder,
  IntegrationCredentials,
  SyncResult,
  WebhookPayload
} from './types.js'

export interface IntegrationAdapter {
  readonly provider: IntegrationProvider
  readonly config: {
    name: string
    version: string
    capabilities: string[]
  }

  authenticate(credentials: IntegrationCredentials): Promise<{ success: boolean; error?: string }>
  refreshToken?(credentials: IntegrationCredentials): Promise<{ success: boolean; credentials?: Partial<IntegrationCredentials>; error?: string }>
  
  validateWebhook(payload: WebhookPayload): Promise<{ valid: boolean; error?: string }>
  normalizeWebhook(payload: WebhookPayload): Promise<CanonicalEvent<CanonicalOrder>>
  
  fetchNewOrders(credentials: IntegrationCredentials, since?: string): Promise<CanonicalOrder[]>
  pushOrder?(credentials: IntegrationCredentials, order: CanonicalOrder): Promise<{ success: boolean; externalId?: string; error?: string }>
  updateOrderStatus?(credentials: IntegrationCredentials, externalId: string, status: string, reason?: string): Promise<{ success: boolean; error?: string }>
  
  syncCatalog?(credentials: IntegrationCredentials): Promise<SyncResult>
  syncInventory?(credentials: IntegrationCredentials, items: Array<{ sku: string; quantity: number }>): Promise<SyncResult>
  
  healthCheck(credentials: IntegrationCredentials): Promise<{ healthy: boolean; latency?: number; error?: string }>
  getMerchantInfo?(credentials: IntegrationCredentials): Promise<{ name: string; document?: string; status: string }>
}

export interface IntegrationHandler {
  eventType: string
  handler: (event: CanonicalEvent<CanonicalOrder>) => Promise<void>
  priority?: number
}

export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

export function calculateRetryDelay(config: RetryConfig, attempt: number): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  return Math.min(delay, config.maxDelayMs)
}

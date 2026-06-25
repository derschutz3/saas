// @ts-nocheck — adapters de marketplace usam payload dinâmico (unknown) de provedores externos
import type { IntegrationAdapter, RetryConfig, DEFAULT_RETRY_CONFIG } from './adapter.interface.js'
import type {
  IntegrationProvider,
  CanonicalEvent,
  CanonicalOrder,
  IntegrationCredentials,
  WebhookPayload,
  SyncResult
} from './types.js'

export abstract class BaseAdapter implements IntegrationAdapter {
  abstract readonly provider: IntegrationProvider
  abstract readonly config: { name: string; version: string; capabilities: string[] }

  protected baseUrl: string
  protected retryConfig: RetryConfig = { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2 }

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || ''
  }

  async authenticate(credentials: IntegrationCredentials): Promise<{ success: boolean; error?: string }> {
    if (!credentials.accessToken) {
      return { success: false, error: 'No access token provided' }
    }
    return { success: true }
  }

  async validateWebhook(payload: WebhookPayload): Promise<{ valid: boolean; error?: string }> {
    if (!payload.signature || !payload.body) {
      return { valid: false, error: 'Missing signature or body' }
    }
    return { valid: true }
  }

  abstract normalizeWebhook(payload: WebhookPayload): Promise<CanonicalEvent<CanonicalOrder>>

  async fetchNewOrders(credentials: IntegrationCredentials, since?: string): Promise<CanonicalOrder[]> {
    throw new Error(`fetchNewOrders not implemented for ${this.provider}`)
  }

  async healthCheck(credentials: IntegrationCredentials): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now()
    try {
      if (!credentials.accessToken) {
        return { healthy: false, error: 'No access token' }
      }
      return { healthy: true, latency: Date.now() - start }
    } catch (error) {
      return { 
        healthy: false, 
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    credentials: IntegrationCredentials
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        })

        if (!response.ok) {
          if (response.status === 401 && credentials.refreshToken) {
            await this.refreshToken?.(credentials)
            continue
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return await response.json()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt)
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }

    throw lastError || new Error('Request failed after retries')
  }

  protected normalizeOrderBase(
    externalId: string,
    provider: IntegrationProvider,
    tenantId: string,
    orderData: Record<string, unknown>
  ): Omit<CanonicalOrder, 'tenantId' | 'branchId'> {
    const customer = orderData.customer as Record<string, unknown> || {}
    const address = customer.address as Record<string, unknown> || {}
    const payment = orderData.payment as Record<string, unknown> || {}
    const items = (orderData.items as Array<Record<string, unknown>> || []).map((item: Record<string, unknown>) => ({
      sku: (item.sku as string) || (item.productId as string) || '',
      name: (item.name as string) || (item.productName as string) || '',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
      discount: Number(item.discount) || 0,
      notes: item.notes as string || item.observation as string,
    }))

    const subtotal = Number(orderData.subtotal) || items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0)
    const deliveryFee = Number(orderData.deliveryFee) || Number(orderData.tax) || 0
    const discount = Number(orderData.discount) || 0
    const tax = Number(orderData.tax) || 0
    const total = Number(orderData.total) || (subtotal + deliveryFee + tax - discount)

    return {
      externalId,
      provider,
      status: this.mapStatus(orderData.status as string),
      customer: {
        name: (customer.name as string) || 'Consumidor',
        document: customer.document as string,
        phone: customer.phone as string || customer.phoneNumber as string,
        email: customer.email as string,
        address: {
          street: (address.street as string) || (address.street as string) || '',
          number: (address.number as string) || '',
          complement: address.complement as string,
          neighborhood: (address.neighborhood as string) || (address.district as string) || '',
          city: (address.city as string) || '',
          state: (address.state as string) || (address.uf as string) || '',
          zipcode: (address.zipcode as string) || (address.postalCode as string) || '',
        },
        coordinates: customer.coordinates ? {
          lat: Number((customer.coordinates as Record<string, number>).lat) || 0,
          lng: Number((customer.coordinates as Record<string, number>).lng) || 0,
        } : undefined,
      },
      items,
      subtotal,
      tax,
      deliveryFee,
      discount,
      total,
      paymentMethod: this.mapPaymentMethod(payment.method as string || payment.type as string),
      paymentStatus: payment.status === 'confirmed' ? 'confirmed' : 
                     payment.status === 'failed' ? 'failed' : 
                     payment.status === 'refunded' ? 'refunded' : 'pending',
      channel: 'marketplace',
      channelName: this.config.name,
      createdAt: (orderData.createdAt as string) || (orderData.created_at as string) || new Date().toISOString(),
      updatedAt: (orderData.updatedAt as string) || (orderData.updated_at as string) || new Date().toISOString(),
      metadata: orderData,
    }
  }

  protected mapStatus(status: string): CanonicalOrder['status'] {
    const statusMap: Record<string, CanonicalOrder['status']> = {
      'PLACED': 'ORDER_CREATED',
      'CONFIRMED': 'ORDER_ACCEPTED',
      'ACCEPTED': 'ORDER_ACCEPTED',
      'READY': 'ORDER_READY',
      'DISPATCHED': 'ORDER_DISPATCHED',
      'DELIVERED': 'ORDER_DELIVERED',
      'CANCELLED': 'ORDER_CANCELLED',
      'CANCELED': 'ORDER_CANCELLED',
      'REFUNDED': 'ORDER_REFUNDED',
    }
    return statusMap[status] || 'ORDER_UPDATED'
  }

  protected mapPaymentMethod(method: string): CanonicalOrder['paymentMethod'] {
    const methodMap: Record<string, CanonicalOrder['paymentMethod']> = {
      'CREDIT': 'card',
      'DEBIT': 'card',
      'PIX': 'pix',
      'MONEY': 'money',
      'VOUCHER': 'voucher',
      'FOOD_VOUCHER': 'voucher',
    }
    return methodMap[method] || 'unknown'
  }

  protected generateEventId(provider: IntegrationProvider, externalId: string): string {
    return `${provider}-${externalId}-${Date.now()}`
  }
}

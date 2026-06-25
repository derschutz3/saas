// @ts-nocheck — adapter Rappi usa payload dinâmico externo
import type { IntegrationCredentials, WebhookPayload, CanonicalEvent, CanonicalOrder } from './types.js'
import { BaseAdapter } from './base.adapter.js'

export class RappiAdapter extends BaseAdapter {
  readonly provider = 'rappi' as const
  readonly config = {
    name: 'Rappi',
    version: '1.0',
    capabilities: [
      'orders_read',
      'orders_update',
      'orders_cancel',
      'catalog_sync',
      'webhooks'
    ]
  }

  constructor() {
    super('https://api.rappi.com.br')
  }

  async authenticate(credentials: IntegrationCredentials): Promise<{ success: boolean; error?: string }> {
    if (!credentials.accessToken) {
      return { success: false, error: 'Rappi requires access token' }
    }
    return { success: true }
  }

  async validateWebhook(payload: WebhookPayload): Promise<{ valid: boolean; error?: string }> {
    return { valid: true }
  }

  async normalizeWebhook(payload: WebhookPayload): Promise<CanonicalEvent<CanonicalOrder>> {
    const body = payload.body as Record<string, any>
    const eventType = this.extractEventType(body)
    const orderData = body.order || body
    const externalId = (orderData.id as string) || (orderData.order_id as string) || String(Date.now())

    const canonicalOrder: Omit<CanonicalOrder, 'tenantId' | 'branchId'> = {
      externalId,
      provider: 'rappi',
      status: this.mapStatus(orderData.status as string),
      customer: {
        name: (orderData.user?.name as string) || (orderData.customer?.name as string) || 'Consumidor Rappi',
        document: orderData.user?.document as string,
        phone: orderData.user?.phone as string,
        email: orderData.user?.email as string,
        address: {
          street: (orderData.address?.street as string) || (orderData.delivery_address?.street as string) || '',
          number: (orderData.address?.number as string) || '',
          complement: orderData.address?.complement as string,
          neighborhood: (orderData.address?.neighborhood as string) || (orderData.address?.zone as string) || '',
          city: (orderData.address?.city as string) || '',
          state: (orderData.address?.state as string) || '',
          zipcode: (orderData.address?.zipcode as string) || '',
        },
        coordinates: orderData.address?.lat ? {
          lat: Number(orderData.address.lat),
          lng: Number(orderData.address.lng),
        } : undefined,
      },
      items: this.normalizeItems(orderData.products as Array<Record<string, unknown>> || []),
      subtotal: Number(orderData.subtotal) || Number(orderData.subtotal_amount) || 0,
      tax: Number(orderData.tax) || Number(orderData.service_fee) || 0,
      deliveryFee: Number(orderData.delivery_fee) || 0,
      discount: Number(orderData.discount) || 0,
      total: Number(orderData.total) || Number(orderData.total_amount) || 0,
      paymentMethod: this.mapPaymentMethod(orderData.payment_method as string),
      paymentStatus: orderData.payment_status === 'paid' ? 'confirmed' : 'pending',
      channel: 'marketplace',
      channelName: 'Rappi',
      createdAt: orderData.created_at as string || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { originalEvent: eventType }
    }

    return {
      id: this.generateEventId('rappi', externalId),
      traceId: `rappi-webhook-${Date.now()}`,
      tenantId: payload.tenantId,
      branchId: payload.branchId,
      provider: 'rappi',
      eventType,
      payload: { ...canonicalOrder, tenantId: payload.tenantId, branchId: payload.branchId || '' } as CanonicalOrder,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
    }
  }

  async fetchNewOrders(credentials: IntegrationCredentials, since?: string): Promise<CanonicalOrder[]> {
    const params = new URLSearchParams()
    if (since) {
      params.set('from', since)
    }

    const url = `${this.baseUrl}/orders?${params}`

    try {
      const data = await this.fetchWithRetry<{ orders: Array<Record<string, unknown>> }>(url, {
        method: 'GET'
      }, credentials)

      return (data.orders || []).map(order => this.normalizeRappiOrder(order, credentials))
    } catch {
      return []
    }
  }

  async updateOrderStatus(
    credentials: IntegrationCredentials,
    externalId: string,
    status: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const statusMap: Record<string, string> = {
      'ORDER_ACCEPTED': 'accepted',
      'ORDER_READY': 'ready',
      'ORDER_DISPATCHED': 'dispatched',
      'ORDER_CANCELLED': 'cancelled',
    }

    const rappiStatus = statusMap[status] || status

    try {
      await this.fetchWithRetry(
        `${this.baseUrl}/orders/${externalId}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: rappiStatus, reason })
        },
        credentials
      )

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private extractEventType(body: Record<string, unknown>): CanonicalOrder['status'] {
    const eventName = (body.event as string) || (body.action as string) || ''
    
    const typeMap: Record<string, CanonicalOrder['status']> = {
      'order_created': 'ORDER_CREATED',
      'order_confirmed': 'ORDER_ACCEPTED',
      'order_accepted': 'ORDER_ACCEPTED',
      'order_preparing': 'ORDER_ACCEPTED',
      'order_ready': 'ORDER_READY',
      'order_picked_up': 'ORDER_DISPATCHED',
      'order_delivered': 'ORDER_DELIVERED',
      'order_cancelled': 'ORDER_CANCELLED',
      'order_canceled': 'ORDER_CANCELLED',
    }

    return typeMap[eventName] || 'ORDER_UPDATED'
  }

  protected mapStatus(status?: string): CanonicalOrder['status'] {
    if (!status) return 'ORDER_CREATED'
    
    const statusMap: Record<string, CanonicalOrder['status']> = {
      'created': 'ORDER_CREATED',
      'confirmed': 'ORDER_ACCEPTED',
      'accepted': 'ORDER_ACCEPTED',
      'preparing': 'ORDER_ACCEPTED',
      'ready': 'ORDER_READY',
      'picked_up': 'ORDER_DISPATCHED',
      'delivered': 'ORDER_DELIVERED',
      'cancelled': 'ORDER_CANCELLED',
      'canceled': 'ORDER_CANCELLED',
    }

    return statusMap[status.toLowerCase()] || 'ORDER_UPDATED'
  }

  private normalizeItems(items: Array<Record<string, unknown>>): CanonicalOrder['items'] {
    return items.map(item => ({
      sku: (item.sku as string) || (item.product_id as string) || '',
      name: (item.name as string) || (item.product_name as string) || '',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || Number(item.price) || 0,
      discount: Number(item.discount) || 0,
      notes: item.notes as string || item.special_instructions as string,
    }))
  }

  private normalizeRappiOrder(order: Record<string, unknown>, credentials: IntegrationCredentials): CanonicalOrder {
    const externalId = (order.id as string) || (order.order_id as string) || String(Date.now())

    return {
      externalId,
      provider: 'rappi',
      status: this.mapStatus(order.status as string),
      customer: {
        name: (order.user?.name as string) || 'Consumidor',
        document: order.user?.document as string,
        phone: order.user?.phone as string,
        email: order.user?.email as string,
        address: {
          street: (order.address?.street as string) || '',
          number: (order.address?.number as string) || '',
          complement: order.address?.complement as string,
          neighborhood: (order.address?.neighborhood as string) || '',
          city: (order.address?.city as string) || '',
          state: (order.address?.state as string) || '',
          zipcode: (order.address?.zipcode as string) || '',
        },
      },
      items: this.normalizeItems((order.products || []) as Array<Record<string, unknown>>),
      subtotal: Number(order.subtotal) || 0,
      tax: Number(order.tax) || 0,
      deliveryFee: Number(order.delivery_fee) || 0,
      discount: Number(order.discount) || 0,
      total: Number(order.total) || 0,
      paymentMethod: this.mapPaymentMethod(order.payment_method as string),
      paymentStatus: order.payment_status === 'paid' ? 'confirmed' : 'pending',
      channel: 'marketplace',
      channelName: 'Rappi',
      createdAt: order.created_at as string || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tenantId: credentials.tenantId,
      branchId: credentials.branchId || ''
    }
  }

  protected mapPaymentMethod(method?: string): CanonicalOrder['paymentMethod'] {
    if (!method) return 'unknown'
    const map: Record<string, CanonicalOrder['paymentMethod']> = {
      'credit': 'card',
      'debit': 'card',
      'pix': 'pix',
      'money': 'money',
      'voucher': 'voucher',
    }
    return map[method.toLowerCase()] || 'unknown'
  }
}

// @ts-nocheck — adapter 99Food usa payload dinâmico externo
import type { IntegrationCredentials, WebhookPayload, CanonicalEvent, CanonicalOrder } from './types.js'
import { BaseAdapter } from './base.adapter.js'

export class NinetyNineAdapter extends BaseAdapter {
  readonly provider = '99eats' as const
  readonly config = {
    name: '99 Eats',
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
    super('https://api.99eats.com.br')
  }

  async authenticate(credentials: IntegrationCredentials): Promise<{ success: boolean; error?: string }> {
    if (!credentials.accessToken) {
      return { success: false, error: '99 Eats requires access token' }
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
    const externalId = (orderData.order_id as string) || (orderData.id as string) || String(Date.now())

    const canonicalOrder: Omit<CanonicalOrder, 'tenantId' | 'branchId'> = {
      externalId,
      provider: '99eats',
      status: this.mapStatus(orderData.status as string),
      customer: {
        name: (orderData.customer?.name as string) || (orderData.client?.name as string) || 'Consumidor 99',
        document: orderData.customer?.document as string,
        phone: orderData.customer?.phone as string,
        email: orderData.customer?.email as string,
        address: {
          street: (orderData.address?.street as string) || '',
          number: (orderData.address?.number as string) || '',
          complement: orderData.address?.complement as string,
          neighborhood: (orderData.address?.district as string) || (orderData.address?.neighborhood as string) || '',
          city: (orderData.address?.city as string) || '',
          state: (orderData.address?.state as string) || (orderData.address?.uf as string) || '',
          zipcode: (orderData.address?.postal_code as string) || '',
        },
        coordinates: orderData.address?.coordinates ? {
          lat: Number(orderData.address.coordinates.lat) || 0,
          lng: Number(orderData.address.coordinates.lng) || 0,
        } : undefined,
      },
      items: this.normalizeItems(orderData.items as Array<Record<string, unknown>> || []),
      subtotal: Number(orderData.subtotal) || 0,
      tax: Number(orderData.tax) || 0,
      deliveryFee: Number(orderData.delivery_fee) || Number(orderData.deliveryFee) || 0,
      discount: Number(orderData.discount) || 0,
      total: Number(orderData.total) || 0,
      paymentMethod: this.mapPaymentMethod(orderData.payment_method as string),
      paymentStatus: orderData.payment_status === 'paid' ? 'confirmed' : 'pending',
      channel: 'marketplace',
      channelName: '99 Eats',
      createdAt: orderData.created_at as string || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { originalEvent: eventType }
    }

    return {
      id: this.generateEventId('99eats', externalId),
      traceId: `99eats-webhook-${Date.now()}`,
      tenantId: payload.tenantId,
      branchId: payload.branchId,
      provider: '99eats',
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
      params.set('created_after', since)
    }

    const url = `${this.baseUrl}/orders?${params}`

    try {
      const data = await this.fetchWithRetry<{ orders: Array<Record<string, unknown>> }>(url, {
        method: 'GET'
      }, credentials)

      return (data.orders || []).map(order => this.normalize99Order(order, credentials))
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

    const ninetyNineStatus = statusMap[status] || status

    try {
      await this.fetchWithRetry(
        `${this.baseUrl}/orders/${externalId}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: ninetyNineStatus, reason })
        },
        credentials
      )

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private extractEventType(body: Record<string, unknown>): CanonicalOrder['status'] {
    const eventName = (body.event as string) || (body.type as string) || ''
    
    const typeMap: Record<string, CanonicalOrder['status']> = {
      'order.created': 'ORDER_CREATED',
      'order.confirmed': 'ORDER_ACCEPTED',
      'order.accepted': 'ORDER_ACCEPTED',
      'order.ready': 'ORDER_READY',
      'order.picked_up': 'ORDER_DISPATCHED',
      'order.delivered': 'ORDER_DELIVERED',
      'order.cancelled': 'ORDER_CANCELLED',
      'payment.confirmed': 'PAYMENT_CONFIRMED',
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
      notes: item.notes as string || item.observations as string,
    }))
  }

  private normalize99Order(order: Record<string, any>, credentials: IntegrationCredentials): CanonicalOrder {
    const externalId = (order.order_id as string) || (order.id as string) || String(Date.now())

    return {
      externalId,
      provider: '99eats',
      status: this.mapStatus(order.status as string),
      customer: {
        name: (order.customer?.name as string) || 'Consumidor',
        document: order.customer?.document as string,
        phone: order.customer?.phone as string,
        email: order.customer?.email as string,
        address: {
          street: (order.address?.street as string) || '',
          number: (order.address?.number as string) || '',
          complement: order.address?.complement as string,
          neighborhood: (order.address?.district as string) || '',
          city: (order.address?.city as string) || '',
          state: (order.address?.state as string) || '',
          zipcode: (order.address?.postal_code as string) || '',
        },
      },
      items: this.normalizeItems((order.items || []) as Array<Record<string, unknown>>),
      subtotal: Number(order.subtotal) || 0,
      tax: Number(order.tax) || 0,
      deliveryFee: Number(order.delivery_fee) || 0,
      discount: Number(order.discount) || 0,
      total: Number(order.total) || 0,
      paymentMethod: this.mapPaymentMethod(order.payment_method as string),
      paymentStatus: order.payment_status === 'paid' ? 'confirmed' : 'pending',
      channel: 'marketplace',
      channelName: '99 Eats',
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

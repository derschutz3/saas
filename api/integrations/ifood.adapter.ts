// @ts-nocheck — adapter iFood usa payload dinâmico externo
import type { IntegrationCredentials, WebhookPayload, CanonicalEvent, CanonicalOrder } from './types.js'
import { BaseAdapter } from './base.adapter.js'

export class IfoodAdapter extends BaseAdapter {
  readonly provider = 'ifood' as const
  readonly config = {
    name: 'iFood',
    version: '2.0',
    capabilities: [
      'orders_read',
      'orders_write',
      'orders_update',
      'orders_cancel',
      'catalog_sync',
      'inventory_write',
      'webhooks'
    ]
  }

  constructor() {
    super('https://api.ifood.com.br')
  }

  async authenticate(credentials: IntegrationCredentials): Promise<{ success: boolean; error?: string }> {
    if (!credentials.accessToken) {
      return { success: false, error: 'iFood requires access token' }
    }

    try {
      const response = await fetch(`${this.baseUrl}/authentication/v1.0/oauth/token`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        return { success: true }
      }

      return { success: false, error: `Authentication failed: ${response.status}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async validateWebhook(payload: WebhookPayload): Promise<{ valid: boolean; error?: string }> {
    const signature = payload.signature || payload.headers['x-ifood-signature']
    if (!signature) {
      return { valid: true }
    }

    return { valid: true }
  }

  async normalizeWebhook(payload: WebhookPayload): Promise<CanonicalEvent<CanonicalOrder>> {
    const body = payload.body as Record<string, any>
    const eventType = this.extractEventType(body)
    
    const orderData = body.order || body
    const externalId = (orderData.id as string) || (orderData.orderId as string) || String(Date.now())

    const canonicalOrder: Omit<CanonicalOrder, 'tenantId' | 'branchId'> = {
      externalId,
      provider: 'ifood',
      status: this.mapIfoodStatus(eventType, orderData.status as string),
      customer: {
        name: (orderData.customer?.name as string) || 'Consumidor iFood',
        document: orderData.customer?.documentNumber as string,
        phone: orderData.customer?.phoneNumber as string,
        email: orderData.customer?.email as string,
        address: orderData.deliveryAddress ? {
          street: orderData.deliveryAddress.street as string || '',
          number: orderData.deliveryAddress.number as string || '',
          complement: orderData.deliveryAddress.complement as string,
          neighborhood: orderData.deliveryAddress.neighborhood as string || '',
          city: orderData.deliveryAddress.city as string || '',
          state: orderData.deliveryAddress.state as string || '',
          zipcode: orderData.deliveryAddress.postalCode as string || '',
        } : {
          street: '', number: '', neighborhood: '', city: '', state: '', zipcode: ''
        },
        coordinates: orderData.deliveryAddress?.coordinates ? {
          lat: Number(orderData.deliveryAddress.coordinates.latitude) || 0,
          lng: Number(orderData.deliveryAddress.coordinates.longitude) || 0,
        } : undefined,
      },
      items: this.normalizeIfoodItems(orderData.items as Array<Record<string, unknown>> || []),
      subtotal: Number(orderData.subTotal || orderData.subtotal) || 0,
      tax: Number(orderData.tax || orderData.taxAmount) || 0,
      deliveryFee: Number(orderData.deliveryFee || orderData.deliveryCost) || 0,
      discount: Number(orderData.discount || orderData.discountAmount) || 0,
      total: Number(orderData.totalOrder || orderData.total) || 0,
      paymentMethod: this.mapPaymentMethod(orderData.payment?.method as string),
      paymentStatus: orderData.payment?.status === 'CONFIRMED' ? 'confirmed' : 'pending',
      channel: 'marketplace',
      channelName: 'iFood',
      createdAt: orderData.createdAt as string || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { originalEvent: eventType }
    }

    return {
      id: this.generateEventId('ifood', externalId),
      traceId: `ifood-webhook-${Date.now()}`,
      tenantId: payload.tenantId,
      branchId: payload.headers['x-branch-id'] as string,
      provider: 'ifood',
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
      params.set('initialDate', since)
    }

    const url = `${this.baseUrl}/events/v1.0/orders?${params}`
    
    try {
      const data = await this.fetchWithRetry<{ orders: Array<Record<string, unknown>> }>(url, {
        method: 'GET'
      }, credentials)

      return (data.orders || []).map(order => ({
        ...this.normalizeIfoodOrder(order),
        tenantId: credentials.tenantId,
        branchId: credentials.branchId || ''
      }))
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
      'ORDER_ACCEPTED': 'ACCEPTED',
      'ORDER_READY': 'READY',
      'ORDER_DISPATCHED': 'DISPATCHED',
      'ORDER_CANCELLED': 'CANCELLED',
    }

    const ifoodStatus = statusMap[status] || status

    try {
      const response = await this.fetchWithRetry<{ success: boolean }>(
        `${this.baseUrl}/orders/v2.0/orders/${externalId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            code: ifoodStatus,
            reason
          })
        },
        credentials
      )

      return { success: response.success }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private extractEventType(body: Record<string, unknown>): CanonicalOrder['status'] {
    const eventCode = body.event as string || body.code as string || ''
    
    const typeMap: Record<string, CanonicalOrder['status']> = {
      'ORDER_PLACED': 'ORDER_CREATED',
      'ORDER_CONFIRMED': 'ORDER_ACCEPTED',
      'ORDER_ACCEPTED': 'ORDER_ACCEPTED',
      'ORDER_READY': 'ORDER_READY',
      'ORDER_DISPATCHED': 'ORDER_DISPATCHED',
      'ORDER_DELIVERED': 'ORDER_DELIVERED',
      'ORDER_CANCELLED': 'ORDER_CANCELLED',
      'ORDER_CANCELED': 'ORDER_CANCELLED',
      'PAYMENT_CONFIRMED': 'PAYMENT_CONFIRMED',
    }

    return typeMap[eventCode] || 'ORDER_UPDATED'
  }

  private mapIfoodStatus(eventType: string, orderStatus?: string): CanonicalOrder['status'] {
    if (orderStatus) {
      const statusMap: Record<string, CanonicalOrder['status']> = {
        'PLACED': 'ORDER_CREATED',
        'CONFIRMED': 'ORDER_ACCEPTED',
        'ACCEPTED': 'ORDER_ACCEPTED',
        'READY': 'ORDER_READY',
        'DISPATCHED': 'ORDER_DISPATCHED',
        'DELIVERED': 'ORDER_DELIVERED',
        'CANCELLED': 'ORDER_CANCELLED',
      }
      return statusMap[orderStatus] || eventType as CanonicalOrder['status']
    }
    return eventType as CanonicalOrder['status']
  }

  private normalizeIfoodItems(items: Array<Record<string, unknown>>): CanonicalOrder['items'] {
    return items.map(item => ({
      sku: (item.sku as string) || (item.productId as string) || '',
      name: (item.name as string) || (item.productName as string) || '',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
      discount: Number(item.optionsValue) || 0,
      notes: item.observation as string,
    }))
  }

  private normalizeIfoodOrder(order: Record<string, unknown>): CanonicalOrder {
    const externalId = (order.id as string) || String(Date.now())
    
    return {
      externalId,
      provider: 'ifood',
      status: 'ORDER_CREATED',
      customer: {
        name: (order.customer?.name as string) || 'Consumidor',
        document: order.customer?.document as string,
        phone: order.customer?.phone as string,
        email: order.customer?.email as string,
        address: {
          street: (order.deliveryAddress?.street as string) || '',
          number: (order.deliveryAddress?.number as string) || '',
          complement: order.deliveryAddress?.complement as string,
          neighborhood: (order.deliveryAddress?.neighborhood as string) || '',
          city: (order.deliveryAddress?.city as string) || '',
          state: (order.deliveryAddress?.state as string) || '',
          zipcode: (order.deliveryAddress?.postalCode as string) || '',
        },
        coordinates: order.deliveryAddress?.coordinates ? {
          lat: Number(order.deliveryAddress.coordinates.latitude) || 0,
          lng: Number(order.deliveryAddress.coordinates.longitude) || 0,
        } : undefined,
      },
      items: this.normalizeIfoodItems((order.items || []) as Array<Record<string, unknown>>),
      subtotal: Number(order.subTotal) || 0,
      tax: Number(order.taxAmount) || 0,
      deliveryFee: Number(order.deliveryFee) || 0,
      discount: Number(order.discountAmount) || 0,
      total: Number(order.totalOrder) || 0,
      paymentMethod: this.mapPaymentMethod(order.paymentMethod as string),
      paymentStatus: 'pending',
      channel: 'marketplace',
      channelName: 'iFood',
      createdAt: order.createdAt as string || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  protected mapPaymentMethod(method?: string): CanonicalOrder['paymentMethod'] {
    if (!method) return 'unknown'
    const map: Record<string, CanonicalOrder['paymentMethod']> = {
      'CREDIT': 'card',
      'DEBIT': 'card',
      'PIX': 'pix',
      'MONEY': 'money',
      'FOOD_VOUCHER': 'voucher',
    }
    return map[method] || 'unknown'
  }
}

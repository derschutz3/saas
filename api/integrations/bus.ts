import type {
  CanonicalEvent,
  CanonicalOrder,
  CanonicalEventType,
  IntegrationProvider,
  WebhookPayload,
  IntegrationCredentials,
  SyncResult
} from './types.js'
import type { IntegrationAdapter, IntegrationHandler, RetryConfig } from './adapter.interface.js'
import { DEFAULT_RETRY_CONFIG, calculateRetryDelay } from './adapter.interface.js'
import { logger } from '../shared/logger.js'

type EventHandler = (event: CanonicalEvent<CanonicalOrder>) => Promise<void>

export class IntegrationBus {
  private static instance: IntegrationBus
  private adapters: Map<IntegrationProvider, IntegrationAdapter> = new Map()
  private handlers: Map<CanonicalEventType, IntegrationHandler[]> = new Map()
  private deadLetterQueue: CanonicalEvent<CanonicalOrder>[] = []
  private eventHistory: CanonicalEvent<CanonicalOrder>[] = []
  private readonly maxHistorySize = 1000
  private readonly retryConfig: RetryConfig

  private constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig
  }

  static getInstance(): IntegrationBus {
    if (!IntegrationBus.instance) {
      IntegrationBus.instance = new IntegrationBus()
    }
    return IntegrationBus.instance
  }

  registerAdapter(adapter: IntegrationAdapter): void {
    this.adapters.set(adapter.provider, adapter)
    logger.debug('Adapter registrado', { provider: adapter.provider })
  }

  unregisterAdapter(provider: IntegrationProvider): void {
    this.adapters.delete(provider)
    logger.debug('Adapter removido', { provider })
  }

  getAdapter(provider: IntegrationProvider): IntegrationAdapter | undefined {
    return this.adapters.get(provider)
  }

  subscribe(eventType: CanonicalEventType, handler: EventHandler, priority = 0): void {
    const existing = this.handlers.get(eventType) || []
    existing.push({ eventType, handler, priority })
    existing.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    this.handlers.set(eventType, existing)
    logger.debug('Handler subscrito', { eventType, totalHandlers: existing.length })
  }

  unsubscribe(eventType: CanonicalEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || []
    const filtered = existing.filter(h => h.handler !== handler)
    this.handlers.set(eventType, filtered)
  }

  async publish(event: CanonicalEvent<CanonicalOrder>): Promise<void> {
    this.eventHistory.push(event)
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift()
    }

    const handlers = this.handlers.get(event.eventType) || []
    
    if (handlers.length === 0) {
      logger.debug('Nenhum handler para evento publicado', { eventType: event.eventType, eventId: event.id })
      return
    }

    const promises = handlers.map(h => this.executeWithRetry(h, event))
    await Promise.allSettled(promises)
  }

  private async executeWithRetry(handler: IntegrationHandler, event: CanonicalEvent<CanonicalOrder>): Promise<void> {
    let attempt = 0
    
    while (attempt <= this.retryConfig.maxRetries) {
      try {
        await handler.handler(event)
        return
      } catch (error) {
        attempt++
        if (attempt > this.retryConfig.maxRetries) {
          logger.error('Handler falhou após esgotar retries', { eventType: event.eventType, eventId: event.id, attempts: attempt, error })
          this.moveToDeadLetter(event, String(error))
          return
        }

        const delay = calculateRetryDelay(this.retryConfig, attempt - 1)
        logger.warn('Handler falhou, retentando', { eventType: event.eventType, eventId: event.id, attempt, maxRetries: this.retryConfig.maxRetries, delayMs: delay, error })
        await this.sleep(delay)
      }
    }
  }

  private moveToDeadLetter(event: CanonicalEvent<CanonicalOrder>, reason: string): void {
    this.deadLetterQueue.push({
      ...event,
      metadata: { ...event.metadata, deadLetterReason: reason, deadLetteredAt: new Date().toISOString() }
    })
    logger.warn('Evento movido para DLQ', { eventId: event.id, eventType: event.eventType, provider: event.provider, reason })
  }

  async processWebhook(
    provider: IntegrationProvider,
    payload: WebhookPayload
  ): Promise<{ success: boolean; event?: CanonicalEvent<CanonicalOrder>; error?: string }> {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      return { success: false, error: `No adapter registered for provider: ${provider}` }
    }

    try {
      const isValid = await adapter.validateWebhook(payload)
      if (!isValid.valid) {
        return { success: false, error: isValid.error || 'Invalid webhook signature' }
      }

      const event = await adapter.normalizeWebhook(payload)
      await this.publish(event)
      
      return { success: true, event }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  async syncOrders(provider: IntegrationProvider, credentials: IntegrationCredentials, since?: string): Promise<SyncResult> {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      return {
        provider,
        success: false,
        itemsProcessed: 0,
        errors: [`No adapter registered for provider: ${provider}`],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }
    }

    const startedAt = new Date().toISOString()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      const orders = await adapter.fetchNewOrders(credentials, since)
      itemsProcessed = orders.length

      for (const order of orders) {
        const event: CanonicalEvent<CanonicalOrder> = {
          id: `${provider}-${order.externalId}-${Date.now()}`,
          traceId: `sync-${Date.now()}`,
          tenantId: order.tenantId,
          branchId: order.branchId,
          provider,
          eventType: 'ORDER_CREATED',
          payload: order,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          maxRetries: this.retryConfig.maxRetries,
        }
        await this.publish(event)
      }

      return {
        provider,
        success: true,
        itemsProcessed,
        errors,
        startedAt,
        completedAt: new Date().toISOString(),
        nextSyncAt: new Date(Date.now() + 60000).toISOString()
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return {
        provider,
        success: false,
        itemsProcessed,
        errors,
        startedAt,
        completedAt: new Date().toISOString()
      }
    }
  }

  getEventHistory(limit = 100, provider?: IntegrationProvider): CanonicalEvent<CanonicalOrder>[] {
    let events = [...this.eventHistory].reverse()
    if (provider) {
      events = events.filter(e => e.provider === provider)
    }
    return events.slice(0, limit)
  }

  getDeadLetterQueue(): CanonicalEvent<CanonicalOrder>[] {
    return [...this.deadLetterQueue]
  }

  retryDeadLetter(eventId: string): boolean {
    const index = this.deadLetterQueue.findIndex(e => e.id === eventId)
    if (index === -1) return false

    const [event] = this.deadLetterQueue.splice(index, 1)
    event.retryCount = 0
    this.publish(event)
    return true
  }

  getStats(): {
    adaptersRegistered: number
    handlersSubscribed: number
    eventsInHistory: number
    deadLetterCount: number
  } {
    return {
      adaptersRegistered: this.adapters.size,
      handlersSubscribed: Array.from(this.handlers.values()).reduce((acc, h) => acc + h.length, 0),
      eventsInHistory: this.eventHistory.length,
      deadLetterCount: this.deadLetterQueue.length
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const integrationBus = IntegrationBus.getInstance()

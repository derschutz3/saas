import type { Request, Response, NextFunction } from 'express'
import type { IntegrationProvider, WebhookPayload, IntegrationCredentials } from './types.js'
import { integrationBus } from './bus.js'
import { verifyHmacSignature, createHmacSignature } from './security.js'
import { store } from '../infra/store.js'
import { logger } from '../shared/logger.js'

export interface WebhookContext {
  provider: IntegrationProvider
  tenantId: string
  branchId?: string
}

const idempotencyCache = new Map<string, { timestamp: number; result: unknown }>()
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000

function isIdempotent(eventId: string, result: unknown): boolean {
  const existing = idempotencyCache.get(eventId)
  if (existing) {
    return true
  }
  idempotencyCache.set(eventId, { timestamp: Date.now(), result })
  
  for (const [key, value] of idempotencyCache.entries()) {
    if (Date.now() - value.timestamp > IDEMPOTENCY_WINDOW_MS) {
      idempotencyCache.delete(key)
    }
  }
  
  return false
}

export function createWebhookHandler(provider: IntegrationProvider) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const traceId = req.headers['x-trace-id'] as string || `webhook-${Date.now()}`
    // SECURITY: extrai tenantId do path/header fora do try para que
    // fique acessível ao log de erro (caso aconteça antes da validação)
    const tenantId = req.params.tenantId || (req.headers['x-tenant-id'] as string) || ''

    try {
      if (!tenantId) {
        res.status(400).json({ error: 'Missing tenant ID' })
        return
      }

      const credentials = getCredentialsForTenant(provider, tenantId)
      if (!credentials) {
        res.status(401).json({ error: 'Integration not configured for this tenant' })
        return
      }

      const rawBody = JSON.stringify(req.body)
      const signature = req.headers['x-signature'] as string ||
                       req.headers['x-hub-signature'] as string

      // SECURITY (A4 do relatório): assinatura HMAC é OBRIGATÓRIA em todos os webhooks.
      // Antes: aceitava webhook sem assinatura se webhookSecret não estivesse configurado,
      // o que permitia a atacantes forjar pedidos/cancelamentos.
      if (!credentials.webhookSecret) {
        logger.warn('Webhook rejeitado: tenant sem webhookSecret configurado', { provider, tenantId, traceId, event: 'WEBHOOK_SECRET_MISSING' })
        res.status(503).json({ error: 'Integration not properly configured' })
        return
      }

      if (!signature) {
        logger.warn('Webhook rejeitado: assinatura ausente', { provider, tenantId, traceId, event: 'WEBHOOK_SIGNATURE_MISSING' })
        res.status(401).json({ error: 'Missing signature' })
        return
      }

      const verified = verifyHmacSignature(rawBody, signature, credentials.webhookSecret)
      if (!verified.valid) {
        logger.warn('Webhook rejeitado: assinatura HMAC inválida', { provider, tenantId, traceId, event: 'WEBHOOK_SIGNATURE_INVALID', reason: verified.error })
        res.status(401).json({ error: 'Invalid signature' })
        return
      }

      const payload: WebhookPayload = {
        provider,
        tenantId,
        headers: {
          'content-type': req.headers['content-type'] || '',
          'user-agent': req.headers['user-agent'] || '',
          'x-event-id': req.headers['x-event-id'] as string || '',
          'x-event-type': req.headers['x-event-type'] as string || '',
        },
        body: req.body,
        signature,
        timestamp: new Date().toISOString(),
        rawEvent: req.body,
      }

      const eventId = extractEventId(req.body, provider)
      if (eventId && isIdempotent(eventId, null)) {
        logger.info('Webhook duplicado detectado (idempotência)', { provider, tenantId, eventId, traceId })
        res.status(200).json({ success: true, message: 'Event already processed' })
        return
      }

      logger.info('Processando webhook', { provider, tenantId, eventId, traceId, timestamp: payload.timestamp })

      const result = await integrationBus.processWebhook(provider, payload)

      if (!result.success) {
        logger.error('Falha ao processar webhook', { provider, tenantId, eventId, traceId, error: result.error })
        res.status(500).json({ error: result.error || 'Failed to process webhook' })
        return
      }

      logger.info('Webhook processado com sucesso', { provider, tenantId, eventId: result.event?.id, traceId })

      res.status(200).json({
        success: true,
        eventId: result.event?.id,
        traceId
      })
    } catch (error) {
      logger.error('Erro inesperado no handler de webhook', { provider, tenantId, traceId, error })
      next(error)
    }
  }
}

function getCredentialsForTenant(provider: IntegrationProvider, tenantId: string): IntegrationCredentials | null {
  const credentials = store.getIntegrations(tenantId)
  return credentials.find(c => c.provider === provider) || null
}

function extractEventId(body: unknown, provider: IntegrationProvider): string | null {
  if (!body || typeof body !== 'object') return null

  const obj = body as Record<string, unknown>

  switch (provider) {
    case 'ifood':
      return (obj.id as string) || (obj.orderId as string) || null
    case '99eats':
      return (obj.order_id as string) || (obj.id as string) || null
    case 'rappi':
      return (obj.order_id as string) || (obj.id as string) || null
    default:
      return (obj.id as string) || (obj.event_id as string) || (obj.externalId as string) || null
  }
}

export function createWebhookSignature(secret: string, payload: string): string {
  const timestamp = Date.now()
  const signedPayload = `${timestamp}.${payload}`
  const hash = createHmacSignature(signedPayload, secret)
  return `${timestamp}.${hash}`
}

export function registerWebhookRoutes(router: import('express').Router, rateLimiter?: import('express').RequestHandler): void {
  const providers: IntegrationProvider[] = [
    'ifood', '99eats', 'rappi', 'mercadolivre', 'shopify',
    'woocommerce', 'pagseguro', 'stripe', 'whatsapp'
  ]

  const webhookMiddleware: import('express').RequestHandler[] = []
  if (rateLimiter) webhookMiddleware.push(rateLimiter)

  for (const provider of providers) {
    router.post(
      `/webhook/:provider(${providers.join('|')})`,
      ...webhookMiddleware,
      (req, res, next) => {
        if (req.params.provider !== provider) return next()
        createWebhookHandler(provider)(req, res, next)
      }
    )
  }

  router.get('/webhook/:provider/health', (req, res) => {
    const provider = req.params.provider as IntegrationProvider
    res.json({
      provider,
      status: 'ready',
      timestamp: new Date().toISOString()
    })
  })
}

import { Router } from 'express'
import { integrationBus } from './bus.js'
import { store } from '../infra/store.js'
import { generateApiKey, generateWebhookSecret, hashApiKey } from './security.js'
import type { IntegrationProvider, IntegrationCredentials } from './types.js'
import { logger } from '../shared/logger.js'

const router = Router()

router.get('/providers', (req, res) => {
  const providers = [
    {
      id: 'ifood',
      name: 'iFood',
      description: 'Integração com o maior marketplace de delivery do Brasil',
      icon: '🍔',
      capabilities: ['orders_read', 'orders_update', 'catalog_sync'],
      authType: 'oauth2',
      color: '#EA001E'
    },
    {
      id: '99eats',
      name: '99 Eats',
      description: 'Marketplace de delivery da 99',
      icon: '🚗',
      capabilities: ['orders_read', 'orders_update'],
      authType: 'oauth2',
      color: '#FFD600'
    },
    {
      id: 'rappi',
      name: 'Rappi',
      description: 'Plataforma de delivery e quitanda',
      icon: '🛒',
      capabilities: ['orders_read', 'orders_update', 'catalog_sync'],
      authType: 'oauth2',
      color: '#FF6B35'
    },
    {
      id: 'mercadolivre',
      name: 'Mercado Livre',
      description: 'Integração com Mercado Livre e Mercado Pago',
      icon: '📦',
      capabilities: ['orders_read', 'orders_update', 'inventory_sync'],
      authType: 'oauth2',
      color: '#FFE600'
    },
    {
      id: 'shopify',
      name: 'Shopify',
      description: 'Plataforma de e-commerce',
      icon: '🛍️',
      capabilities: ['orders_read', 'orders_update', 'catalog_sync', 'inventory_sync'],
      authType: 'oauth2',
      color: '#96BF48'
    },
    {
      id: 'woocommerce',
      name: 'WooCommerce',
      description: 'Plugin de e-commerce para WordPress',
      icon: '🛠️',
      capabilities: ['orders_read', 'orders_update', 'catalog_sync'],
      authType: 'apikey',
      color: '#96588A'
    },
    {
      id: 'pagseguro',
      name: 'PagSeguro',
      description: 'Gateway de pagamentos',
      icon: '💳',
      capabilities: ['payments_read', 'payments_write', 'webhooks'],
      authType: 'apikey',
      color: '#00B4EE'
    },
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Plataforma global de pagamentos',
      icon: '💳',
      capabilities: ['payments_read', 'payments_write', 'webhooks'],
      authType: 'apikey',
      color: '#635BFF'
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Integração com WhatsApp Business API',
      icon: '💬',
      capabilities: ['orders_read', 'webhooks'],
      authType: 'apikey',
      color: '#25D366'
    }
  ]

  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const connected = store.getIntegrations(tenantId)

  res.json({
    providers: providers.map(p => ({
      ...p,
      connected: connected.some(c => c.provider === p.id),
      status: connected.find(c => c.provider === p.id)?.environment || null
    }))
  })
})

router.get('/connections', (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const connections = store.getIntegrations(tenantId)

  res.json({
    connections: connections.map(conn => ({
      provider: conn.provider,
      environment: conn.environment,
      connected: conn.accessToken ? true : false,
      expiresAt: conn.expiresAt,
      lastSync: conn.updatedAt,
      createdAt: conn.createdAt
    }))
  })
})

router.post('/connect/:provider', (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const branchId = req.headers['x-branch-id'] as string
  const { provider } = req.params
  const { apiKey, apiSecret, accessToken, refreshToken, environment = 'sandbox' } = req.body

  if (!apiKey && !accessToken) {
    res.status(400).json({ error: 'API key or access token required' })
    return
  }

  const credentials: IntegrationCredentials = {
    provider: provider as IntegrationProvider,
    tenantId,
    branchId,
    apiKey: apiKey,
    apiSecret: apiSecret,
    accessToken: accessToken,
    refreshToken: refreshToken,
    webhookSecret: generateWebhookSecret(),
    environment,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  const existing = store.getIntegrations(tenantId).findIndex(c => c.provider === provider)
  
  if (existing >= 0) {
    const updated = store.updateIntegration(tenantId, provider as IntegrationProvider, credentials)
    if (updated) {
      res.json({
        success: true,
        message: `${provider} connection updated`,
        credentials: {
          provider: credentials.provider,
          environment: credentials.environment,
          webhookSecret: credentials.webhookSecret,
          createdAt: credentials.createdAt
        }
      })
    } else {
      res.status(500).json({ error: 'Failed to update connection' })
    }
  } else {
    const saved = store.saveIntegration(credentials)
    if (saved) {
      res.json({
        success: true,
        message: `${provider} connected successfully`,
        credentials: {
          provider: credentials.provider,
          environment: credentials.environment,
          webhookSecret: credentials.webhookSecret,
          createdAt: credentials.createdAt
        }
      })
    } else {
      res.status(500).json({ error: 'Failed to save connection' })
    }
  }
})

router.delete('/disconnect/:provider', (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const { provider } = req.params

  const disconnected = store.deleteIntegration(tenantId, provider as IntegrationProvider)
  
  if (disconnected) {
    res.json({ success: true, message: `${provider} disconnected` })
  } else {
    res.status(404).json({ error: `${provider} connection not found` })
  }
})

router.get('/webhook-url/:provider', (req, res) => {
  const { provider } = req.params
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  
  const webhookUrl = `/api/v1/integrations/webhook/${provider}?tenantId=${tenantId}`
  
  res.json({
    provider,
    webhookUrl,
    instructions: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId
      }
    }
  })
})

router.post('/sync/:provider', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string || 'default'
  const { provider } = req.params

  const credentials = store.getIntegrations(tenantId).find(c => c.provider === provider)
  
  if (!credentials?.accessToken) {
    res.status(400).json({ error: `${provider} not connected` })
    return
  }

  const since = req.body.since as string | undefined

  try {
    const result = await integrationBus.syncOrders(provider as IntegrationProvider, credentials, since)
    res.json(result)
  } catch (error) {
    res.status(500).json({ 
      error: 'Sync failed',
      message: error instanceof Error ? error.message : String(error)
    })
  }
})

router.get('/events', (req, res) => {
  const provider = req.query.provider as IntegrationProvider | undefined
  const limit = parseInt(req.query.limit as string) || 100
  
  const events = integrationBus.getEventHistory(limit, provider)
  res.json({ events, total: events.length })
})

router.get('/stats', (req, res) => {
  const stats = integrationBus.getStats()
  const dlq = integrationBus.getDeadLetterQueue()
  
  res.json({
    ...stats,
    deadLetterEvents: dlq.slice(-10)
  })
})

router.post('/dlq/:eventId/retry', (req, res) => {
  const { eventId } = req.params
  const retried = integrationBus.retryDeadLetter(eventId)
  
  if (retried) {
    res.json({ success: true, message: 'Event requeued for processing' })
  } else {
    res.status(404).json({ error: 'Event not found in dead letter queue' })
  }
})

export function registerIntegrationRoutes(app: Router): void {
  app.use('/integrations', router)
  logger.debug('Integration routes registered', { path: '/integrations' })
}

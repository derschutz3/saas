export * from './types.js'
export * from './adapter.interface.js'
export * from './bus.js'
export * from './security.js'
export * from './webhook.js'
export * from './base.adapter.js'
export * from './ifood.adapter.js'
export * from './99.adapter.js'
export * from './rappi.adapter.js'

import { integrationBus } from './bus.js'
import { IfoodAdapter } from './ifood.adapter.js'
import { NinetyNineAdapter } from './99.adapter.js'
import { RappiAdapter } from './rappi.adapter.js'
import { logger } from '../shared/logger.js'

export function registerDefaultAdapters(): void {
  integrationBus.registerAdapter(new IfoodAdapter())
  integrationBus.registerAdapter(new NinetyNineAdapter())
  integrationBus.registerAdapter(new RappiAdapter())
  logger.debug('Default adapters registered', { count: 3 })
}

export function initializeIntegrationHandlers(): void {
  integrationBus.subscribe('ORDER_CREATED', async (event) => {
    logger.info('Novo pedido recebido via integração', { provider: event.provider, externalId: event.payload.externalId, tenantId: event.tenantId })
  })

  integrationBus.subscribe('ORDER_ACCEPTED', async (event) => {
    logger.info('Pedido aceito via integração', { provider: event.provider, externalId: event.payload.externalId, tenantId: event.tenantId })
  })

  integrationBus.subscribe('ORDER_CANCELLED', async (event) => {
    logger.info('Pedido cancelado via integração', { provider: event.provider, externalId: event.payload.externalId, tenantId: event.tenantId })
  })

  logger.debug('Default handlers initialized', { count: 3 })
}

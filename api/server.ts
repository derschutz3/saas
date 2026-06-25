/**
 * local server entry file, for local development
 */
import app from './app.js'
import { startFiscalWorker } from './infra/fiscalWorker.js'
import { registerDefaultAdapters, initializeIntegrationHandlers } from './integrations/index.js'
import { logger } from './shared/logger.js'

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001

startFiscalWorker()
registerDefaultAdapters()
initializeIntegrationHandlers()

const server = app.listen(PORT, () => {
  logger.info(`Server ready on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV ?? 'development' })
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received', { signal: 'SIGTERM' })
  server.close(() => {
    logger.info('Server closed', { signal: 'SIGTERM' })
    process.exit(0)
  })
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received', { signal: 'SIGINT' })
  server.close(() => {
    logger.info('Server closed', { signal: 'SIGINT' })
    process.exit(0)
  })
});

export default app;

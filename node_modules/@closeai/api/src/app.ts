import express from 'express'
import { config } from './config'
import { checkDbConnection } from './config/database'
import { logger } from './shared/utils/logger'
import webhookRoutes from './api/routes/webhook.routes'
import { AppError } from './shared/errors/app.error'

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.NODE_ENV })
})

// Rotas
app.use('/webhook', webhookRoutes)

// Error handler global
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code })
    return
  }
  logger.error({ err }, 'Unhandled error')
  res.status(500).json({ error: 'Internal server error' })
})

async function bootstrap() {
  await checkDbConnection()
  logger.info('✅  Database connected')

  app.listen(config.PORT, () => {
    logger.info(`🚀  API running on port ${config.PORT}`)
  })
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start')
  process.exit(1)
})

export default app

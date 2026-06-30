import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Logger } from 'pino'
import { requestLogger } from './middleware/request-logger.ts'
import { healthRoute } from './modules/health/health.route.ts'

export type AppEnv = {
  Variables: {
    requestId: string
    logger: Logger
  }
}

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', secureHeaders())
  app.use('*', cors())
  app.use('*', requestId())
  app.use('*', requestLogger())

  app.route('/health', healthRoute)

  return app
}

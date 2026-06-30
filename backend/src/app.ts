import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Logger } from 'pino'
import { env } from './env.ts'
import { originCheck } from './middleware/origin-check.ts'
import { requestLogger } from './middleware/request-logger.ts'
import { adminRoute } from './modules/auth/admin.route.ts'
import { authRoute } from './modules/auth/auth.route.ts'
import type { Session, User } from './modules/auth/auth.types.ts'
import { meRoute } from './modules/auth/me.route.ts'
import { oauthRoute } from './modules/auth/oauth.route.ts'
import { healthRoute } from './modules/health/health.route.ts'

export type AppEnv = {
  Variables: {
    requestId: string
    logger: Logger
    user?: User
    session?: Session
  }
}

export function createApp() {
  const app = new Hono<AppEnv>({ strict: false })

  app.use('*', secureHeaders())
  app.use(
    '*',
    cors({
      origin: env.PUBLIC_ORIGIN,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  )
  app.use('*', requestId())
  app.use('*', requestLogger())
  app.use('*', originCheck())

  app.route('/health', healthRoute)
  app.route('/api/auth', authRoute)
  app.route('/api/auth/oauth', oauthRoute)
  app.route('/api/me', meRoute)
  app.route('/api/admin', adminRoute)

  return app
}

import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { env } from './env.ts'
import { logger } from './lib/logger.ts'

const app = createApp()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'server started')
})

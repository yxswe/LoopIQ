import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { openDb } from './db/connection.ts'
import { applyMigrations } from './db/migrations.ts'
import { env } from './env.ts'
import { logger } from './lib/logger.ts'
import { cleanupExpiredInvitations } from './modules/auth/invitation.repo.ts'
import { cleanupExpiredSessions } from './modules/auth/session.repo.ts'

openDb(env.DATA_DIR)
applyMigrations(openDb(env.DATA_DIR))

const app = createApp()

setInterval(
  () => {
    const s = cleanupExpiredSessions()
    const i = cleanupExpiredInvitations()
    if (s + i > 0) logger.info({ sessions: s, invitations: i }, 'cleanup tick')
  },
  60 * 60 * 1000,
).unref()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'server started')
})

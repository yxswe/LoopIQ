import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app.ts'
import { env } from '../env.ts'

const PROTECTED = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const EXEMPT_PREFIXES = ['/api/auth/oauth/']

export function originCheck() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!PROTECTED.has(c.req.method)) return next()
    for (const p of EXEMPT_PREFIXES) {
      if (c.req.path.startsWith(p)) return next()
    }
    const origin = c.req.header('origin')
    if (!origin || origin !== env.PUBLIC_ORIGIN) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Bad origin' } }, 403)
    }
    await next()
  })
}

import type { MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import { logger as rootLogger } from '../lib/logger.ts'

type Vars = {
  requestId: string
  logger: Logger
}

export function requestLogger(): MiddlewareHandler<{ Variables: Vars }> {
  return async (c, next) => {
    const requestId = c.get('requestId')
    const child = rootLogger.child({ requestId })
    c.set('logger', child)

    const start = performance.now()
    await next()
    const durationMs = Math.round(performance.now() - start)

    child.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs,
      },
      'request',
    )
  }
}

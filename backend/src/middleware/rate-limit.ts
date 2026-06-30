import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app.ts'

type Bucket = { count: number; windowStart: number }
type Limiter = Map<string, Bucket>

const buckets: Map<string, Limiter> = new Map()

export function resetRateLimit(): void {
  buckets.clear()
}

export type RateLimitOptions = {
  name: string
  max: number
  windowMs: number
}

function getClientIp(c: Context<AppEnv>): string {
  const fwd = c.req.header('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const real = c.req.header('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function rateLimit(opts: RateLimitOptions) {
  const limiter: Limiter = buckets.get(opts.name) ?? new Map()
  buckets.set(opts.name, limiter)

  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = getClientIp(c)
    const now = Date.now()
    let bucket = limiter.get(ip)
    if (!bucket || now - bucket.windowStart > opts.windowMs) {
      bucket = { count: 0, windowStart: now }
      limiter.set(ip, bucket)
    }
    bucket.count++
    if (bucket.count > opts.max) {
      return c.json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Slow down' } }, 429)
    }
    await next()
  })
}

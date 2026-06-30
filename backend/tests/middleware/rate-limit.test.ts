import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../../src/app.ts'
import { rateLimit, resetRateLimit } from '../../src/middleware/rate-limit.ts'

describe('middleware/rate-limit', () => {
  it('allows up to limit, then 429', async () => {
    resetRateLimit()
    const app = new Hono<AppEnv>()
    app.post('/x', rateLimit({ name: 'test', max: 3, windowMs: 60_000 }), (c) =>
      c.json({ ok: true }),
    )

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/x', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.0.0.1' },
      })
      expect(res.status).toBe(200)
    }

    const fourth = await app.request('/x', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })
    expect(fourth.status).toBe(429)
    expect((await fourth.json()).error.code).toBe('TOO_MANY_ATTEMPTS')
  })

  it('different IPs are tracked separately', async () => {
    resetRateLimit()
    const app = new Hono<AppEnv>()
    app.post('/x', rateLimit({ name: 'test2', max: 1, windowMs: 60_000 }), (c) =>
      c.json({ ok: true }),
    )

    const a = await app.request('/x', { method: 'POST', headers: { 'x-forwarded-for': '1.1.1.1' } })
    const b = await app.request('/x', { method: 'POST', headers: { 'x-forwarded-for': '2.2.2.2' } })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
  })
})

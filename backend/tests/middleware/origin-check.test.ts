import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../../src/app.ts'
import { originCheck } from '../../src/middleware/origin-check.ts'

describe('middleware/origin-check', () => {
  function makeApp() {
    const app = new Hono<AppEnv>()
    app.use('*', originCheck())
    app.get('/x', (c) => c.text('get-ok'))
    app.post('/x', (c) => c.text('post-ok'))
    return app
  }

  it('GET is always allowed regardless of Origin', async () => {
    const res = await makeApp().request('/x')
    expect(res.status).toBe(200)
  })

  it('POST without Origin is rejected', async () => {
    const res = await makeApp().request('/x', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('POST with matching Origin is allowed', async () => {
    const res = await makeApp().request('/x', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(res.status).toBe(200)
  })

  it('POST with foreign Origin is rejected', async () => {
    const res = await makeApp().request('/x', {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
    })
    expect(res.status).toBe(403)
  })
})

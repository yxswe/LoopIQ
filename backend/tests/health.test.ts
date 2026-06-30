import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { healthRoute } from '../src/modules/health/health.route.ts'

describe('GET /', () => {
  it('returns ok status with uptime', async () => {
    const res = await healthRoute.request('/')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; uptime: number }
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
  })
})

describe('app: GET /health', () => {
  it('serves /health through createApp with x-request-id header', async () => {
    const res = await createApp().request('/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toBeTruthy()
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('respects an incoming x-request-id header', async () => {
    const res = await createApp().request('/health', {
      headers: { 'x-request-id': 'test-id-123' },
    })
    expect(res.headers.get('x-request-id')).toBe('test-id-123')
  })
})

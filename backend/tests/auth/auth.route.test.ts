import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { authRoute } from '../../src/modules/auth/auth.route.ts'
import { createInvitation } from '../../src/modules/auth/invitation.repo.ts'
import { resetRateLimit } from '../../src/middleware/rate-limit.ts'

describe('auth.route', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-route-'))
    applyMigrations(openDb(dir))
    resetRateLimit()
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /config returns the provider list', async () => {
    const res = await authRoute.request('/config')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers).toContain('password')
  })

  it('POST /signup creates user, returns user + sets cookie', async () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    const res = await authRoute.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        password: 'password123',
        displayName: 'New',
        invitationCode: inv.code,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.email).toBe('new@example.com')
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('loopiq_sid=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('POST /signup rejects with invalid invitation code', async () => {
    const res = await authRoute.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'a@example.com',
        password: 'password123',
        displayName: null,
        invitationCode: 'NONEXISTENT0',
      }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INVITATION_CODE')
  })

  it('POST /signup rejects duplicate email', async () => {
    const inv1 = createInvitation({ createdBy: null, ttlDays: 30 })
    const inv2 = createInvitation({ createdBy: null, ttlDays: 30 })
    await authRoute.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'dup@example.com',
        password: 'password123',
        displayName: null,
        invitationCode: inv1.code,
      }),
    })
    const res = await authRoute.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'dup@example.com',
        password: 'password123',
        displayName: null,
        invitationCode: inv2.code,
      }),
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  it('POST /login: happy path returns user + cookie', async () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    await authRoute.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'logme@example.com',
        password: 'password123',
        displayName: null,
        invitationCode: inv.code,
      }),
    })
    const res = await authRoute.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'logme@example.com', password: 'password123' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('loopiq_sid=')
  })

  it('POST /login: wrong password = 401 INVALID_CREDENTIALS', async () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    await authRoute.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'pw@example.com',
        password: 'rightpassword',
        displayName: null,
        invitationCode: inv.code,
      }),
    })
    const res = await authRoute.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'pw@example.com', password: 'wrongpassword' }),
    })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('POST /login: unknown email = same 401 INVALID_CREDENTIALS', async () => {
    const res = await authRoute.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever' }),
    })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('POST /logout clears the cookie', async () => {
    const res = await authRoute.request('/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

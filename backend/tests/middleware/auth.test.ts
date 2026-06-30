import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppEnv } from '../../src/app.ts'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { requireAdmin, requireAuth } from '../../src/middleware/auth.ts'
import { setRole } from '../../src/modules/auth/user.repo.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'
import { createSession } from '../../src/modules/auth/session.repo.ts'

describe('middleware/auth', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-mw-'))
    applyMigrations(openDb(dir))
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  function makeApp() {
    const app = new Hono<AppEnv>()
    app.get('/me', requireAuth, (c) => c.json({ id: c.get('user')!.id }))
    app.get('/admin', requireAuth, requireAdmin, (c) => c.json({ ok: true }))
    return app
  }

  it('returns 401 without cookie', async () => {
    const res = await makeApp().request('/me')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 with unknown cookie', async () => {
    const res = await makeApp().request('/me', {
      headers: { cookie: 'loopiq_sid=garbage' },
    })
    expect(res.status).toBe(401)
  })

  it('sets c.user when cookie is valid', async () => {
    const u = insertUser({
      email: 'a@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    const { token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    const res = await makeApp().request('/me', {
      headers: { cookie: `loopiq_sid=${token}` },
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { id: string }).id).toBe(u.id)
  })

  it('requireAdmin: 403 for non-admin user', async () => {
    const u = insertUser({
      email: 'b@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    const { token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    const res = await makeApp().request('/admin', {
      headers: { cookie: `loopiq_sid=${token}` },
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('requireAdmin: 200 for admin user', async () => {
    const u = insertUser({
      email: 'c@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    setRole(u.id, 'admin')
    const { token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    const res = await makeApp().request('/admin', {
      headers: { cookie: `loopiq_sid=${token}` },
    })
    expect(res.status).toBe(200)
  })
})

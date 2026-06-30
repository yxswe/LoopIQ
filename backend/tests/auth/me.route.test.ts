import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppEnv } from '../../src/app.ts'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { resetRateLimit } from '../../src/middleware/rate-limit.ts'
import { insertIdentity } from '../../src/modules/auth/identity.repo.ts'
import { meRoute } from '../../src/modules/auth/me.route.ts'
import { hashPassword } from '../../src/modules/auth/password.ts'
import { createSession, listSessionsForUser } from '../../src/modules/auth/session.repo.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'

function appWithSession(token: string) {
  const app = new Hono<AppEnv>()
  app.route('/me', meRoute)
  return (path: string, init: RequestInit = {}) =>
    app.request(`/me${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie: `loopiq_sid=${token}` },
    })
}

describe('me.route', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-me-'))
    applyMigrations(openDb(dir))
    resetRateLimit()
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  async function seed(password = 'password123') {
    const hash = await hashPassword(password)
    const user = insertUser({
      email: 'a@example.com',
      passwordHash: hash,
      displayName: 'Alice',
      role: 'user',
      emailVerified: true,
    })
    insertIdentity({
      userId: user.id,
      provider: 'password',
      subject: 'a@example.com',
      metadata: null,
    })
    const { token, session } = createSession({
      userId: user.id,
      userAgent: 'UA-1',
      ipAddress: '127.0.0.1',
    })
    return { user, token, session, password }
  }

  it('GET / returns user + identities', async () => {
    const { user, token } = await seed()
    const res = await appWithSession(token)('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(user.id)
    expect(body.identities).toEqual([{ provider: 'password', subject: 'a@example.com' }])
  })

  it('POST /password rejects wrong current password', async () => {
    const { token } = await seed()
    const res = await appWithSession(token)('/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpassword123' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_PASSWORD')
  })

  it('POST /password succeeds with correct current password', async () => {
    const { token } = await seed()
    const res = await appWithSession(token)('/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'password123', newPassword: 'newpassword456' }),
    })
    expect(res.status).toBe(204)
  })

  it('GET /sessions lists active sessions and marks current', async () => {
    const { user, token, session } = await seed()
    createSession({ userId: user.id, userAgent: 'UA-2', ipAddress: '10.0.0.1' })
    const res = await appWithSession(token)('/sessions')
    expect(res.status).toBe(200)
    const list = await res.json() as Array<{ id: string; isCurrent: boolean }>
    expect(list).toHaveLength(2)
    const current = list.find((s) => s.id === session.id)
    expect(current?.isCurrent).toBe(true)
  })

  it('DELETE /sessions/:id removes a non-current session', async () => {
    const { user, token } = await seed()
    const other = createSession({ userId: user.id, userAgent: 'UA-2', ipAddress: null })
    const res = await appWithSession(token)(`/sessions/${other.session.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(listSessionsForUser(user.id).map((s) => s.id)).not.toContain(other.session.id)
  })

  it('DELETE /sessions/:current refuses (use /logout instead)', async () => {
    const { token, session } = await seed()
    const res = await appWithSession(token)(`/sessions/${session.id}`, { method: 'DELETE' })
    expect(res.status).toBe(400)
  })
})

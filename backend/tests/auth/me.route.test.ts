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
  // `strict: false` matches the production routing (T23 wires the same way)
  // and lets `/me` collapse to `/me/` so subrouter `.get('/')` works.
  const app = new Hono<AppEnv>({ strict: false })
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

  it('DELETE /sessions/:id refuses to delete a session owned by a different user (IDOR)', async () => {
    // Seed user A and her session (the caller).
    const { token: aliceToken } = await seed()
    // Seed user B (Bob) with a completely separate session — we must NOT use `seed()` again
    // because it always uses 'a@example.com'. Inline the insert.
    const bob = insertUser({
      email: 'b@example.com',
      passwordHash: await hashPassword('password123'),
      displayName: 'Bob',
      role: 'user',
      emailVerified: true,
    })
    const bobSession = createSession({ userId: bob.id, userAgent: 'UA-B', ipAddress: null })

    // Alice tries to delete Bob's session.
    const res = await appWithSession(aliceToken)(`/sessions/${bobSession.session.id}`, {
      method: 'DELETE',
    })

    // Must be 404 (not 204 — that's the bug, and not 400 — that's the self-deletion guard).
    expect(res.status).toBe(404)

    // Bob's session must still exist.
    const bobsSessionsAfter = listSessionsForUser(bob.id).map((s) => s.id)
    expect(bobsSessionsAfter).toContain(bobSession.session.id)
  })

  it('POST /password revokes all other sessions for the user and rotates the caller cookie', async () => {
    const { user, token: oldToken, session: callerSession, password } = await seed()
    // Create a second, independent session for the same user — represents "another device".
    const other = createSession({ userId: user.id, userAgent: 'UA-OTHER', ipAddress: null })

    const res = await appWithSession(oldToken)('/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, newPassword: 'brandnewpw9999' }),
    })

    expect(res.status).toBe(204)

    // Both the original caller session and the other-device session must be gone.
    const remaining = listSessionsForUser(user.id)
    // The route created a fresh session for the caller, so exactly one session should remain.
    expect(remaining).toHaveLength(1)
    expect(remaining.map((s) => s.id)).not.toContain(callerSession.id)
    expect(remaining.map((s) => s.id)).not.toContain(other.session.id)

    // The 204 must have a Set-Cookie header with a NEW session token (cookie name loopiq_sid).
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toMatch(/^loopiq_sid=/)
    const newToken = setCookie!.match(/^loopiq_sid=([^;]+)/)![1]!
    expect(newToken).not.toBe(oldToken)

    // The OLD cookie must no longer authenticate.
    const reuseOld = await appWithSession(oldToken)('/')
    expect(reuseOld.status).toBe(401)

    // The NEW cookie must authenticate.
    const useNew = await appWithSession(newToken)('/')
    expect(useNew.status).toBe(200)
  })
})

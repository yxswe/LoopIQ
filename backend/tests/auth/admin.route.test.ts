import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppEnv } from '../../src/app.ts'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { adminRoute } from '../../src/modules/auth/admin.route.ts'
import { createSession } from '../../src/modules/auth/session.repo.ts'
import { insertUser, setRole } from '../../src/modules/auth/user.repo.ts'

function appWithToken(token: string) {
  const app = new Hono<AppEnv>({ strict: false })
  app.route('/admin', adminRoute)
  return (path: string, init: RequestInit = {}) =>
    app.request(`/admin${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie: `loopiq_sid=${token}` },
    })
}

describe('admin.route', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-adm-'))
    applyMigrations(openDb(dir))
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  function seedNonAdmin() {
    const u = insertUser({
      email: 'u@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    const { token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    return token
  }
  function seedAdmin() {
    const u = insertUser({
      email: 'a@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    setRole(u.id, 'admin')
    const { token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    return token
  }

  it('blocks non-admin: 403', async () => {
    const res = await appWithToken(seedNonAdmin())('/invitations')
    expect(res.status).toBe(403)
  })

  it('admin lists invitations (initially empty)', async () => {
    const res = await appWithToken(seedAdmin())('/invitations')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('admin creates invitations', async () => {
    const fetcher = appWithToken(seedAdmin())
    const res = await fetcher('/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 3, expiresInDays: 7 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ code: string }>
    expect(body).toHaveLength(3)
    for (const inv of body) expect(inv.code).toHaveLength(12)
  })

  it('admin deletes an unused invitation', async () => {
    const fetcher = appWithToken(seedAdmin())
    const created = await (
      await fetcher('/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json() as Array<{ id: string }>
    const id = created[0]!.id
    const del = await fetcher(`/invitations/${id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
  })
})

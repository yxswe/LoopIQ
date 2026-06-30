import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'sec'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/oauth/google/callback'
})

import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { createInvitation } from '../../src/modules/auth/invitation.repo.ts'
import { oauthRoute } from '../../src/modules/auth/oauth.route.ts'

describe('oauth.route — Google', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-oauth-'))
    applyMigrations(openDb(dir))
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'sec'
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('GET /google/start: redirects to Google with a state param', async () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    const res = await oauthRoute.request(`/google/start?invitationCode=${inv.code}`)
    expect(res.status).toBe(302)
    const loc = res.headers.get('location')!
    expect(loc).toContain('accounts.google.com')
    expect(loc).toContain('state=')
  })

  it('GET /google/callback: 400 when state is unknown', async () => {
    const res = await oauthRoute.request('/google/callback?code=X&state=unknown')
    expect(res.status).toBe(400)
  })

  it('GET /google/callback: full flow, creates user + session', async () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    const start = await oauthRoute.request(`/google/start?invitationCode=${inv.code}`)
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!

    const payload = Buffer.from(
      JSON.stringify({
        sub: 'gsub-new',
        email: 'new@google.example',
        name: 'New User',
        picture: 'https://x/y',
      }),
    ).toString('base64url')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id_token: `h.${payload}.s` }), {
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await oauthRoute.request(`/google/callback?code=CODE&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('set-cookie')).toContain('loopiq_sid=')
  })
})

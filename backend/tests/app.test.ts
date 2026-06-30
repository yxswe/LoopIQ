import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { closeDb, openDb } from '../src/db/connection.ts'
import { applyMigrations } from '../src/db/migrations.ts'
import { resetRateLimit } from '../src/middleware/rate-limit.ts'

describe('createApp wiring', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-int-'))
    applyMigrations(openDb(dir))
    resetRateLimit()
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('mounts /health and /api/auth/config', async () => {
    const app = createApp()
    const h = await app.request('/health')
    expect(h.status).toBe(200)
    const cfg = await app.request('/api/auth/config')
    expect(cfg.status).toBe(200)
  })

  it('protects /api/me with requireAuth', async () => {
    const res = await createApp().request('/api/me')
    expect(res.status).toBe(401)
  })

  it('protects /api/admin/invitations with requireAuth + requireAdmin', async () => {
    const res = await createApp().request('/api/admin/invitations')
    expect(res.status).toBe(401)
  })
})

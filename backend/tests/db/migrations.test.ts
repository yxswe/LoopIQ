import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'

describe('db/migrations', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-mig-'))
  })

  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates _migrations table on first run', () => {
    const db = openDb(dir)
    applyMigrations(db)
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .get()
    expect(row).toBeDefined()
  })

  it('creates all v1 tables', () => {
    const db = openDb(dir)
    applyMigrations(db)
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>
    const tableNames = names.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'))
    expect(tableNames).toEqual(
      expect.arrayContaining([
        '_migrations',
        'invitations',
        'sessions',
        'user_identities',
        'users',
      ]),
    )
  })

  it('is idempotent — running twice does not error', () => {
    const db = openDb(dir)
    applyMigrations(db)
    expect(() => applyMigrations(db)).not.toThrow()
    const applied = db.prepare('SELECT COUNT(*) as c FROM _migrations').get() as { c: number }
    expect(applied.c).toBe(1)
  })
})

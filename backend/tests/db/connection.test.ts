import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'

describe('db/connection', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-db-'))
  })

  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('opens a database at DATA_DIR/app.db with WAL pragma', () => {
    const db = openDb(dir)
    const mode = db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
  })

  it('returns the same instance on subsequent calls (singleton)', () => {
    const a = openDb(dir)
    const b = openDb(dir)
    expect(a).toBe(b)
  })
})

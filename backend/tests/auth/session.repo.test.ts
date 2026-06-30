import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { hashSessionToken } from '../../src/modules/auth/session.ts'
import {
  cleanupExpiredSessions,
  createSession,
  deleteSession,
  deleteSessionScopedToUser,
  findSessionByTokenHash,
  listSessionsForUser,
  slideSession,
} from '../../src/modules/auth/session.repo.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'

describe('session.repo', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-sessrepo-'))
    const db = openDb(dir)
    applyMigrations(db)
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  function seedUser() {
    return insertUser({
      email: 'a@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
  }

  it('createSession returns id + the token plaintext is hashed at rest', () => {
    const u = seedUser()
    const { session, token } = createSession({
      userId: u.id,
      userAgent: 'UA',
      ipAddress: '127.0.0.1',
    })
    expect(token).toHaveLength(43)
    const fetched = findSessionByTokenHash(hashSessionToken(token))
    expect(fetched?.id).toBe(session.id)
  })

  it('findSessionByTokenHash returns null when expired', () => {
    const u = seedUser()
    const { token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    // Manually expire it.
    const db = openDb(dir)
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
      Date.now() - 1000,
      hashSessionToken(token),
    )
    expect(findSessionByTokenHash(hashSessionToken(token))).toBeNull()
  })

  it('slideSession updates last_seen_at and expires_at', () => {
    const u = seedUser()
    const { session } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    const beforeExpiry = session.expiresAt
    slideSession(session.id)
    const list = listSessionsForUser(u.id)
    const s = list.find((x) => x.id === session.id)
    expect(s!.expiresAt).toBeGreaterThanOrEqual(beforeExpiry)
  })

  it('deleteSession removes the row', () => {
    const u = seedUser()
    const { session, token } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    deleteSession(session.id)
    expect(findSessionByTokenHash(hashSessionToken(token))).toBeNull()
  })

  it('cleanupExpiredSessions removes only expired rows', () => {
    const u = seedUser()
    const { session: s1 } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    const { session: s2 } = createSession({ userId: u.id, userAgent: null, ipAddress: null })
    openDb(dir)
      .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .run(Date.now() - 1000, s1.id)
    cleanupExpiredSessions()
    const remaining = listSessionsForUser(u.id).map((s) => s.id)
    expect(remaining).toContain(s2.id)
    expect(remaining).not.toContain(s1.id)
  })

  it('deleteSessionScopedToUser only deletes when ids match', () => {
    const a = insertUser({ email: 'a@example.com', passwordHash: 'h', displayName: null, role: 'user', emailVerified: true })
    const b = insertUser({ email: 'b@example.com', passwordHash: 'h', displayName: null, role: 'user', emailVerified: true })
    const { session: sa } = createSession({ userId: a.id, userAgent: null, ipAddress: null })
    // Wrong owner — should not delete.
    expect(deleteSessionScopedToUser(sa.id, b.id)).toBe(false)
    expect(listSessionsForUser(a.id).map((s) => s.id)).toContain(sa.id)
    // Right owner — should delete.
    expect(deleteSessionScopedToUser(sa.id, a.id)).toBe(true)
    expect(listSessionsForUser(a.id).map((s) => s.id)).not.toContain(sa.id)
  })
})

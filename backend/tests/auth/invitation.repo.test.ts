import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import {
  cleanupExpiredInvitations,
  consumeInvitation,
  createInvitation,
  deleteInvitation,
  findInvitationByCode,
  listInvitations,
} from '../../src/modules/auth/invitation.repo.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'

describe('invitation.repo', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-inv-'))
    applyMigrations(openDb(dir))
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('createInvitation + findInvitationByCode round-trip', () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    expect(inv.code).toHaveLength(12)
    expect(findInvitationByCode(inv.code)?.id).toBe(inv.id)
  })

  it('consumeInvitation marks used, returns true; second consume returns false', () => {
    const u = insertUser({
      email: 'a@example.com',
      passwordHash: null,
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    expect(consumeInvitation(inv.code, u.id)).toBe(true)
    expect(consumeInvitation(inv.code, u.id)).toBe(false)
  })

  it('consumeInvitation returns false on unknown code', () => {
    expect(consumeInvitation('NONEXISTENT0', 'anyone')).toBe(false)
  })

  it('consumeInvitation returns false on expired code', () => {
    const u = insertUser({
      email: 'b@example.com',
      passwordHash: null,
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    openDb(dir)
      .prepare('UPDATE invitations SET expires_at = ? WHERE id = ?')
      .run(Date.now() - 1000, inv.id)
    expect(consumeInvitation(inv.code, u.id)).toBe(false)
  })

  it('cleanupExpiredInvitations removes only expired and unused', () => {
    const a = createInvitation({ createdBy: null, ttlDays: 30 })
    const b = createInvitation({ createdBy: null, ttlDays: 30 })
    openDb(dir)
      .prepare('UPDATE invitations SET expires_at = ? WHERE id = ?')
      .run(Date.now() - 1000, a.id)
    cleanupExpiredInvitations()
    expect(findInvitationByCode(a.code)).toBeNull()
    expect(findInvitationByCode(b.code)?.id).toBe(b.id)
  })

  it('listInvitations returns all rows', () => {
    createInvitation({ createdBy: null, ttlDays: 30 })
    createInvitation({ createdBy: null, ttlDays: 30 })
    expect(listInvitations()).toHaveLength(2)
  })

  it('deleteInvitation removes the row', () => {
    const inv = createInvitation({ createdBy: null, ttlDays: 30 })
    deleteInvitation(inv.id)
    expect(findInvitationByCode(inv.code)).toBeNull()
  })
})

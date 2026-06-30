import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import {
  findIdentity,
  insertIdentity,
  listIdentitiesForUser,
  touchIdentity,
} from '../../src/modules/auth/identity.repo.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'

describe('identity.repo', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-id-'))
    applyMigrations(openDb(dir))
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('inserts and looks up by (provider, subject)', () => {
    const u = insertUser({
      email: 'a@example.com',
      passwordHash: null,
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    insertIdentity({
      userId: u.id,
      provider: 'google',
      subject: 'google-sub-123',
      metadata: { foo: 'bar' },
    })
    const id = findIdentity('google', 'google-sub-123')
    expect(id?.userId).toBe(u.id)
    expect(id?.metadata).toEqual({ foo: 'bar' })
  })

  it('rejects duplicate (provider, subject)', () => {
    const u = insertUser({
      email: 'b@example.com',
      passwordHash: null,
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    insertIdentity({ userId: u.id, provider: 'google', subject: 'dup', metadata: null })
    expect(() =>
      insertIdentity({ userId: u.id, provider: 'google', subject: 'dup', metadata: null }),
    ).toThrow()
  })

  it('lists identities for a user', () => {
    const u = insertUser({
      email: 'c@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    insertIdentity({ userId: u.id, provider: 'password', subject: 'c@example.com', metadata: null })
    insertIdentity({ userId: u.id, provider: 'google', subject: 'sub-c', metadata: null })
    const list = listIdentitiesForUser(u.id)
    expect(list.map((i) => i.provider).sort()).toEqual(['google', 'password'])
  })

  it('touchIdentity updates last_used_at', () => {
    const u = insertUser({
      email: 'd@example.com',
      passwordHash: null,
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    insertIdentity({ userId: u.id, provider: 'google', subject: 'sub-d', metadata: null })
    touchIdentity('google', 'sub-d')
    const id = findIdentity('google', 'sub-d')
    expect(id?.lastUsedAt).not.toBeNull()
  })
})

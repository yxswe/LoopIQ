import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import {
  findUserByEmail,
  findUserById,
  insertUser,
  setRole,
  touchLastLogin,
  updatePasswordHash,
} from '../../src/modules/auth/user.repo.ts'

describe('user.repo', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-userrepo-'))
    const db = openDb(dir)
    applyMigrations(db)
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('inserts and round-trips a user', () => {
    const user = insertUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'Alice',
      role: 'user',
      emailVerified: true,
    })
    expect(user.email).toBe('a@example.com')
    expect(user.role).toBe('user')

    const fetched = findUserById(user.id)
    expect(fetched?.id).toBe(user.id)
  })

  it('findUserByEmail returns null for unknown email', () => {
    expect(findUserByEmail('nobody@example.com')).toBeNull()
  })

  it('updatePasswordHash + touchLastLogin + setRole', () => {
    const u = insertUser({
      email: 'b@example.com',
      passwordHash: 'old',
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    updatePasswordHash(u.id, 'new')
    setRole(u.id, 'admin')
    touchLastLogin(u.id)

    const u2 = findUserById(u.id)
    expect(u2?.role).toBe('admin')
    expect(u2?.lastLoginAt).not.toBeNull()
  })

  it('enforces unique email', () => {
    insertUser({
      email: 'dup@example.com',
      passwordHash: null,
      displayName: null,
      role: 'user',
      emailVerified: true,
    })
    expect(() =>
      insertUser({
        email: 'dup@example.com',
        passwordHash: null,
        displayName: null,
        role: 'user',
        emailVerified: true,
      }),
    ).toThrow()
  })
})

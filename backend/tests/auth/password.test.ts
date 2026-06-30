import { describe, expect, it } from 'vitest'
import {
  DUMMY_HASH,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../../src/modules/auth/password.ts'

describe('password', () => {
  it('hashes and verifies a password roundtrip', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('DUMMY_HASH verifies false for any password (used for enumeration protection)', async () => {
    expect(await verifyPassword('anything', DUMMY_HASH)).toBe(false)
  })

  it('rejects too-short passwords', () => {
    expect(validatePasswordStrength('short')).toBe('WEAK_PASSWORD')
  })

  it('rejects too-long passwords (DoS protection)', () => {
    expect(validatePasswordStrength('a'.repeat(73))).toBe('WEAK_PASSWORD')
  })

  it('accepts an 8-character password (no character class rules)', () => {
    expect(validatePasswordStrength('password')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_MAX_AGE_MS,
  shouldSlide,
} from '../../src/modules/auth/session.ts'

describe('session token', () => {
  it('generates a 43-character base64url string (256-bit)', () => {
    const t = generateSessionToken()
    expect(t).toHaveLength(43)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('hashSessionToken returns deterministic sha256 hex', () => {
    expect(hashSessionToken('abc')).toBe(hashSessionToken('abc'))
    expect(hashSessionToken('abc')).not.toBe(hashSessionToken('def'))
    expect(hashSessionToken('abc')).toHaveLength(64)
  })

  it('SESSION_MAX_AGE_MS is 30 days', () => {
    expect(SESSION_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('shouldSlide returns true when last_seen_at is more than 1 day ago', () => {
    const now = Date.now()
    expect(shouldSlide(now - 25 * 60 * 60 * 1000, now)).toBe(true)
    expect(shouldSlide(now - 1000, now)).toBe(false)
  })
})

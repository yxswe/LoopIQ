import { describe, expect, it } from 'vitest'
import { INVITE_ALPHABET, generateInvitationCode } from '../../src/modules/auth/invitation.ts'

describe('invitation', () => {
  it('generates a 12-character code in the readable base32 alphabet', () => {
    const code = generateInvitationCode()
    expect(code).toHaveLength(12)
    for (const ch of code) expect(INVITE_ALPHABET).toContain(ch)
  })

  it('alphabet excludes 0, O, I, 1', () => {
    for (const ch of '0OI1') expect(INVITE_ALPHABET).not.toContain(ch)
  })

  it('generates different codes across calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(generateInvitationCode())
    expect(seen.size).toBe(100)
  })
})

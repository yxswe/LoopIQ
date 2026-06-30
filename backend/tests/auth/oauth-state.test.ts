import { describe, expect, it } from 'vitest'
import {
  consumeOAuthState,
  createOAuthState,
  parkOAuthResult,
  retrieveOAuthResult,
} from '../../src/modules/auth/oauth-state.ts'

describe('oauth-state', () => {
  it('createOAuthState returns a 48-char hex state', () => {
    const s = createOAuthState({ provider: 'google', invitationCode: null })
    expect(s).toMatch(/^[a-f0-9]{48}$/)
  })

  it('consumeOAuthState returns the payload then removes the state', () => {
    const s = createOAuthState({ provider: 'google', invitationCode: 'CODE' })
    const a = consumeOAuthState(s)
    expect(a?.invitationCode).toBe('CODE')
    expect(consumeOAuthState(s)).toBeNull()
  })

  it('consumeOAuthState returns null after TTL', async () => {
    const s = createOAuthState({ provider: 'google', invitationCode: null, ttlMs: 5 })
    await new Promise((r) => setTimeout(r, 20))
    expect(consumeOAuthState(s)).toBeNull()
  })

  it('park + retrieve a result for a state', () => {
    parkOAuthResult('STATE1', { status: 'success', sessionToken: 'tok' })
    expect(retrieveOAuthResult('STATE1')).toEqual({ status: 'success', sessionToken: 'tok' })
    expect(retrieveOAuthResult('STATE1')).toBeNull()
  })
})

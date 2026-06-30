import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/oauth/google/callback'
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { googleProvider } from '../../../src/modules/auth/providers/google.ts'

describe('googleProvider', () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/oauth/google/callback'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('buildAuthorizeUrl produces a v2 OAuth URL with required params', () => {
    const url = new URL(googleProvider.buildAuthorizeUrl('STATE-XYZ'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/oauth/google/callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toContain('email')
    expect(url.searchParams.get('state')).toBe('STATE-XYZ')
  })

  it('exchangeCode returns a normalized profile (mocked fetch)', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'google-sub-1',
        email: 'g@example.com',
        name: 'Goog User',
        picture: 'https://example.com/a.png',
      }),
    ).toString('base64url')
    const idToken = `header.${payload}.sig`

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id_token: idToken, access_token: 'a' }), {
        headers: { 'content-type': 'application/json' },
      }),
    )

    const profile = await googleProvider.exchangeCode('CODE')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(profile.subject).toBe('google-sub-1')
    expect(profile.email).toBe('g@example.com')
    expect(profile.displayName).toBe('Goog User')
    expect(profile.avatarUrl).toBe('https://example.com/a.png')
  })

  it('exchangeCode throws on non-2xx token response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    )
    await expect(googleProvider.exchangeCode('BAD')).rejects.toThrow()
  })
})

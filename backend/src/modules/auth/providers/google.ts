import { env } from '../../../env.ts'
import type { OAuthProvider, ProviderProfile } from './types.ts'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

function decodeIdTokenPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('malformed id_token')
  const json = Buffer.from(parts[1]!, 'base64url').toString('utf8')
  return JSON.parse(json)
}

export const googleProvider: OAuthProvider = {
  name: 'google',
  buildAuthorizeUrl(state) {
    const url = new URL(AUTHORIZE_URL)
    url.searchParams.set('client_id', env.GOOGLE_OAUTH_CLIENT_ID)
    url.searchParams.set('redirect_uri', env.GOOGLE_OAUTH_REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid email profile')
    url.searchParams.set('state', state)
    url.searchParams.set('prompt', 'select_account')
    return url.toString()
  },
  async exchangeCode(code): Promise<ProviderProfile> {
    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      throw new Error(`google token exchange failed: ${res.status}`)
    }
    const json = (await res.json()) as { id_token?: string }
    if (!json.id_token) throw new Error('google response missing id_token')
    const payload = decodeIdTokenPayload(json.id_token)

    const sub = String(payload.sub ?? '')
    if (!sub) throw new Error('google id_token missing sub')

    return {
      provider: 'google',
      subject: sub,
      email: payload.email ? String(payload.email) : null,
      displayName: payload.name ? String(payload.name) : null,
      avatarUrl: payload.picture ? String(payload.picture) : null,
      rawMetadata: payload,
    }
  },
}

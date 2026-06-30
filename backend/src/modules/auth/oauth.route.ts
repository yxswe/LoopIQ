import { type Context, Hono } from 'hono'
import type { AppEnv } from '../../app.ts'
import { env, googleEnabled, wechatEnabled } from '../../env.ts'
import { findIdentity, insertIdentity, touchIdentity } from './identity.repo.ts'
import { consumeInvitation, findInvitationByCode } from './invitation.repo.ts'
import {
  consumeOAuthState,
  createOAuthState,
  parkOAuthResult,
  retrieveOAuthResult,
} from './oauth-state.ts'
import { googleProvider } from './providers/google.ts'
import type { OAuthProvider, ProviderProfile } from './providers/types.ts'
import { wechatProvider } from './providers/wechat.ts'
import { createSession } from './session.repo.ts'
import { buildSessionCookie } from './session.ts'
import { findUserByEmail, insertUser, touchLastLogin } from './user.repo.ts'

// Given a provider profile, returns an existing user or creates a fresh one
// (consuming the invitationCode in the latter case).
async function findOrCreateUser(
  profile: ProviderProfile,
  invitationCode: string | null,
): Promise<{ userId: string; created: boolean } | { error: string }> {
  const existing = findIdentity(profile.provider, profile.subject)
  if (existing) {
    touchIdentity(profile.provider, profile.subject)
    return { userId: existing.userId, created: false }
  }

  // First-time OAuth user — invitation code required.
  if (!invitationCode) return { error: 'INVALID_INVITATION_CODE' }
  const inv = findInvitationByCode(invitationCode)
  if (!inv || inv.usedBy || inv.expiresAt <= Date.now()) {
    return { error: 'INVALID_INVITATION_CODE' }
  }

  // Optional: if profile.email matches an existing local user, do NOT auto-merge
  // (that's an account-takeover vector); refuse and let the user sign in with
  // password first, then bind. For MVP — refuse with a clear code.
  if (profile.email && findUserByEmail(profile.email)) {
    return { error: 'EMAIL_ALREADY_REGISTERED' }
  }

  const user = insertUser({
    email: profile.email,
    passwordHash: null,
    displayName: profile.displayName,
    role: 'user',
    emailVerified: true,
  })
  insertIdentity({
    userId: user.id,
    provider: profile.provider,
    subject: profile.subject,
    metadata: profile.rawMetadata,
  })
  const consumed = consumeInvitation(invitationCode, user.id)
  if (!consumed) return { error: 'INVALID_INVITATION_CODE' }
  return { userId: user.id, created: true }
}

async function completeOAuthLogin(
  provider: OAuthProvider,
  code: string,
  state: string,
  c: Context<AppEnv>,
): Promise<{ ok: true; sessionToken: string } | { ok: false; status: 400 | 502; code: string }> {
  const payload = consumeOAuthState(state)
  if (!payload || payload.provider !== provider.name) {
    return { ok: false, status: 400, code: 'INVALID_OAUTH_STATE' }
  }
  let profile: ProviderProfile
  try {
    profile = await provider.exchangeCode(code)
  } catch (_) {
    return { ok: false, status: 502, code: 'OAUTH_EXCHANGE_FAILED' }
  }
  const result = await findOrCreateUser(profile, payload.invitationCode)
  if ('error' in result) return { ok: false, status: 400, code: result.error }

  const { token } = createSession({
    userId: result.userId,
    userAgent: c.req.header('user-agent') ?? null,
    ipAddress: c.req.header('x-forwarded-for') ?? null,
  })
  touchLastLogin(result.userId)
  return { ok: true, sessionToken: token }
}

// Note: `env` is imported above so the dev-mode allowance flows; explicit usage
// is in app.ts session cookie wiring. Reference here keeps the import live for
// future per-route checks like Origin allowlists.
void env

export const oauthRoute = new Hono<AppEnv>()
  // ────── Google ──────
  .get('/google/start', (c) => {
    if (!googleEnabled) return c.json({ error: { code: 'PROVIDER_DISABLED', message: 'Google not configured' } }, 400)
    const invitationCode = c.req.query('invitationCode') ?? null
    const state = createOAuthState({ provider: 'google', invitationCode })
    return c.redirect(googleProvider.buildAuthorizeUrl(state), 302)
  })
  .get('/google/callback', async (c) => {
    if (!googleEnabled) return c.json({ error: { code: 'PROVIDER_DISABLED', message: 'Google not configured' } }, 400)
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) {
      return c.json({ error: { code: 'INVALID_OAUTH_CALLBACK', message: 'Missing code/state' } }, 400)
    }
    const r = await completeOAuthLogin(googleProvider, code, state, c)
    if (!r.ok) return c.json({ error: { code: r.code, message: r.code } }, r.status)
    c.header('set-cookie', buildSessionCookie(r.sessionToken))
    return c.redirect('/', 302)
  })
  // ────── WeChat ──────
  .get('/wechat/qr', (c) => {
    if (!wechatEnabled) return c.json({ error: { code: 'PROVIDER_DISABLED', message: 'WeChat not configured' } }, 400)
    const invitationCode = c.req.query('invitationCode') ?? null
    const state = createOAuthState({ provider: 'wechat', invitationCode })
    parkOAuthResult(state, { status: 'pending' })
    return c.json({
      qrUrl: wechatProvider.buildAuthorizeUrl(state),
      state,
      expiresAt: Date.now() + 10 * 60_000,
    })
  })
  .get('/wechat/callback', async (c) => {
    if (!wechatEnabled) return c.html('<!doctype html><p>WeChat not configured.</p>', 400)
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) {
      return c.html('<!doctype html><p>Missing parameters.</p>', 400)
    }
    const r = await completeOAuthLogin(wechatProvider, code, state, c)
    if (!r.ok) {
      parkOAuthResult(state, { status: 'expired' })
      return c.html('<!doctype html><p>Authentication failed. Return to PC and try again.</p>', 400)
    }
    parkOAuthResult(state, { status: 'success', sessionToken: r.sessionToken })
    return c.html('<!doctype html><p>✓ Scanned. Return to your computer to continue.</p>')
  })
  .get('/wechat/poll/:state', (c) => {
    const state = c.req.param('state')
    const result = retrieveOAuthResult(state)
    if (!result) return c.json({ status: 'expired' })
    if (result.status === 'success') {
      c.header('set-cookie', buildSessionCookie(result.sessionToken))
    }
    return c.json({ status: result.status })
  })

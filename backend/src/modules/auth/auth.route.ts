import { zValidator } from '@hono/zod-validator'
import { parseCookie } from 'cookie'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app.ts'
import { env, googleEnabled, wechatEnabled } from '../../env.ts'
import { rateLimit } from '../../middleware/rate-limit.ts'
import { insertIdentity } from './identity.repo.ts'
import { consumeInvitation, findInvitationByCode } from './invitation.repo.ts'
import {
  DUMMY_HASH,
  hashPassword,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from './password.ts'
import {
  createSession,
  deleteSession,
  findSessionByTokenHash,
} from './session.repo.ts'
import {
  buildClearCookie,
  buildSessionCookie,
  hashSessionToken,
} from './session.ts'
import {
  findUserByEmail,
  getPasswordHash,
  insertUser,
  touchLastLogin,
  updatePasswordHash,
} from './user.repo.ts'

const signupBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
  displayName: z.string().min(1).max(100).nullable().optional(),
  invitationCode: z.string().min(1).max(40),
})

const loginBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
})

const limitSignup = rateLimit({ name: 'signup', max: 5, windowMs: 5 * 60_000 })
const limitLogin = rateLimit({ name: 'login', max: 10, windowMs: 5 * 60_000 })

export const authRoute = new Hono<AppEnv>()
  .get('/config', (c) => {
    const providers: string[] = ['password']
    if (googleEnabled) providers.push('google')
    if (wechatEnabled) providers.push('wechat')
    return c.json({ providers })
  })
  .post('/signup', limitSignup, zValidator('json', signupBody), async (c) => {
    const { email, password, displayName, invitationCode } = c.req.valid('json')

    const strength = validatePasswordStrength(password)
    if (strength) return c.json({ error: { code: strength, message: 'Weak password' } }, 400)

    const inv = findInvitationByCode(invitationCode)
    if (!inv || inv.usedBy || inv.expiresAt <= Date.now()) {
      return c.json(
        { error: { code: 'INVALID_INVITATION_CODE', message: 'Invitation invalid' } },
        400,
      )
    }

    if (findUserByEmail(email)) {
      return c.json(
        { error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Email already registered' } },
        409,
      )
    }

    const hash = await hashPassword(password)
    const user = insertUser({
      email,
      passwordHash: hash,
      displayName: displayName ?? null,
      role: 'user',
      emailVerified: true,
    })
    insertIdentity({ userId: user.id, provider: 'password', subject: email, metadata: null })

    const consumed = consumeInvitation(invitationCode, user.id)
    if (!consumed) {
      return c.json(
        { error: { code: 'INVALID_INVITATION_CODE', message: 'Invitation already consumed' } },
        400,
      )
    }

    const { token } = createSession({
      userId: user.id,
      userAgent: c.req.header('user-agent') ?? null,
      ipAddress: c.req.header('x-forwarded-for') ?? null,
    })
    touchLastLogin(user.id)
    c.header('set-cookie', buildSessionCookie(token))
    return c.json({ user })
  })
  .post('/login', limitLogin, zValidator('json', loginBody), async (c) => {
    const { email, password } = c.req.valid('json')

    const user = findUserByEmail(email)
    const hash = user ? getPasswordHash(user.id) : null

    // Constant-time path: always run argon2.verify even if user is absent
    const ok = await verifyPassword(password, hash ?? DUMMY_HASH)
    if (!user || !hash || !ok) {
      return c.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password incorrect' } },
        401,
      )
    }

    if (needsRehash(hash)) {
      updatePasswordHash(user.id, await hashPassword(password))
    }

    const { token } = createSession({
      userId: user.id,
      userAgent: c.req.header('user-agent') ?? null,
      ipAddress: c.req.header('x-forwarded-for') ?? null,
    })
    touchLastLogin(user.id)
    c.header('set-cookie', buildSessionCookie(token))
    return c.json({ user })
  })
  .post('/logout', async (c) => {
    const cookies = parseCookie(c.req.header('cookie') ?? '')
    const token = cookies[env.SESSION_COOKIE_NAME]
    if (token) {
      const s = findSessionByTokenHash(hashSessionToken(token))
      if (s) deleteSession(s.id)
    }
    c.header('set-cookie', buildClearCookie())
    return c.json({ ok: true })
  })

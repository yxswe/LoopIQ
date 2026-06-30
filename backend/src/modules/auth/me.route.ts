import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app.ts'
import { rateLimit } from '../../middleware/rate-limit.ts'
import { requireAuth } from '../../middleware/auth.ts'
import { listIdentitiesForUser } from './identity.repo.ts'
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from './password.ts'
import {
  createSession,
  deleteSessionScopedToUser,
  deleteSessionsForUser,
  listSessionsForUser,
} from './session.repo.ts'
import { buildSessionCookie } from './session.ts'
import { getPasswordHash, updatePasswordHash, touchLastLogin } from './user.repo.ts'

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(255),
  newPassword: z.string().min(1).max(255),
})

const limitPassword = rateLimit({ name: 'me.password', max: 5, windowMs: 5 * 60_000 })

export const meRoute = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/', (c) => {
    const user = c.get('user')!
    const identities = listIdentitiesForUser(user.id).map((i) => ({
      provider: i.provider,
      subject: i.subject,
    }))
    return c.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      identities,
    })
  })
  .post('/password', limitPassword, zValidator('json', passwordBody), async (c) => {
    const user = c.get('user')!
    const { currentPassword, newPassword } = c.req.valid('json')

    const strength = validatePasswordStrength(newPassword)
    if (strength) return c.json({ error: { code: strength, message: 'Weak password' } }, 400)

    const hash = getPasswordHash(user.id)
    if (!hash || !(await verifyPassword(currentPassword, hash))) {
      return c.json({ error: { code: 'INVALID_PASSWORD', message: 'Current password wrong' } }, 400)
    }

    updatePasswordHash(user.id, await hashPassword(newPassword))
    // Revoke all existing sessions to invalidate any stolen tokens, then issue
    // a fresh session for the caller. Mirrors scripts/reset-password.ts.
    deleteSessionsForUser(user.id)
    const { token } = createSession({
      userId: user.id,
      userAgent: c.req.header('user-agent') ?? null,
      ipAddress: c.req.header('x-forwarded-for') ?? null,
    })
    touchLastLogin(user.id)
    c.header('set-cookie', buildSessionCookie(token))
    return c.body(null, 204)
  })
  .get('/sessions', (c) => {
    const user = c.get('user')!
    const session = c.get('session')!
    const list = listSessionsForUser(user.id).map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      isCurrent: s.id === session.id,
    }))
    return c.json(list)
  })
  .delete('/sessions/:id', (c) => {
    const user = c.get('user')!
    const session = c.get('session')!
    const targetId = c.req.param('id')
    if (targetId === session.id) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Use /logout to end the current session' } },
        400,
      )
    }
    const deleted = deleteSessionScopedToUser(targetId, user.id)
    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404)
    }
    return new Response(null, { status: 204 })
  })

import { parseCookie } from 'cookie'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app.ts'
import { env } from '../env.ts'
import { findSessionByTokenHash, slideSession } from '../modules/auth/session.repo.ts'
import { hashSessionToken, shouldSlide } from '../modules/auth/session.ts'
import { findUserById } from '../modules/auth/user.repo.ts'

function unauthorized(c: Context<AppEnv>) {
  return c.json({ error: { code: 'UNAUTHORIZED', message: 'Login required' } }, 401)
}

function forbidden(c: Context<AppEnv>) {
  return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient privilege' } }, 403)
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const cookieHeader = c.req.header('cookie') ?? ''
  const cookies = parseCookie(cookieHeader)
  const token = cookies[env.SESSION_COOKIE_NAME]
  if (!token) return unauthorized(c)

  const session = findSessionByTokenHash(hashSessionToken(token))
  if (!session) return unauthorized(c)

  const user = findUserById(session.userId)
  if (!user) return unauthorized(c)

  if (shouldSlide(session.lastSeenAt)) slideSession(session.id)

  c.set('user', user)
  c.set('session', session)
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user')
  if (!user) return unauthorized(c)
  if (user.role !== 'admin') return forbidden(c)
  await next()
})

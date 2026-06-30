import { createHash, randomBytes } from 'node:crypto'
import { stringifySetCookie } from 'cookie'
import { env, isDev } from '../../env.ts'

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const SLIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function shouldSlide(lastSeenAt: number, now: number = Date.now()): boolean {
  return now - lastSeenAt > SLIDE_THRESHOLD_MS
}

export function buildSessionCookie(token: string): string {
  return stringifySetCookie({
    name: env.SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  })
}

export function buildClearCookie(): string {
  return stringifySetCookie({
    name: env.SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

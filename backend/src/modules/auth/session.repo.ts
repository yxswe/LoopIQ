import { getDb } from '../../db/connection.ts'
import { newId } from '../../db/id.ts'
import { type Session, type SessionRow } from './auth.types.ts'
import { SESSION_MAX_AGE_MS, generateSessionToken, hashSessionToken } from './session.ts'

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
  }
}

export type CreateSessionInput = {
  userId: string
  userAgent: string | null
  ipAddress: string | null
}

export function createSession(input: CreateSessionInput): { session: Session; token: string } {
  const id = newId()
  const token = generateSessionToken()
  const tokenHash = hashSessionToken(token)
  const now = Date.now()
  const expiresAt = now + SESSION_MAX_AGE_MS

  getDb()
    .prepare(
      `INSERT INTO sessions
         (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, tokenHash, input.userId, now, expiresAt, now, input.userAgent, input.ipAddress)

  return {
    session: {
      id,
      userId: input.userId,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    },
    token,
  }
}

export function findSessionByTokenHash(tokenHash: string): Session | null {
  const row = getDb()
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(tokenHash, Date.now()) as SessionRow | undefined
  return row ? mapSession(row) : null
}

export function slideSession(sessionId: string): void {
  const now = Date.now()
  getDb()
    .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
    .run(now, now + SESSION_MAX_AGE_MS, sessionId)
}

export function deleteSession(sessionId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

export function deleteSessionScopedToUser(sessionId: string, userId: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
    .run(sessionId, userId)
  return result.changes > 0
}

export function deleteSessionsForUser(userId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function listSessionsForUser(userId: string): Session[] {
  const rows = getDb()
    .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
    .all(userId) as SessionRow[]
  return rows.map(mapSession)
}

export function cleanupExpiredSessions(): number {
  const result = getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  return result.changes
}

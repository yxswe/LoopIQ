import { getDb } from '../../db/connection.ts'
import { newId } from '../../db/id.ts'
import { type Identity, type IdentityRow, type Provider } from './auth.types.ts'

function mapIdentity(row: IdentityRow): Identity {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    subject: row.subject,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export type InsertIdentityInput = {
  userId: string
  provider: Provider
  subject: string
  metadata: unknown
}

export function insertIdentity(input: InsertIdentityInput): Identity {
  const id = newId()
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO user_identities (id, user_id, provider, subject, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      input.provider,
      input.subject,
      input.metadata == null ? null : JSON.stringify(input.metadata),
      now,
    )
  return {
    id,
    userId: input.userId,
    provider: input.provider,
    subject: input.subject,
    metadata: input.metadata ?? null,
    createdAt: now,
    lastUsedAt: null,
  }
}

export function findIdentity(provider: Provider, subject: string): Identity | null {
  const row = getDb()
    .prepare('SELECT * FROM user_identities WHERE provider = ? AND subject = ?')
    .get(provider, subject) as IdentityRow | undefined
  return row ? mapIdentity(row) : null
}

export function listIdentitiesForUser(userId: string): Identity[] {
  const rows = getDb()
    .prepare('SELECT * FROM user_identities WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId) as IdentityRow[]
  return rows.map(mapIdentity)
}

export function touchIdentity(provider: Provider, subject: string): void {
  getDb()
    .prepare('UPDATE user_identities SET last_used_at = ? WHERE provider = ? AND subject = ?')
    .run(Date.now(), provider, subject)
}

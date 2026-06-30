import { getDb } from '../../db/connection.ts'
import { newId } from '../../db/id.ts'
import { type Invitation, type InvitationRow } from './auth.types.ts'
import { generateInvitationCode } from './invitation.ts'

function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    code: row.code,
    createdBy: row.created_by,
    usedBy: row.used_by,
    usedAt: row.used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

export type CreateInvitationInput = {
  createdBy: string | null
  ttlDays: number
}

export function createInvitation(input: CreateInvitationInput): Invitation {
  const id = newId()
  const code = generateInvitationCode()
  const now = Date.now()
  const expiresAt = now + input.ttlDays * 24 * 60 * 60 * 1000
  getDb()
    .prepare(
      `INSERT INTO invitations (id, code, created_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, code, input.createdBy, expiresAt, now)
  return { id, code, createdBy: input.createdBy, usedBy: null, usedAt: null, expiresAt, createdAt: now }
}

export function findInvitationByCode(code: string): Invitation | null {
  const row = getDb().prepare('SELECT * FROM invitations WHERE code = ?').get(code) as
    | InvitationRow
    | undefined
  return row ? mapInvitation(row) : null
}

/**
 * Atomically marks an invitation as consumed.
 * Returns true on success; false if not found / expired / already used.
 */
export function consumeInvitation(code: string, usedByUserId: string): boolean {
  const now = Date.now()
  const result = getDb()
    .prepare(
      `UPDATE invitations
         SET used_by = ?, used_at = ?
       WHERE code = ?
         AND used_by IS NULL
         AND expires_at > ?`,
    )
    .run(usedByUserId, now, code, now)
  return result.changes === 1
}

export function listInvitations(): Invitation[] {
  const rows = getDb()
    .prepare('SELECT * FROM invitations ORDER BY created_at DESC')
    .all() as InvitationRow[]
  return rows.map(mapInvitation)
}

export function deleteInvitation(id: string): void {
  getDb().prepare('DELETE FROM invitations WHERE id = ? AND used_by IS NULL').run(id)
}

export function cleanupExpiredInvitations(): number {
  const result = getDb()
    .prepare('DELETE FROM invitations WHERE expires_at <= ? AND used_by IS NULL')
    .run(Date.now())
  return result.changes
}

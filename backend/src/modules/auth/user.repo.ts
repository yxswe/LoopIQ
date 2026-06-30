import { getDb } from '../../db/connection.ts'
import { newId } from '../../db/id.ts'
import { type Role, type User, type UserRow, mapUser } from './auth.types.ts'

export type InsertUserInput = {
  email: string | null
  passwordHash: string | null
  displayName: string | null
  role: Role
  emailVerified: boolean
}

export function insertUser(input: InsertUserInput): User {
  const id = newId()
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO users (id, email, email_verified, password_hash, display_name, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.email,
      input.emailVerified ? 1 : 0,
      input.passwordHash,
      input.displayName,
      input.role,
      now,
    )
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow
  return mapUser(row)
}

export function findUserById(id: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? mapUser(row) : null
}

export function findUserByEmail(email: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined
  return row ? mapUser(row) : null
}

export function getPasswordHash(userId: string): string | null {
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    | { password_hash: string | null }
    | undefined
  return row?.password_hash ?? null
}

export function updatePasswordHash(userId: string, newHash: string): void {
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId)
}

export function setRole(userId: string, role: Role): void {
  getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
}

export function touchLastLogin(userId: string): void {
  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), userId)
}

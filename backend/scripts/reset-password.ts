import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { openDb } from '../src/db/connection.ts'
import { applyMigrations } from '../src/db/migrations.ts'
import { env } from '../src/env.ts'
import { insertIdentity, listIdentitiesForUser } from '../src/modules/auth/identity.repo.ts'
import { hashPassword, validatePasswordStrength } from '../src/modules/auth/password.ts'
import { deleteSessionsForUser } from '../src/modules/auth/session.repo.ts'
import { findUserByEmail, updatePasswordHash } from '../src/modules/auth/user.repo.ts'

function usage(): never {
  console.error('usage: bun run reset-password <email>')
  process.exit(1)
}

async function main() {
  const email = process.argv[2]
  if (!email) usage()

  const db = openDb(env.DATA_DIR)
  applyMigrations(db)

  const user = findUserByEmail(email)
  if (!user) {
    console.error(`no user with email ${email}`)
    process.exit(1)
  }

  const rl = createInterface({ input: stdin, output: stdout })
  const pw1 = await rl.question('new password: ')
  const pw2 = await rl.question('confirm: ')
  rl.close()

  if (pw1 !== pw2) {
    console.error('mismatch')
    process.exit(1)
  }
  if (validatePasswordStrength(pw1)) {
    console.error('weak password (must be 8–72 chars)')
    process.exit(1)
  }

  const hash = await hashPassword(pw1)
  updatePasswordHash(user.id, hash)

  // Ensure a 'password' identity exists so the user can log in via /api/auth/login.
  const identities = listIdentitiesForUser(user.id)
  if (!identities.some((i) => i.provider === 'password')) {
    if (!user.email) {
      console.error('user has no email — cannot create password identity')
      process.exit(1)
    }
    insertIdentity({ userId: user.id, provider: 'password', subject: user.email, metadata: null })
  }

  // Invalidate every session for safety.
  deleteSessionsForUser(user.id)
  console.log(`✓ password reset for ${email}, all sessions invalidated`)
}

main()

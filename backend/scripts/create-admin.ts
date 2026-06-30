import { openDb } from '../src/db/connection.ts'
import { applyMigrations } from '../src/db/migrations.ts'
import { env } from '../src/env.ts'
import { createInvitation } from '../src/modules/auth/invitation.repo.ts'
import { findUserByEmail, insertUser, setRole } from '../src/modules/auth/user.repo.ts'

function usage(): never {
  console.error('usage: bun run create-admin <email>')
  process.exit(1)
}

const email = process.argv[2]
if (!email) usage()

const db = openDb(env.DATA_DIR)
applyMigrations(db)

let user = findUserByEmail(email)
if (user) {
  setRole(user.id, 'admin')
  console.log(`promoted existing user ${email} to admin (id=${user.id})`)
} else {
  user = insertUser({
    email,
    passwordHash: null,
    displayName: null,
    role: 'user',
    emailVerified: true,
  })
  setRole(user.id, 'admin')
  console.log(`created admin user ${email} (id=${user.id})`)
}

const inv = createInvitation({ createdBy: user.id, ttlDays: 30 })
console.log(`invitation code: ${inv.code}  (expires in 30 days)`)

console.log('')
console.log('Next step:')
console.log(`  bun run reset-password ${email}`)
console.log("to set this admin's password.")

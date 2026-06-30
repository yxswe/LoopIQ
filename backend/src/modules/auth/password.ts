import argon2 from 'argon2'

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

// A constant pre-computed hash used to keep login response time uniform
// whether or not the user exists. Generated once at module load.
export const DUMMY_HASH: string = await argon2.hash('dummy-password-for-timing-only', ARGON_OPTIONS)

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON_OPTIONS)
}

export function validatePasswordStrength(plain: string): 'WEAK_PASSWORD' | null {
  if (plain.length < 8 || plain.length > 72) return 'WEAK_PASSWORD'
  return null
}

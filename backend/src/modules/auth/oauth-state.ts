import { randomBytes } from 'node:crypto'
import type { Provider } from './auth.types.ts'

type StatePayload = {
  provider: Provider
  invitationCode: string | null
  expiresAt: number
}

type ParkedResult =
  | { status: 'pending' }
  | { status: 'success'; sessionToken: string }
  | { status: 'expired' }

const states = new Map<string, StatePayload>()
const parked = new Map<string, ParkedResult>()

const DEFAULT_TTL_MS = 10 * 60_000

export type CreateOAuthStateInput = {
  provider: Provider
  invitationCode: string | null
  ttlMs?: number
}

export function createOAuthState(input: CreateOAuthStateInput): string {
  const state = randomBytes(24).toString('hex')
  states.set(state, {
    provider: input.provider,
    invitationCode: input.invitationCode,
    expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  })
  return state
}

export function consumeOAuthState(state: string): StatePayload | null {
  const payload = states.get(state)
  states.delete(state)
  if (!payload || payload.expiresAt <= Date.now()) return null
  return payload
}

export function parkOAuthResult(state: string, result: ParkedResult): void {
  parked.set(state, result)
}

export function retrieveOAuthResult(state: string): ParkedResult | null {
  const r = parked.get(state)
  parked.delete(state)
  return r ?? null
}

export function cleanupOAuthState(): void {
  const now = Date.now()
  for (const [k, v] of states.entries()) if (v.expiresAt <= now) states.delete(k)
}

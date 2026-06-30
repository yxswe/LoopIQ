import { randomInt } from 'node:crypto'

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInvitationCode(): string {
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]
  }
  return out
}

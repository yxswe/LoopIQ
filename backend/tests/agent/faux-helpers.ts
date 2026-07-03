import type { StreamFn } from '@earendil-works/pi-agent-core'
import { createFauxCore, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux'
import { createSession } from '../../src/modules/auth/session.repo.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'

/** Build a faux runtime that replies with a fixed assistant message for each turn. */
export function makeFauxRuntime(replies: string[] = ['Hello there']) {
  const faux = createFauxCore({ models: [{ id: 'faux-1', name: 'Faux' }] })
  faux.setResponses(replies.map((t) => fauxAssistantMessage(t)))
  return {
    streamFn: faux.streamSimple as unknown as StreamFn,
    model: faux.getModel(),
    faux,
  }
}

/** Create a user + login session and return the userId and a Cookie header value. */
export function makeUserCookie(email = 'a@example.com') {
  const user = insertUser({
    email,
    passwordHash: 'h',
    displayName: null,
    role: 'user',
    emailVerified: true,
  })
  const { token } = createSession({ userId: user.id, userAgent: null, ipAddress: null })
  return { userId: user.id, cookie: `loopiq_sid=${token}` }
}

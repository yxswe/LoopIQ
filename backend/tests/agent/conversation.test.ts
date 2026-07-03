import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { newId } from '../../src/db/id.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { insertConversation, listEntryRows } from '../../src/modules/agent/conversation.repo.ts'
import { LiveConversation } from '../../src/modules/agent/conversation.ts'
import { makeFauxRuntime, makeUserCookie } from './faux-helpers.ts'

describe('agent/LiveConversation', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-agent-'))
    applyMigrations(openDb(dir))
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('runs a prompt, emits events, and persists user + assistant messages', async () => {
    const { userId } = makeUserCookie()
    const convId = newId()
    insertConversation({ id: convId, userId, name: null })

    const { streamFn, model } = makeFauxRuntime(['Hello there'])
    const lc = await LiveConversation.open({ conversationId: convId, streamFn, model })

    const events: AgentEvent[] = []
    lc.subscribe((e) => events.push(e))

    await lc.prompt('hi')
    await lc.waitForIdle()

    // Live events were observed (at least the assistant message finished).
    expect(events.some((e) => e.type === 'message_end')).toBe(true)

    // Persistence: one user message entry + one assistant message entry.
    const messageRows = listEntryRows(convId).filter((r) => r.type === 'message')
    const roles = messageRows.map((r) => JSON.parse(r.payload_json).message.role)
    expect(roles).toEqual(['user', 'assistant'])
    const assistant = JSON.parse(messageRows[1].payload_json).message
    expect(assistant.content[0].text).toBe('Hello there')
  })

  it('cold-reopens with prior transcript seeded into the agent context', async () => {
    const { userId } = makeUserCookie()
    const convId = newId()
    insertConversation({ id: convId, userId, name: null })

    const first = makeFauxRuntime(['first reply'])
    const lc1 = await LiveConversation.open({
      conversationId: convId,
      streamFn: first.streamFn,
      model: first.model,
    })
    await lc1.prompt('hi')
    await lc1.waitForIdle()

    // Reopen and send a second prompt; both turns' messages persist in order.
    const second = makeFauxRuntime(['second reply'])
    const lc2 = await LiveConversation.open({
      conversationId: convId,
      streamFn: second.streamFn,
      model: second.model,
    })
    await lc2.prompt('again')
    await lc2.waitForIdle()

    const roles = listEntryRows(convId)
      .filter((r) => r.type === 'message')
      .map((r) => JSON.parse(r.payload_json).message.role)
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant'])
  })
})

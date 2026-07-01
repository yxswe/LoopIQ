import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemorySessionRepo, type SessionStorage, type SessionTreeEntry } from '@earendil-works/pi-agent-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { newId } from '../../src/db/id.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { insertConversation } from '../../src/modules/agent/conversation.repo.ts'
import { ConversationStorage } from '../../src/modules/agent/conversation.storage.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'

// Drives an identical operation script against both storages and asserts equal observable state.
async function runScript(storage: SessionStorage) {
  const a: SessionTreeEntry = { type: 'message', id: 'a', parentId: null, timestamp: '2026-01-01T00:00:00.000Z', message: { role: 'user', content: 'hi', timestamp: 1 } as never }
  const b: SessionTreeEntry = { type: 'message', id: 'b', parentId: 'a', timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'yo' }], stopReason: 'stop', timestamp: 2 } as never }
  const label: SessionTreeEntry = { type: 'label', id: 'l1', parentId: 'b', timestamp: '2026-01-01T00:00:02.000Z', targetId: 'a', label: 'greeting' }
  await storage.appendEntry(a)
  await storage.appendEntry(b)
  await storage.appendEntry(label)
}

async function snapshot(storage: SessionStorage) {
  const leafId = await storage.getLeafId()
  return {
    leafId,
    entryTypes: (await storage.getEntries()).map((e) => e.type),
    pathIds: (await storage.getPathToRoot(leafId)).map((e) => e.id),
    messages: (await storage.findEntries('message')).map((e) => e.id),
    labelForA: await storage.getLabel('a'),
  }
}

describe('agent/ConversationStorage equivalence', () => {
  let dir: string
  let userId: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-agent-'))
    applyMigrations(openDb(dir))
    userId = insertUser({ email: 'a@example.com', passwordHash: 'h', displayName: null, role: 'user', emailVerified: true }).id
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('matches the harness InMemorySessionStorage on the same op script', async () => {
    const ref = (await new InMemorySessionRepo().create({ id: 'ref' })).getStorage()

    const convId = newId()
    insertConversation({ id: convId, userId, name: null })
    const db = await ConversationStorage.load(convId)

    await runScript(ref)
    await runScript(db)

    expect(await snapshot(db)).toEqual(await snapshot(ref))
  })

  it('reloads persisted entries from the DB (cold open)', async () => {
    const convId = newId()
    insertConversation({ id: convId, userId, name: null })
    const first = await ConversationStorage.load(convId)
    await runScript(first)
    const before = await snapshot(first)

    // Fresh instance reading only from the DB.
    const reopened = await ConversationStorage.load(convId)
    expect(await snapshot(reopened)).toEqual(before)
  })

  it('setLeafId appends a leaf entry and moves the leaf', async () => {
    const convId = newId()
    insertConversation({ id: convId, userId, name: null })
    const s = await ConversationStorage.load(convId)
    await s.appendEntry({ type: 'message', id: 'a', parentId: null, timestamp: 't', message: { role: 'user', content: 'x', timestamp: 1 } as never })
    await s.appendEntry({ type: 'message', id: 'b', parentId: 'a', timestamp: 't', message: { role: 'user', content: 'y', timestamp: 2 } as never })
    expect(await s.getLeafId()).toBe('b')
    await s.setLeafId('a')
    expect(await s.getLeafId()).toBe('a')
    // A leaf entry was persisted, so a cold reopen preserves the moved leaf.
    const reopened = await ConversationStorage.load(convId)
    expect(await reopened.getLeafId()).toBe('a')
  })
})

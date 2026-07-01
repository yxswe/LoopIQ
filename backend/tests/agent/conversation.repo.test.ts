import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { newId } from '../../src/db/id.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { insertUser } from '../../src/modules/auth/user.repo.ts'
import {
  getConversation,
  insertConversation,
  insertEntryRow,
  listEntryRows,
  updateLeafId,
} from '../../src/modules/agent/conversation.repo.ts'

describe('agent/conversation.repo', () => {
  let dir: string
  let userId: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-agent-'))
    applyMigrations(openDb(dir))
    userId = insertUser({
      email: 'a@example.com',
      passwordHash: 'h',
      displayName: null,
      role: 'user',
      emailVerified: true,
    }).id
  })
  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips a conversation and its entries', () => {
    const id = newId()
    const conv = insertConversation({ id, userId, name: 'first' })
    expect(conv.userId).toBe(userId)
    expect(conv.leafId).toBeNull()

    const entryId = newId()
    insertEntryRow({
      conversation_id: id,
      id: entryId,
      seq: 1,
      parent_id: null,
      type: 'message',
      created_at: Date.now(),
      payload_json: JSON.stringify({ type: 'message', id: entryId }),
    })
    updateLeafId(id, entryId)

    const rows = listEntryRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(entryId)
    expect(getConversation(id)!.leafId).toBe(entryId)
  })
})

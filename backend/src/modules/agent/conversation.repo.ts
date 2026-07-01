import { getDb } from '../../db/connection.ts'
import { type ConversationMeta, type ConversationRow, type EntryRow, mapConversation } from './agent.types.ts'

export function insertConversation(input: {
  id: string
  userId: string
  name: string | null
}): ConversationMeta {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO conversations (id, user_id, name, leaf_id, model_json, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(input.id, input.userId, input.name, now, now)
  return getConversation(input.id)!
}

export function getConversation(id: string): ConversationMeta | null {
  const row = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | ConversationRow
    | undefined
  return row ? mapConversation(row) : null
}

export function updateLeafId(conversationId: string, leafId: string | null): void {
  getDb()
    .prepare('UPDATE conversations SET leaf_id = ?, updated_at = ? WHERE id = ?')
    .run(leafId, Date.now(), conversationId)
}

export function listEntryRows(conversationId: string): EntryRow[] {
  return getDb()
    .prepare('SELECT * FROM conversation_entries WHERE conversation_id = ? ORDER BY seq ASC')
    .all(conversationId) as EntryRow[]
}

export function insertEntryRow(row: EntryRow): void {
  getDb()
    .prepare(
      `INSERT INTO conversation_entries (conversation_id, id, seq, parent_id, type, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.conversation_id,
      row.id,
      row.seq,
      row.parent_id,
      row.type,
      row.created_at,
      row.payload_json,
    )
}

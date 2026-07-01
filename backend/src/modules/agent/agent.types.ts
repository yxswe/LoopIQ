export type ConversationRow = {
  id: string
  user_id: string
  name: string | null
  leaf_id: string | null
  model_json: string | null
  created_at: number
  updated_at: number
}

export type ConversationMeta = {
  id: string
  userId: string
  name: string | null
  leafId: string | null
  createdAt: number
  updatedAt: number
}

export function mapConversation(row: ConversationRow): ConversationMeta {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    leafId: row.leaf_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type EntryRow = {
  conversation_id: string
  id: string
  seq: number
  parent_id: string | null
  type: string
  created_at: number
  payload_json: string
}

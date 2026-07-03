import {
  type LeafEntry,
  type SessionMetadata,
  type SessionStorage,
  type SessionTreeEntry,
} from '@earendil-works/pi-agent-core'
import { newId } from '../../db/id.ts'
import { appendEntryAndSetLeaf, getConversation, listEntryRows } from './conversation.repo.ts'

function updateLabelCache(labelsById: Map<string, string>, entry: SessionTreeEntry): void {
  if (entry.type !== 'label') return
  const label = entry.label?.trim()
  if (label) labelsById.set(entry.targetId, label)
  else labelsById.delete(entry.targetId)
}

function leafIdAfterEntry(entry: SessionTreeEntry): string | null {
  return entry.type === 'leaf' ? entry.targetId : entry.id
}

/**
 * DB-backed SessionStorage bound to a single conversation.
 *
 * Holds the conversation's entries in an in-memory array (all reads are served
 * from memory, zero DB round-trips) and persists every write to LoopIQ's getDb().
 * The in-memory semantics intentionally mirror the harness InMemorySessionStorage
 * so the two are observationally equivalent.
 */
export class ConversationStorage implements SessionStorage<SessionMetadata> {
  private readonly metadata: SessionMetadata
  private entries: SessionTreeEntry[]
  private byId: Map<string, SessionTreeEntry>
  private labelsById: Map<string, string>
  private leafId: string | null
  private nextSeq: number

  private constructor(
    private readonly conversationId: string,
    metadata: SessionMetadata,
    entries: SessionTreeEntry[],
    startSeq: number,
  ) {
    this.metadata = metadata
    this.entries = entries
    this.byId = new Map(entries.map((e) => [e.id, e]))
    this.labelsById = new Map()
    this.leafId = null
    for (const entry of entries) {
      updateLabelCache(this.labelsById, entry)
      this.leafId = leafIdAfterEntry(entry)
    }
    this.nextSeq = startSeq
  }

  static async load(conversationId: string): Promise<ConversationStorage> {
    const conv = getConversation(conversationId)
    if (!conv) throw new Error(`conversation not found: ${conversationId}`)
    const rows = listEntryRows(conversationId)
    const entries = rows.map((r) => JSON.parse(r.payload_json) as SessionTreeEntry)
    const lastRow = rows[rows.length - 1]
    const startSeq = lastRow ? lastRow.seq + 1 : 1
    const metadata: SessionMetadata = {
      id: conversationId,
      createdAt: new Date(conv.createdAt).toISOString(),
    }
    return new ConversationStorage(conversationId, metadata, entries, startSeq)
  }

  /**
   * Atomically persists an entry row and the resulting leaf pointer, then
   * advances nextSeq. If the DB write throws, nextSeq is left untouched so a
   * later retry does not skip a seq. Callers mutate in-memory state only after
   * this returns, keeping memory and the DB in sync.
   */
  private persistEntryAndLeaf(entry: SessionTreeEntry, leafId: string | null): void {
    const seq = this.nextSeq
    appendEntryAndSetLeaf(
      {
        conversation_id: this.conversationId,
        id: entry.id,
        seq,
        parent_id: entry.parentId,
        type: entry.type,
        created_at: Date.now(),
        payload_json: JSON.stringify(entry),
      },
      this.conversationId,
      leafId,
    )
    this.nextSeq = seq + 1
  }

  async getMetadata(): Promise<SessionMetadata> {
    return this.metadata
  }

  async getLeafId(): Promise<string | null> {
    return this.leafId
  }

  async setLeafId(leafId: string | null): Promise<void> {
    if (leafId !== null && !this.byId.has(leafId)) {
      throw new Error(`entry not found: ${leafId}`)
    }
    const entry: LeafEntry = {
      type: 'leaf',
      id: newId(),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      targetId: leafId,
    }
    this.persistEntryAndLeaf(entry, leafId)
    this.entries.push(entry)
    this.byId.set(entry.id, entry)
    this.leafId = leafId
  }

  async createEntryId(): Promise<string> {
    return newId()
  }

  async appendEntry(entry: SessionTreeEntry): Promise<void> {
    const nextLeafId = leafIdAfterEntry(entry)
    this.persistEntryAndLeaf(entry, nextLeafId)
    this.entries.push(entry)
    this.byId.set(entry.id, entry)
    updateLabelCache(this.labelsById, entry)
    this.leafId = nextLeafId
  }

  async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
    return this.byId.get(id)
  }

  async findEntries<TType extends SessionTreeEntry['type']>(
    type: TType,
  ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
    return this.entries.filter(
      (e): e is Extract<SessionTreeEntry, { type: TType }> => e.type === type,
    )
  }

  async getLabel(id: string): Promise<string | undefined> {
    return this.labelsById.get(id)
  }

  async getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
    if (leafId === null) return []
    const path: SessionTreeEntry[] = []
    let current = this.byId.get(leafId)
    if (!current) throw new Error(`entry not found: ${leafId}`)
    while (current) {
      path.unshift(current)
      if (!current.parentId) break
      const parent = this.byId.get(current.parentId)
      if (!parent) throw new Error(`entry not found: ${current.parentId}`)
      current = parent
    }
    return path
  }

  async getEntries(): Promise<SessionTreeEntry[]> {
    return [...this.entries]
  }
}

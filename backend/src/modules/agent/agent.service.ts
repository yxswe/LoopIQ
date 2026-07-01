import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import { LiveConversation } from './conversation.ts'

type AgentRuntime = { streamFn: StreamFn; model: Model<any>; systemPrompt?: string }

let runtime: AgentRuntime | null = null
// Cache the in-flight open *promise*, not the resolved value: concurrent callers
// for the same id (e.g. the /events and /prompt handlers) must share one open()
// so a single LiveConversation is bound to the conversation.
const registry = new Map<string, Promise<LiveConversation>>()

/** Configure the LLM runtime. Prod (index.ts) passes a real provider; tests pass faux. */
export function configureAgentRuntime(next: AgentRuntime): void {
  runtime = next
}

/** Test/lifecycle helper: drop all in-memory live conversations. */
export function resetAgentRegistry(): void {
  registry.clear()
}

export function getOrCreateConversation(conversationId: string): Promise<LiveConversation> {
  let pending = registry.get(conversationId)
  if (!pending) {
    if (!runtime) {
      return Promise.reject(new Error('agent runtime not configured — call configureAgentRuntime()'))
    }
    pending = LiveConversation.open({
      conversationId,
      streamFn: runtime.streamFn,
      model: runtime.model,
      systemPrompt: runtime.systemPrompt,
    })
    registry.set(conversationId, pending)
    // If open() rejects, evict the poisoned promise so a later call can retry.
    // This cleanup handle does not swallow the rejection the caller sees.
    pending.catch(() => registry.delete(conversationId))
  }
  return pending
}

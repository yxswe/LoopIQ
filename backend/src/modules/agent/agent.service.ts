import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import { LiveConversation } from './conversation.ts'

type AgentRuntime = { streamFn: StreamFn; model: Model<any>; systemPrompt?: string }

let runtime: AgentRuntime | null = null
const registry = new Map<string, LiveConversation>()

/** Configure the LLM runtime. Prod (index.ts) passes a real provider; tests pass faux. */
export function configureAgentRuntime(next: AgentRuntime): void {
  runtime = next
}

/** Test/lifecycle helper: drop all in-memory live conversations. */
export function resetAgentRegistry(): void {
  registry.clear()
}

export async function getOrCreateConversation(conversationId: string): Promise<LiveConversation> {
  const existing = registry.get(conversationId)
  if (existing) return existing
  if (!runtime) throw new Error('agent runtime not configured — call configureAgentRuntime()')
  const lc = await LiveConversation.open({
    conversationId,
    streamFn: runtime.streamFn,
    model: runtime.model,
    systemPrompt: runtime.systemPrompt,
  })
  registry.set(conversationId, lc)
  return lc
}

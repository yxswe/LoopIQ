import { Agent, type AgentEvent, Session, type StreamFn } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import { ConversationStorage } from './conversation.storage.ts'

export type LiveConversationDeps = {
  conversationId: string
  streamFn: StreamFn
  model: Model<any>
  systemPrompt?: string
}

/**
 * One long-lived object per conversation. Owns a harness Agent (the loop) and a
 * Session (persistence via ConversationStorage). Persists each finished message
 * on `message_end` (the low-level Agent emits one for the user prompt and the
 * assistant turn), and fans live agent events out to subscribers (the SSE
 * route). Not bound to any HTTP connection.
 */
export class LiveConversation {
  private readonly listeners = new Set<(event: AgentEvent) => void>()

  private constructor(
    readonly conversationId: string,
    private readonly session: Session,
    private readonly agent: Agent,
  ) {}

  static async open(deps: LiveConversationDeps): Promise<LiveConversation> {
    const storage = await ConversationStorage.load(deps.conversationId)
    const session = new Session(storage)
    const context = await session.buildContext()
    const agent = new Agent({
      streamFn: deps.streamFn,
      initialState: {
        model: deps.model,
        systemPrompt: deps.systemPrompt ?? '',
        messages: context.messages,
      },
    })
    const lc = new LiveConversation(deps.conversationId, session, agent)

    agent.subscribe(async (event) => {
      // The low-level Agent emits a `message_end` for every finished message,
      // including the user prompt (verified against pi-agent-core 0.80.3). We
      // persist each finished message here so the Agent's lifecycle is the single
      // source of truth for the transcript.
      if (event.type === 'message_end') {
        await lc.session.appendMessage(event.message)
      }
      for (const listener of lc.listeners) listener(event)
    })

    return lc
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Start the agent run. The user turn is persisted by the `message_end`
   * handler along with the assistant turn. Does not await run completion. */
  async prompt(text: string): Promise<void> {
    await this.agent.prompt(text)
  }

  waitForIdle(): Promise<void> {
    return this.agent.waitForIdle()
  }

  get isStreaming(): boolean {
    return this.agent.state.isStreaming
  }
}

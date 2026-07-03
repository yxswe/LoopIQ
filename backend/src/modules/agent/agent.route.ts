import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../../app.ts'
import { newId } from '../../db/id.ts'
import { requireAuth } from '../../middleware/auth.ts'
import { createConversationBody, promptBody } from './agent.schema.ts'
import { getOrCreateConversation } from './agent.service.ts'
import { getConversation, insertConversation } from './conversation.repo.ts'

export const agentRoute = new Hono<AppEnv>()
  .use('*', requireAuth)
  // Create a conversation owned by the current user.
  .post('/conversations', zValidator('json', createConversationBody), (c) => {
    const userId = c.get('user')!.id
    const { name } = c.req.valid('json')
    const conv = insertConversation({ id: newId(), userId, name: name ?? null })
    return c.json({ id: conv.id, name: conv.name }, 201)
  })
  // Control plane: kick off a turn, return 202 immediately (turn runs in background).
  .post('/conversations/:id/prompt', zValidator('json', promptBody), async (c) => {
    const id = c.req.param('id')
    if (!getConversation(id)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404)
    }
    const { text } = c.req.valid('json')
    const lc = await getOrCreateConversation(id)
    // Fire-and-forget: do not await the full run so the response returns immediately.
    void lc
      .prompt(text)
      .catch((err) => c.get('logger').error({ err, conversationId: id }, 'prompt failed'))
    return c.json({ accepted: true }, 202)
  })
  // Event plane: one long-lived SSE stream of all events for this conversation.
  .get('/conversations/:id/events', async (c) => {
    const id = c.req.param('id')
    if (!getConversation(id)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404)
    }
    const lc = await getOrCreateConversation(id)
    return streamSSE(c, async (stream) => {
      let closed = false
      // Phase 0: unbounded queue, no backpressure (later phase).
      const queue: string[] = []
      let notify: (() => void) | null = null
      const wake = () => {
        notify?.()
        notify = null
      }
      const unsubscribe = lc.subscribe((event) => {
        queue.push(JSON.stringify(event))
        wake()
      })
      stream.onAbort(() => {
        closed = true
        wake()
      })
      try {
        while (!closed) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              notify = resolve
            })
            continue
          }
          const data = queue.shift()!
          await stream.writeSSE({ event: 'agent', data })
        }
      } finally {
        unsubscribe()
      }
    })
  })

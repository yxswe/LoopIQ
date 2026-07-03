import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.ts'
import { closeDb, openDb } from '../../src/db/connection.ts'
import { applyMigrations } from '../../src/db/migrations.ts'
import { configureAgentRuntime, resetAgentRegistry } from '../../src/modules/agent/agent.service.ts'
import { makeFauxRuntime, makeUserCookie } from './faux-helpers.ts'

// The app mounts originCheck(), which rejects state-changing methods whose Origin
// header does not match PUBLIC_ORIGIN. Match the test-env default so POSTs reach
// the route (and, for the unauth case, reach requireAuth rather than being 403'd).
const ORIGIN = 'http://localhost:5173'

// Reads an SSE Response body until `predicate` matches accumulated text or timeout.
async function readSSEUntil(res: Response, predicate: (text: string) => boolean, timeoutMs = 2000) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    if (predicate(text)) break
  }
  await reader.cancel().catch(() => {})
  return text
}

describe('agent route (HTTP + SSE)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loopiq-agent-'))
    applyMigrations(openDb(dir))
    resetAgentRegistry()
    const { streamFn, model } = makeFauxRuntime(['Hello there'])
    configureAgentRuntime({ streamFn, model })
  })
  afterEach(() => {
    resetAgentRegistry()
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects unauthenticated requests', async () => {
    const app = createApp()
    const res = await app.request('/api/agent/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  it('creates a conversation, streams the reply over SSE, and 202s the prompt', async () => {
    const app = createApp()
    const { cookie } = makeUserCookie()
    const headers = { 'Content-Type': 'application/json', cookie, origin: ORIGIN }

    const createRes = await app.request('/api/agent/conversations', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'demo' }),
    })
    expect(createRes.status).toBe(201)
    const { id } = (await createRes.json()) as { id: string }

    // Open the SSE stream first.
    const eventsRes = await app.request(`/api/agent/conversations/${id}/events`, {
      headers: { cookie },
    })
    expect(eventsRes.status).toBe(200)
    expect(eventsRes.headers.get('content-type')).toContain('text/event-stream')

    // Kick off the turn.
    const promptRes = await app.request(`/api/agent/conversations/${id}/prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'hi' }),
    })
    expect(promptRes.status).toBe(202)

    // The assistant reply text arrives on the SSE stream.
    const streamed = await readSSEUntil(eventsRes, (t) => t.includes('Hello there'))
    expect(streamed).toContain('Hello there')
  })

  it('404s prompt for an unknown conversation', async () => {
    const app = createApp()
    const { cookie } = makeUserCookie()
    const res = await app.request('/api/agent/conversations/nope/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie, origin: ORIGIN },
      body: JSON.stringify({ text: 'hi' }),
    })
    expect(res.status).toBe(404)
  })
})

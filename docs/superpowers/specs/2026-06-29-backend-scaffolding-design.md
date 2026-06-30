# LoopIQ Backend Scaffolding — Design

**Date:** 2026-06-29
**Scope:** Set up the backend project skeleton under `backend/`. Hono framework, Node.js runtime. No agent harness in this scaffold — it will be added in a later spec.

## Goals

- Get a runnable Hono server on Node 22 with sensible defaults.
- Establish conventions (directory layout, middleware, logging, testing, linting, build, container) that the agent harness can slot into later without restructuring.
- Keep dependencies minimal: only what's needed for an HTTP server with structured logs and request validation.

## Non-Goals

- No agent harness, no LLM client, no tool definitions.
- No database, no auth.
- No OpenAPI / auto-generated API docs.
- No CI configuration.
- No git repository initialization (the user will decide whether `LoopIQ/` or `backend/` is the repo root).
- No env-var schema validation yet (deferred until API keys arrive with the agent harness).

## Toolchain

- **Runtime:** Node.js 22+ (uses `--watch`, `--env-file`, and `--experimental-strip-types` for dev).
- **Package manager:** bun (used as installer + script runner; the app does not run on Bun).
- **Language:** TypeScript 5.x, `module: "NodeNext"`, `target: "ES2023"`, strict mode on.
- **Dev runner:** `node --watch --experimental-strip-types src/index.ts` (no tsx, no ts-node).
- **Build:** `tsc -p tsconfig.build.json` outputs to `dist/`; production runs `node dist/index.js`.
- **Lint + format:** Biome (single tool, replaces ESLint + Prettier).
- **Test framework:** Vitest, exercises routes via Hono's `app.request()` without booting a server.

## Dependencies

**Production (`dependencies`)**
- `hono` — framework
- `@hono/node-server` — Node adapter for Hono
- `@hono/zod-validator` — request validation middleware
- `zod` — schema library
- `pino` — structured logger

**Development (`devDependencies`)**
- `typescript`, `@types/node`
- `vitest`
- `@biomejs/biome`
- `pino-pretty` — dev-time log prettifier

**Explicitly excluded**
- No `dotenv` — Node 22's `--env-file` covers it.
- No `tsx` / `ts-node` — Node's native `--watch` + strip-types covers it.
- No `eslint` / `prettier` — Biome covers both.
- No LLM SDKs (OpenAI, Anthropic, etc.) — out of scope for this spec.

## Directory Layout

```
LoopIQ/
└── backend/
    ├── src/
    │   ├── index.ts                  # entrypoint: build app, listen on port
    │   ├── app.ts                    # createApp(): assemble middleware + mount modules
    │   ├── env.ts                    # read process.env (no validation yet)
    │   ├── lib/
    │   │   └── logger.ts             # root pino instance
    │   ├── middleware/
    │   │   └── request-logger.ts     # per-request child logger + access log
    │   └── modules/
    │       └── health/
    │           └── health.route.ts   # GET /health
    ├── tests/
    │   └── health.test.ts            # example vitest using app.request()
    ├── Dockerfile
    ├── .dockerignore
    ├── .gitignore
    ├── .env.example
    ├── biome.json
    ├── tsconfig.json
    ├── tsconfig.build.json
    ├── vitest.config.ts
    └── package.json
```

### Module convention

Each feature gets its own directory under `src/modules/<feature>/` containing:
- `<feature>.route.ts` — HTTP layer (validation, response shaping)
- `<feature>.service.ts` — business logic (no HTTP awareness)
- `<feature>.schema.ts` — zod schemas

For the scaffold, only `modules/health/` exists, and it has just `health.route.ts` (no service / schema needed for a trivial endpoint). When the agent harness lands later, expect new directories like `modules/agent/`, `lib/llm/`, `lib/tools/`.

### Unit boundaries

- `modules/*/*.route.ts` — HTTP only; parses input, calls service, shapes response.
- `modules/*/*.service.ts` — pure business logic; receives plain inputs, returns plain outputs.
- `lib/` — cross-module utilities (logger today; LLM client, tool registry, etc. later).

## File Contents

### `src/env.ts`

```ts
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
} as const

export const isDev = env.NODE_ENV !== 'production'
```

### `src/lib/logger.ts`

```ts
import pino from 'pino'
import { env, isDev } from '../env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
})
```

### `src/middleware/request-logger.ts`

Hono middleware factory `requestLogger()`. For each request:
- Reads `c.get('requestId')` (set upstream by Hono's built-in `requestId` middleware).
- Creates a child logger via `rootLogger.child({ requestId })`.
- Stores it on `c.set('logger', childLogger)`.
- Records start time before `await next()`.
- After `next()`, logs one line: `{ method, path, status, durationMs }` at `info`.

> Request-ID handling itself uses Hono's built-in `hono/request-id` middleware — no custom implementation needed. It generates an ID per request and respects an incoming `x-request-id` header.

### `src/modules/health/health.route.ts`

```ts
import { Hono } from 'hono'

export const healthRoute = new Hono().get('/', (c) =>
  c.json({ status: 'ok', uptime: process.uptime() })
)
```

### `src/app.ts`

```ts
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { requestLogger } from './middleware/request-logger.js'
import { healthRoute } from './modules/health/health.route.js'

export type AppEnv = {
  Variables: {
    requestId: string
    logger: import('pino').Logger
  }
}

export function createApp() {
  const app = new Hono<AppEnv>()
  app.use('*', secureHeaders())
  app.use('*', cors())
  app.use('*', requestId())
  app.use('*', requestLogger())
  app.route('/health', healthRoute)
  return app
}
```

### `src/index.ts`

```ts
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { env } from './env.js'
import { logger } from './lib/logger.js'

const app = createApp()
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'server started')
})
```

### `tests/health.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createApp } from '../src/app.js'

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await createApp().request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })
})
```

### `package.json` scripts

```json
{
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file=.env --experimental-strip-types src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome format --write ."
  }
}
```

### `tsconfig.json` (dev)

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2023"]
  },
  "include": ["src", "tests"]
}
```

### `tsconfig.build.json`

Extends `tsconfig.json`, sets `"exclude": ["tests", "**/*.test.ts"]`, and `"declaration": false`.

### `Dockerfile`

Multi-stage: bun installs full deps (including dev) for the build, then a separate prod-only install keeps the runtime image lean.

```dockerfile
# Install all deps (including dev) for building
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Compile TypeScript to dist/
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Install production-only deps (no typescript, vitest, biome, etc.)
FROM oven/bun:1 AS prod-deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Lean runtime image
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### `.dockerignore`

```
node_modules
dist
.env
.env.*
tests
**/*.test.ts
.git
coverage
```

### `.gitignore`

```
node_modules
dist
coverage
.env
.env.local
*.log
```

### `.env.example`

```
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
```

### `biome.json`

Defaults plus: 2-space indent, single quotes, line width 100.

### `vitest.config.ts`

Minimal — node environment, include `tests/**/*.test.ts`.

## Acceptance Criteria

The scaffold is done when all of these pass:

1. `bun install` completes without errors.
2. `bun run dev` boots the server; `curl http://localhost:3000/health` returns HTTP 200 with body `{"status":"ok","uptime":<number>}` and response header `x-request-id` is present.
3. The dev console shows a pino-pretty access log line containing `requestId`, `status`, and `durationMs`.
4. `bun run test` passes (health route test green).
5. `bun run lint` passes with zero findings on the generated tree.
6. `bun run build` produces `dist/index.js`; `node dist/index.js` boots and serves `/health`.
7. `docker build -t loopiq-backend .` succeeds; `docker run -p 3000:3000 loopiq-backend` serves `/health` on port 3000.

## Future Integration Points (for the agent harness, not implemented now)

- **LLM clients** → `src/lib/llm/`. Reads keys from `env.ts` (which will be upgraded to a zod-validated schema at that time).
- **Agent main loop** → `src/modules/agent/`. `agent.route.ts` exposes HTTP / SSE; `agent.service.ts` runs the harness.
- **Tools** → `src/lib/tools/<tool-name>.ts`. Each tool defines input via zod.
- **Streaming** → Hono's `streamSSE` / `stream` helpers, used inside `agent.route.ts`.
- **Tracing / log correlation** → `c.get('logger')` already provides a per-request child logger; agent service accepts a logger arg to continue the trace.

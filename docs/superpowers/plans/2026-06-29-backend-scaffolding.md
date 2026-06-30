# LoopIQ Backend Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `backend/` Hono+Node scaffold described in `docs/superpowers/specs/2026-06-29-backend-scaffolding-design.md` so the team can start adding agent harness code on top of a clean baseline.

**Architecture:** Hono application running on Node 22 via `@hono/node-server`. Code organized as `src/{index,app,env}.ts` + `src/lib/` (cross-cutting utilities) + `src/middleware/` (Hono middleware) + `src/modules/<feature>/` (per-feature routes/services/schemas). Production builds via `tsc` to `dist/`; container image uses multi-stage build with a lean Node runtime stage.

**Tech Stack:** Hono 4.x, `@hono/node-server`, `@hono/zod-validator`, zod, pino + pino-pretty, Vitest, Biome, TypeScript 5.x, bun (package manager only), Node 22+, Docker.

**Working directory for all tasks:** `/Users/yangxiao/Documents/github repos/LoopIQ/backend` unless stated otherwise.

---

## File Structure

Files this plan creates (all under `backend/` unless noted):

| Path | Responsibility |
|---|---|
| `package.json` | Deps, scripts, `type: module` |
| `tsconfig.json` | TS config for dev (includes `tests/`) |
| `tsconfig.build.json` | TS config for prod build (excludes tests) |
| `biome.json` | Lint + format config |
| `vitest.config.ts` | Vitest config |
| `.gitignore`, `.dockerignore`, `.env.example` | Standard project hygiene |
| `Dockerfile` | Multi-stage container build |
| `src/env.ts` | Reads `process.env` into a typed `env` object |
| `src/lib/logger.ts` | Root pino logger instance |
| `src/middleware/request-logger.ts` | Per-request child logger + access log middleware |
| `src/modules/health/health.route.ts` | `GET /health` route |
| `src/app.ts` | `createApp()` — assembles middleware + mounts routes |
| `src/index.ts` | Entrypoint — boots the HTTP server |
| `tests/health.test.ts` | Vitest test for `/health` |

---

## Prerequisites

Verify these are available **before** starting Task 1. If any fail, stop and tell the user.

- [ ] **Check Node version is 22+**

Run: `node --version`
Expected: `v22.x.x` or higher. If lower, ask the user to upgrade — the scaffold relies on `--watch`, `--env-file`, and `--experimental-strip-types`.

- [ ] **Check bun is installed**

Run: `bun --version`
Expected: any version (1.x is fine). If missing, ask user to install via `curl -fsSL https://bun.sh/install | bash`.

- [ ] **Check Docker is installed (for Task 12 only — defer the check if user doesn't have it yet)**

Run: `docker --version`
Expected: any version. Not blocking until Task 12.

---

## Task 1: Initialize package.json and install dependencies

**Files:**
- Create: `backend/package.json`

- [ ] **Step 1: Create `package.json` with the exact contents below**

Write this file at `backend/package.json`:

```json
{
  "name": "loopiq-backend",
  "version": "0.0.0",
  "private": true,
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

- [ ] **Step 2: Install runtime dependencies**

Run from `backend/`:
```bash
bun add hono @hono/node-server @hono/zod-validator zod pino
```
Expected: `package.json` now has a `dependencies` block with those five packages; `bun.lock` is created; `node_modules/` populated.

- [ ] **Step 3: Install dev dependencies**

Run from `backend/`:
```bash
bun add -d typescript @types/node vitest @biomejs/biome pino-pretty
```
Expected: `devDependencies` block added with those five packages.

- [ ] **Step 4: Sanity check — script names exist**

Run: `bun run` (lists scripts)
Expected: shows `dev`, `build`, `start`, `test`, `test:watch`, `lint`, `format`.

- [ ] **Step 5: Commit**

> Note: skip this commit step if no git repo exists in the project. Run `git rev-parse --git-dir 2>/dev/null` first; if it exits non-zero, skip committing for this task AND every subsequent task — just note "no git repo, skipping commit" and move on. The user has not decided whether `LoopIQ/` or `backend/` is the repo root (see spec Non-Goals).

If a git repo exists:
```bash
git add backend/package.json backend/bun.lock
git commit -m "chore(backend): init package.json with hono + pino + vitest + biome"
```

---

## Task 2: Add .gitignore, .dockerignore, .env.example

**Files:**
- Create: `backend/.gitignore`
- Create: `backend/.dockerignore`
- Create: `backend/.env.example`

- [ ] **Step 1: Create `backend/.gitignore`**

```
node_modules
dist
coverage
.env
.env.local
*.log
```

- [ ] **Step 2: Create `backend/.dockerignore`**

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

- [ ] **Step 3: Create `backend/.env.example`**

```
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
```

- [ ] **Step 4: Copy `.env.example` to `.env` for local dev**

Run from `backend/`:
```bash
cp .env.example .env
```
Expected: `.env` exists; it's git-ignored by Step 1.

- [ ] **Step 5: Commit (skip if no git repo — see Task 1 Step 5 note)**

```bash
git add backend/.gitignore backend/.dockerignore backend/.env.example
git commit -m "chore(backend): add gitignore, dockerignore, env example"
```

---

## Task 3: Configure TypeScript

**Files:**
- Create: `backend/tsconfig.json`
- Create: `backend/tsconfig.build.json`

- [ ] **Step 1: Create `backend/tsconfig.json`**

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

- [ ] **Step 2: Create `backend/tsconfig.build.json`**

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": false
  },
  "exclude": ["tests", "**/*.test.ts"]
}
```

- [ ] **Step 3: Verify tsc parses both configs without error**

Run from `backend/`:
```bash
bunx tsc --noEmit -p tsconfig.json
bunx tsc --noEmit -p tsconfig.build.json
```
Expected: both commands exit 0 with no output. (`src/` is empty so there's nothing to type-check yet.)

- [ ] **Step 4: Commit (skip if no git repo)**

```bash
git add backend/tsconfig.json backend/tsconfig.build.json
git commit -m "chore(backend): add tsconfig for dev and build"
```

---

## Task 4: Configure Biome

**Files:**
- Create: `backend/biome.json`

- [ ] **Step 1: Create `backend/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["dist", "node_modules", "coverage"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "organizeImports": {
    "enabled": true
  }
}
```

> Schema version `1.9.4` is the floor; if `bun add` installed a newer Biome, the schema URL will still validate (newer versions accept older schema URLs). If Biome warns about an unknown field on a newer version, update the URL to match `bunx biome --version` output.

- [ ] **Step 2: Verify Biome can parse its own config**

Run from `backend/`:
```bash
bunx biome check .
```
Expected: exits 0 (no files to lint yet, but config must load).

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/biome.json
git commit -m "chore(backend): add biome config"
```

---

## Task 5: Configure Vitest

**Files:**
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: Create `backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Verify vitest loads config**

Run from `backend/`:
```bash
bunx vitest --run --reporter=basic
```
Expected: vitest reports "No test files found" (because `tests/` is empty) and exits 0. If it errors on config, fix before continuing.

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/vitest.config.ts
git commit -m "chore(backend): add vitest config"
```

---

## Task 6: Implement env module

**Files:**
- Create: `backend/src/env.ts`

- [ ] **Step 1: Create directory and write `backend/src/env.ts`**

```ts
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
} as const

export const isDev = env.NODE_ENV !== 'production'
```

- [ ] **Step 2: Type-check**

Run from `backend/`:
```bash
bunx tsc --noEmit -p tsconfig.json
```
Expected: exits 0.

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/src/env.ts
git commit -m "feat(backend): add env module"
```

---

## Task 7: Implement root logger

**Files:**
- Create: `backend/src/lib/logger.ts`

- [ ] **Step 1: Create `backend/src/lib/logger.ts`**

```ts
import pino from 'pino'
import { env, isDev } from '../env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
})
```

> Note the `.js` extension on the import — required by NodeNext module resolution even though the source is `.ts`. This pattern is used throughout the project.

- [ ] **Step 2: Type-check**

Run from `backend/`:
```bash
bunx tsc --noEmit -p tsconfig.json
```
Expected: exits 0.

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/src/lib/logger.ts
git commit -m "feat(backend): add root pino logger"
```

---

## Task 8: Implement request-logger middleware

**Files:**
- Create: `backend/src/middleware/request-logger.ts`

- [ ] **Step 1: Create `backend/src/middleware/request-logger.ts`**

```ts
import type { MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import { logger as rootLogger } from '../lib/logger.js'

type Vars = {
  requestId: string
  logger: Logger
}

export function requestLogger(): MiddlewareHandler<{ Variables: Vars }> {
  return async (c, next) => {
    const requestId = c.get('requestId')
    const child = rootLogger.child({ requestId })
    c.set('logger', child)

    const start = performance.now()
    await next()
    const durationMs = Math.round(performance.now() - start)

    child.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs,
      },
      'request',
    )
  }
}
```

> `requestId` is set upstream by Hono's built-in `hono/request-id` middleware (wired up in Task 10).

- [ ] **Step 2: Type-check**

Run from `backend/`:
```bash
bunx tsc --noEmit -p tsconfig.json
```
Expected: exits 0.

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/src/middleware/request-logger.ts
git commit -m "feat(backend): add request-logger middleware"
```

---

## Task 9: Implement health route (TDD)

**Files:**
- Create: `backend/tests/health.test.ts`
- Create: `backend/src/modules/health/health.route.ts`

- [ ] **Step 1: Write the failing test FIRST**

Create `backend/tests/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { healthRoute } from '../src/modules/health/health.route.js'

describe('GET /', () => {
  it('returns ok status with uptime', async () => {
    const res = await healthRoute.request('/')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; uptime: number }
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
  })
})
```

> The test imports the route module directly (no `createApp`) — this isolates the route from middleware so failures point at the route itself. A separate end-to-end test through `createApp` is added in Task 11.

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
bun run test
```
Expected: FAIL with an error like "Cannot find module '../src/modules/health/health.route.js'".

- [ ] **Step 3: Implement the minimal route**

Create `backend/src/modules/health/health.route.ts`:

```ts
import { Hono } from 'hono'

export const healthRoute = new Hono().get('/', (c) =>
  c.json({ status: 'ok', uptime: process.uptime() }),
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
bun run test
```
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit (skip if no git repo)**

```bash
git add backend/tests/health.test.ts backend/src/modules/health/health.route.ts
git commit -m "feat(backend): add /health route with test"
```

---

## Task 10: Assemble the Hono app

**Files:**
- Create: `backend/src/app.ts`

- [ ] **Step 1: Create `backend/src/app.ts`**

```ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Logger } from 'pino'
import { requestLogger } from './middleware/request-logger.js'
import { healthRoute } from './modules/health/health.route.js'

export type AppEnv = {
  Variables: {
    requestId: string
    logger: Logger
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

- [ ] **Step 2: Type-check**

Run from `backend/`:
```bash
bunx tsc --noEmit -p tsconfig.json
```
Expected: exits 0.

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/src/app.ts
git commit -m "feat(backend): add createApp with middleware + health route"
```

---

## Task 11: Add end-to-end test through createApp

**Files:**
- Modify: `backend/tests/health.test.ts`

- [ ] **Step 1: Append an end-to-end describe block to the test file**

Open `backend/tests/health.test.ts` and add the new import + describe block. The full file should now read:

```ts
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { healthRoute } from '../src/modules/health/health.route.js'

describe('GET /', () => {
  it('returns ok status with uptime', async () => {
    const res = await healthRoute.request('/')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; uptime: number }
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
  })
})

describe('app: GET /health', () => {
  it('serves /health through createApp with x-request-id header', async () => {
    const res = await createApp().request('/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toBeTruthy()
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('respects an incoming x-request-id header', async () => {
    const res = await createApp().request('/health', {
      headers: { 'x-request-id': 'test-id-123' },
    })
    expect(res.headers.get('x-request-id')).toBe('test-id-123')
  })
})
```

- [ ] **Step 2: Run all tests**

Run from `backend/`:
```bash
bun run test
```
Expected: PASS — 3 tests passed across 2 describe blocks.

- [ ] **Step 3: Commit (skip if no git repo)**

```bash
git add backend/tests/health.test.ts
git commit -m "test(backend): add e2e test for /health through createApp"
```

---

## Task 12: Implement the entrypoint and verify dev server

**Files:**
- Create: `backend/src/index.ts`

- [ ] **Step 1: Create `backend/src/index.ts`**

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

- [ ] **Step 2: Type-check**

Run from `backend/`:
```bash
bunx tsc --noEmit -p tsconfig.json
```
Expected: exits 0.

- [ ] **Step 3: Boot the dev server in the background and probe it**

Run from `backend/`:
```bash
bun run dev > /tmp/loopiq-dev.log 2>&1 &
DEV_PID=$!
sleep 2
curl -s -i http://localhost:3000/health
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
cat /tmp/loopiq-dev.log
```

Expected:
- `curl` output shows `HTTP/1.1 200 OK`, an `x-request-id: ...` header, and JSON body `{"status":"ok","uptime":<number>}`.
- `/tmp/loopiq-dev.log` shows a pretty-printed log line like `INFO: server started {port: 3000}` and a `request` log line with `requestId`, `method: GET`, `path: /health`, `status: 200`, `durationMs: <number>`.

If port 3000 is busy, set `PORT=3100` in `.env` and adjust the curl URL.

- [ ] **Step 4: Commit (skip if no git repo)**

```bash
git add backend/src/index.ts
git commit -m "feat(backend): add server entrypoint"
```

---

## Task 13: Verify production build

**Files:** none (build artifacts only)

- [ ] **Step 1: Run the build**

Run from `backend/`:
```bash
bun run build
```
Expected: exits 0; `backend/dist/` is created with `.js` files mirroring `src/` structure.

- [ ] **Step 2: Confirm dist contents**

Run from `backend/`:
```bash
ls dist/
ls dist/modules/health/
test -f dist/index.js && echo "OK"
```
Expected: `dist/index.js` exists; `dist/modules/health/health.route.js` exists. The final command prints `OK`.

- [ ] **Step 3: Boot the built artifact and probe it**

Run from `backend/`:
```bash
node --env-file=.env dist/index.js > /tmp/loopiq-prod.log 2>&1 &
PROD_PID=$!
sleep 2
curl -s -i http://localhost:3000/health
kill $PROD_PID 2>/dev/null
wait $PROD_PID 2>/dev/null
cat /tmp/loopiq-prod.log
```

Expected: `curl` returns HTTP 200 with the same JSON body as in Task 12; log file shows server-started and request lines. Because `.env` sets `NODE_ENV=development`, pino-pretty still formats them — that's fine. If you want to confirm the production code path, re-run with `NODE_ENV=production node dist/index.js` (overrides the .env value) and you'll see raw JSON instead.

- [ ] **Step 4: No commit** — build artifacts are gitignored.

---

## Task 14: Write the Dockerfile and verify container build

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
# Install full deps (incl. dev) for the build stage
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

- [ ] **Step 2: Build the image**

Run from `backend/`:
```bash
docker build -t loopiq-backend .
```
Expected: build completes; final line shows `naming to docker.io/library/loopiq-backend:latest`.

- [ ] **Step 3: Run the container and probe it**

Run from `backend/`:
```bash
docker run -d --rm --name loopiq-backend-test -p 3000:3000 loopiq-backend
sleep 2
curl -s -i http://localhost:3000/health
docker logs loopiq-backend-test
docker stop loopiq-backend-test
```

Expected:
- `curl` returns HTTP 200 with body `{"status":"ok","uptime":<number>}` and an `x-request-id` header.
- `docker logs` shows a JSON line with `"msg":"server started"` and a request line.

- [ ] **Step 4: Commit (skip if no git repo)**

```bash
git add backend/Dockerfile
git commit -m "chore(backend): add multi-stage Dockerfile"
```

---

## Task 15: Final verification — run all acceptance checks

This task corresponds to the Acceptance Criteria in the spec. Run every check; do not skip any.

- [ ] **Step 1: `bun install` reproduces a clean install**

Run from `backend/`:
```bash
rm -rf node_modules
bun install --frozen-lockfile
```
Expected: completes without errors; `node_modules/` repopulated.

- [ ] **Step 2: Tests pass**

Run from `backend/`:
```bash
bun run test
```
Expected: 3 tests passed.

- [ ] **Step 3: Lint passes**

Run from `backend/`:
```bash
bun run lint
```
Expected: exits 0 with no findings. If Biome reports issues, run `bun run format` and re-stage the changes before committing.

- [ ] **Step 4: Build still works after install/lint cycle**

Run from `backend/`:
```bash
rm -rf dist
bun run build
test -f dist/index.js && echo "BUILD OK"
```
Expected: prints `BUILD OK`.

- [ ] **Step 5: Container build still works**

Run from `backend/`:
```bash
docker build -t loopiq-backend .
```
Expected: exits 0.

- [ ] **Step 6: Report to user**

Output to the user:
> All acceptance checks passed:
> - `bun install` clean
> - 3 vitest tests passing
> - `bun run lint` clean
> - `bun run build` produces `dist/index.js`
> - `docker build` succeeds
>
> The backend scaffold is ready. Next step is wiring up the agent harness (separate spec).

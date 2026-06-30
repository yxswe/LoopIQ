# LoopIQ Auth — Design

**Date:** 2026-06-30
**Scope:** Add a production-grade authentication skeleton to the existing
`backend/` (Hono on Node) and `frontend/` (React + Vite + Tailwind v4) so that
the entire app requires login. Three sign-in methods: email+password, Google
OAuth, WeChat OAuth. SQLite for storage. HttpOnly cookies + server-side
sessions for the session model. Invitation-code-gated registration.

This spec deliberately defers anything that requires sending email
(verification, forgot-password) — MVP runs with no mail provider. The schema
is forward-compatible so those features can be added later without a
migration.

## Goals

- Every endpoint and every page is gated by login by default, except a small
  fixed set of auth entry endpoints and `/health`.
- Production-grade security primitives: argon2id passwords, 256-bit opaque
  session tokens hashed at rest, HttpOnly+SameSite cookies, per-IP rate
  limiting, timing-safe comparisons, enumeration protection on login.
- Three sign-in methods unified by a single `requireAuth` middleware and a
  single `sessions` table.
- Forward-compatible schema: `email_verified` exists today and is always 1;
  adding mail-based verification later flips it without altering the table.
- Admin CLI as a substitute for "forgot password" and "create initial admin"
  during the no-email phase.

## Non-Goals (MVP — explicit deferrals)

- **No outbound email.** No mail provider integration (Resend / SES / Brevo
  / etc.), no verification codes, no forgot-password links.
- **No two-factor authentication.** No TOTP, no WebAuthn, no SMS.
- **No account-management UX beyond the safety basics.** No editing
  display name / avatar (`PATCH /api/me`). No binding extra OAuth providers
  to an existing account, no unbinding (`/api/me/identities/*`).
- **No admin user management UI.** Admin operates via CLI scripts; the only
  admin HTTP endpoints are for invitation codes.
- **No promote-to-admin endpoint.** Adding a new admin requires running a CLI
  command on the server. Reduces attack surface.
- **No agent harness, no LLM SDK, no tool routes.** Auth lives independently
  of the chat behavior added in later specs.
- **No password reset by the user themselves.** A user who forgets their
  password must contact the admin, who runs a CLI command to reset it.
- **No additional OAuth providers (GitHub / Apple / Facebook / Alipay).**
  Google and WeChat only.
- **No third-party auth service (Clerk / Better Auth / Supabase Auth).**
  WeChat is the gating factor — no mainstream third-party service supports
  it as a first-class provider, so a unified custom implementation is
  simpler than mixing third-party + escape-hatch.

## Architectural Decisions

### Why custom implementation, not Clerk / Better Auth / Supabase Auth

Each of those would require us to implement WeChat ourselves through their
plugin / "custom provider" escape hatch. That escape hatch is invariably
shaped for Western OAuth providers and fits WeChat awkwardly (openid /
unionid duality, QR-code scan flow). Mixing one library's idioms for
Google with custom code for WeChat creates two inconsistent code paths.
A single custom implementation puts both providers under one abstraction.

### Why HttpOnly cookie + server-side `sessions` table, not JWT in localStorage

The reference project `ACP/claude-web-chat` uses JWT in localStorage with a
sliding-renewal `X-New-Token` response header. OWASP's current guidance is
to *not* store tokens in localStorage because any XSS hands the attacker
your session. HttpOnly cookies are immune to that. The trade-off is one
extra DB SELECT per request, which is sub-millisecond on local SQLite.
Logout is also genuinely instant (DELETE the row) instead of having to
maintain a server-side revocation set on top of stateless JWTs.

### Why SQLite + better-sqlite3 + hand-written SQL

Single-file zero-ops persistence, synchronous API (no async noise), good
enough for tens of thousands of users on one box. Avoids ORM lock-in for a
small fixed schema. Migration path to Postgres is straightforward when
horizontal scaling is needed.

### Why ulids for primary keys

26 characters, URL-safe, time-sortable, do not leak "how many users does
this system have" the way auto-increment ids do. Used for `users.id`,
`sessions.id`, `user_identities.id`, `invitations.id`.

### Why no email verification right now

Cost: hooking any mail provider takes ~2 hours including DNS, plus monthly
quota anxiety once usage grows. Benefit during MVP: low (invitation codes
already gate spam). The right time to add verification is when there is
real user growth and account-recovery support requests start hurting.

## Architecture

### Component diagram

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  Frontend (React + Vite)    │         │  Backend (Hono + Node)      │
│                             │         │                             │
│  Pages:                     │  cookie │  Routes:                    │
│  • /login                   │ ──────→ │  • /api/auth/* (public)     │
│  • /signup                  │         │  • /api/me/*  (requireAuth) │
│  • /settings                │         │  • /api/admin/* (admin)     │
│  • /        Chat (gated)    │         │  • /api/health (public)     │
│                             │         │                             │
│  • AuthContext + useAuth()  │         │  Modules:                   │
│  • <ProtectedRoute>         │         │  • modules/auth/            │
│  • apiFetch (credentials:   │         │    ├─ providers/google.ts   │
│    'include', 401→/login)   │         │    └─ providers/wechat.ts   │
└─────────────────────────────┘         │                             │
                                        │  ┌─────── SQLite ────────┐  │
                                        │  │ users                 │  │
                                        │  │ user_identities       │  │
                                        │  │ sessions              │  │
                                        │  │ invitations           │  │
                                        │  │ _migrations           │  │
                                        │  └───────────────────────┘  │
                                        │                             │
                                        │  CLI scripts:               │
                                        │  • create-admin <email>     │
                                        │  • reset-password <email>   │
                                        └─────────────────────────────┘
```

### Default-deny access rule

Every new route that is not under `/api/auth/*` and not `/api/health` must
go through `requireAuth` (or `requireAdmin`). The lint rule is social, not
enforced — but spec-grade and reflected in the auth module's README. The
public endpoints are an explicit allowlist documented in §HTTP API below.

## Data Model

All timestamps are `INTEGER` milliseconds since epoch (`Date.now()`).

### `users`

```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,                  -- ulid
  email           TEXT UNIQUE,                       -- nullable: WeChat users may have none
  email_verified  INTEGER NOT NULL DEFAULT 0,        -- MVP: always 1 at insert time
  password_hash   TEXT,                              -- argon2id; NULL for OAuth-only users
  display_name    TEXT,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'user',      -- 'admin' | 'user'
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

CREATE INDEX users_email_idx ON users(email) WHERE email IS NOT NULL;
```

Decisions:
- Primary key is a ulid (not auto-increment).
- `email` nullable: WeChat-first users may have no email; they can still log
  in via the WeChat identity row.
- `password_hash` nullable: OAuth-only users have no password.
- `email_verified` exists today, always 1 at insert time during MVP. When
  email verification is added later it flips to 0 at signup and is set to 1
  after the user enters the code.

### `user_identities`

```sql
CREATE TABLE user_identities (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,                        -- 'password' | 'google' | 'wechat'
  subject      TEXT NOT NULL,                        -- email / google sub / wechat unionid|openid
  metadata     TEXT,                                 -- JSON: provider raw payload snapshot
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  UNIQUE(provider, subject)
);

CREATE INDEX user_identities_user_idx ON user_identities(user_id);
```

Decisions:
- `password` is itself a provider, so "what login methods does this user
  have" is a single query. For a password user, `subject = email`.
- `UNIQUE(provider, subject)` prevents one Google account from being bound
  to two LoopIQ users.
- WeChat: `subject` = `unionid` if present, otherwise `openid`. Reasoning
  documented as a code comment in the wechat provider.
- `metadata` (JSON text) stores the raw provider snapshot so future features
  (e.g. avatar refresh) can re-derive without re-calling provider APIs.

### `sessions`

```sql
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,                     -- ulid
  token_hash   TEXT NOT NULL UNIQUE,                 -- sha256(plaintext); plaintext lives only in cookie
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,                     -- sliding: extended on each request beyond grace
  last_seen_at INTEGER NOT NULL,
  user_agent   TEXT,
  ip_address   TEXT
);

CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
```

Decisions:
- The plaintext token is generated `crypto.randomBytes(32) → base64url`
  (43 chars, 256-bit entropy).
- DB stores only `sha256(plaintext)`. A DB dump is not directly replayable.
  sha256 is fine here (not argon2) because the token has 256 bits of entropy
  to begin with — brute-forcing is physically impossible.
- 30-day lifetime, sliding: if `now - last_seen_at > 1 day`, both
  `last_seen_at` and `expires_at = now + 30 days` are updated. Active users
  never get logged out; idle 30+ days does.
- `user_agent` and `ip_address` populate the "active sessions" list shown on
  the Settings page.

### `invitations`

```sql
CREATE TABLE invitations (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,                  -- base32, 12 chars, no 0/O/I/1
  created_by  TEXT REFERENCES users(id),             -- NULL for first invitation seeded by CLI
  used_by     TEXT REFERENCES users(id),
  used_at     INTEGER,
  expires_at  INTEGER NOT NULL,                      -- default: created_at + 30 days
  created_at  INTEGER NOT NULL
);

CREATE INDEX invitations_code_idx ON invitations(code);
```

Decisions:
- 12-character base32 without `0/O/I/1` — readable when transcribed by hand,
  ~52 bits of entropy.
- `used_by IS NOT NULL` = consumed (one-shot).
- OAuth signup also requires an invitation code (consistency + anti-spam).
  Code is passed through OAuth state.

### `_migrations`

```sql
CREATE TABLE _migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

`db/migrations.ts` exports an ordered array `[{ version: 1, sql: '...' }, ...]`.
On boot, applies any version not present in `_migrations`. MVP ships v1
containing all the CREATEs above plus indexes.

### Background cleanup

In-process `setInterval(cleanupExpired, 60 * 60 * 1000)`:

```ts
DELETE FROM sessions    WHERE expires_at < ?;
DELETE FROM invitations WHERE expires_at < ? AND used_by IS NULL;
```

No cron framework. Single-machine MVP only.

## HTTP API

Total: **16 endpoints**, plus existing `/health`.

### Public — auth entry (9)

| Method | Path | Body / Query | Behavior |
|---|---|---|---|
| GET    | `/api/auth/config` | — | `{ providers: ['password','google','wechat'] }`. Frontend uses to decide which login buttons to render. |
| POST   | `/api/auth/signup` | `{ email, password, displayName, invitationCode }` | Consumes invitation, creates user (`email_verified=1`), creates `password` identity row, opens session, sets cookie. Returns `{ user }`. |
| POST   | `/api/auth/login` | `{ email, password }` | Verifies argon2. Sets cookie. Returns `{ user }`. |
| POST   | `/api/auth/logout` | — | Deletes session row, clears cookie. |
| GET    | `/api/auth/oauth/google/start` | `?invitationCode=...` (first-time only) | Generates state (stored in-memory, 10-min TTL), 302 to Google authorize URL. |
| GET    | `/api/auth/oauth/google/callback` | `?code=...&state=...` | Validates state, exchanges code, fetches profile, find-or-create user, sets cookie, 302 to `/`. |
| GET    | `/api/auth/oauth/wechat/qr` | `?invitationCode=...` (first-time only) | Returns `{ qrUrl, state, expiresAt }`. Frontend renders QR + polls. |
| GET    | `/api/auth/oauth/wechat/callback` | `?code=...&state=...` | Validates state, exchanges code, parks result in-memory keyed by `state`. Renders "✓ scanned, return to PC" minimal page. |
| GET    | `/api/auth/oauth/wechat/poll/:state` | — | Returns `{ status: 'pending' \| 'success' \| 'expired' }`. On success, sets cookie on this response. |

Notes:
- `GET /api/health` is also public (existing endpoint, not changed by this
  spec).
- OAuth callbacks must remain public because the third-party returns to
  them without a cookie. CSRF defense is the `state` parameter.

### Authenticated — current user (4)

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET    | `/api/me` | — | Returns `{ id, email, displayName, avatarUrl, role, identities: [{provider, subject}] }`. |
| POST   | `/api/me/password` | `{ currentPassword, newPassword }` | Verifies current via argon2, hashes new, updates row. Returns 204. |
| GET    | `/api/me/sessions` | — | Lists all active sessions for current user: `[{id, createdAt, lastSeenAt, userAgent, ipAddress, isCurrent}]`. |
| DELETE | `/api/me/sessions/:id` | — | Deletes the session row. Cannot delete current session (use logout). |

### Admin (3)

All require `role = 'admin'`.

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET    | `/api/admin/invitations` | — | List all invitations with consumption status. |
| POST   | `/api/admin/invitations` | `{ count?: number, expiresInDays?: number }` | Generate one or more invitation codes. |
| DELETE | `/api/admin/invitations/:id` | — | Revoke an unused invitation. |

### Error response shape

Every 4xx/5xx returns:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }
```

Error codes (frontend uses `code` for i18n, `message` is English for server
logs):

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Not logged in (missing/expired cookie) |
| `FORBIDDEN` | 403 | Logged in but lacks permission (e.g. non-admin hitting admin) |
| `INVALID_CREDENTIALS` | 401 | Login: email-or-password wrong (deliberately indistinguishable) |
| `EMAIL_ALREADY_REGISTERED` | 409 | Signup with existing email |
| `INVALID_INVITATION_CODE` | 400 | Code invalid / expired / used |
| `IDENTITY_ALREADY_BOUND` | 409 | OAuth provider account already linked to another user |
| `INVALID_PASSWORD` | 400 | Change-password: current password wrong |
| `WEAK_PASSWORD` | 400 | New password fails length/character rules |
| `TOO_MANY_ATTEMPTS` | 429 | Rate limit hit |
| `INTERNAL` | 500 | Catch-all |

## Sign-in Flows (sequence diagrams)

### Email + password signup → immediate login

```
[User]            [Frontend]                  [Backend]                   [DB]
  fill form  ─→
                  POST /api/auth/signup ──→
                  { email, password,
                    displayName,
                    invitationCode }
                                              consume invitation     ───→
                                              hash password (argon2)
                                              INSERT user            ───→
                                              INSERT user_identities ───→
                                              create session         ───→
                                              Set-Cookie: loopiq_sid
                  ← 200 { user }
  redirect /  ←
```

### Google login

```
[Browser]                  [Backend]                  [Google]
  click "Sign in w/ Google"
  GET /auth/oauth/google/start ──→
                              generate state, store
                              in-memory, TTL 10 min
                              302 to accounts.google.com/...
  ←──── 302 ────
  ────────────────────→
  (user signs in at Google)
  ←────────────────────
  302 to /auth/oauth/google/callback?code=...&state=...
  GET /auth/oauth/google/cb ──→
                              consume & validate state
                              POST /token  ──→
                                          ←── id_token
                              decode id_token (sub, email)
                              find user by (provider='google', subject=sub)
                              if first time:
                                  consume invitation code from state
                                  INSERT user + user_identities
                              else:
                                  UPDATE last_login_at
                              create session
                              Set-Cookie: loopiq_sid
                              302 to /
  ←──── 302 ────
```

### WeChat scan-to-login

```
[PC Browser]      [PC Frontend]            [Backend]                  [User Phone]
                  GET /auth/oauth/
                  wechat/qr ───→
                              generate state, store
                              + WeChat authorize URL
                  ← { qrUrl, state, exp }
  render QR  ←

                  GET /poll/{state} (every 2s)
                  ───→         { status: 'pending' }
                  ←───
                  ...

  user scans QR with WeChat app ─────────────→
  authorizes in WeChat ───────────────────────→
                                            ←── wechat redirects to callback
                              exchange code → openid + (unionid)
                              find-or-create user
                              create session token (not yet cookie)
                              park { token } at state key in-memory

                  GET /poll/{state}
                  ───→         retrieve parked token
                              Set-Cookie: loopiq_sid
                  ← { status: 'success' }
  redirect /  ←
```

## Security Details

### Passwords

| Aspect | Decision |
|---|---|
| Algorithm | argon2id |
| Library | `argon2` (Node-bindings; well-maintained) |
| Parameters | `memoryCost: 19456` (≈19 MiB), `timeCost: 2`, `parallelism: 1` (OWASP 2024 recommendation) |
| Min length | 8 characters |
| Max length | 72 characters (DoS protection — argon2 on 1 MB input is brutal) |
| Character policy | No mandatory uppercase / digit / symbol (NIST 800-63B modern guidance) |
| Re-hash on login | If a logged-in user's hash uses outdated parameters, re-hash transparently with current parameters |

### Session tokens

| Aspect | Decision |
|---|---|
| Generation | `crypto.randomBytes(32).toString('base64url')` (43 chars, 256-bit entropy) |
| At-rest | sha256 hash in DB; plaintext lives only in cookie |
| Cookie name | `loopiq_sid` |
| Cookie attributes | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` |
| Lifetime | 30 days sliding |
| Sliding update threshold | If `now - last_seen_at > 1 day`, update on this request |
| `Secure` flag in dev | Omitted when `NODE_ENV !== 'production'` so http://localhost works |
| Comparison | `crypto.timingSafeEqual` |

### CSRF

- `SameSite=Lax` cookie blocks 99% of CSRF by default.
- Additional defense: for any POST / PUT / PATCH / DELETE under `/api/`,
  require `Origin` header to match `env.PUBLIC_ORIGIN`. Otherwise 403.
- OAuth callbacks are exempt from the Origin check — they are protected by
  the `state` parameter (192 bits of entropy, in-memory one-shot consumption,
  10-minute TTL).
- No double-submit token — `SameSite=Lax + Origin check` is sufficient per
  OWASP 2026.

### Rate limiting

In-memory `Map<ip, { count, windowStart }>`. Window: 5 minutes.

| Endpoint | Limit per IP |
|---|---|
| `POST /api/auth/login` | 10 |
| `POST /api/auth/signup` | 5 |
| `POST /api/me/password` | 5 |
| Everything else | not rate-limited |

Hitting limit returns 429 `TOO_MANY_ATTEMPTS`. Single-process only — fine
for MVP. Multi-node future needs Redis.

### Enumeration protection

- Login: same response (`401 INVALID_CREDENTIALS`) whether the email
  doesn't exist or the password is wrong. Same response time (argon2.verify
  runs against a constant dummy hash when the user doesn't exist).
- Signup: deliberately does NOT hide whether email is registered (returns
  `409 EMAIL_ALREADY_REGISTERED`). The user is volunteering this email
  anyway — hiding the conflict produces a worse UX with no real security
  gain.

### Timing-safe comparisons

- `argon2.verify` (library-internal, constant-time)
- session token hashes: `crypto.timingSafeEqual`

### OAuth state

- `crypto.randomBytes(24).toString('hex')` — 192 bits.
- In-memory `Map<state, { provider, intent: 'login', invitationCode?, createdAt }>`.
- TTL 10 minutes.
- One-shot consumption (deleted on callback).
- WeChat poll mode: a parallel `Map<state, { status, sessionToken? }>`
  stores the parked result. Frontend `GET /poll/:state` retrieves and
  deletes on success.

### Logging redaction

`pino` `redact` paths:

```
req.body.password, req.body.currentPassword, req.body.newPassword,
req.body.code, req.body.token
```

Session tokens: never logged in full; first 8 chars OK as session id.
Email and IP: logged.

### Security headers

`secureHeaders()` middleware (already installed) provides:

- `Strict-Transport-Security` (production only)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:`
  (MVP — tighten later if needed)

### CORS

Current `cors()` middleware is replaced with explicit config:

```ts
cors({
  origin: env.PUBLIC_ORIGIN,
  credentials: true,
  allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type'],
})
```

`credentials: true` is required for the browser to send cookies.

## Roles and Admin

### Role values

`users.role`: `'admin' | 'user'`. Default `'user'`.

### `requireAdmin` middleware

```ts
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: '...' } }, 401);
  if (user.role !== 'admin') return c.json({ error: { code: 'FORBIDDEN', message: '...' } }, 403);
  await next();
});
```

Applied to all `/api/admin/*` routes after `requireAuth`.

### Bootstrap (first admin)

CLI script `backend/scripts/create-admin.ts`, registered as
`bun run create-admin <email>`:

1. Checks if a user with `email` exists.
   - If yes, set `role = 'admin'`, exit.
   - If no, insert a new user with `role = 'admin'`, `password_hash = NULL`,
     `email_verified = 1`. Insert no `user_identities` row (the admin
     cannot log in yet).
2. Generates one invitation code, inserts it with `created_by =` this admin's
   id, prints the code to stdout.
3. Prints instructions: "Run `bun run reset-password <email>` to set this
   admin's password."

### Forgotten password (admin recovery)

CLI script `backend/scripts/reset-password.ts`, registered as
`bun run reset-password <email>`:

1. Looks up the user by email. Errors out if not found.
2. Prompts (via Node `readline`) for a new password. Confirms.
3. Hashes with argon2, `UPDATE users SET password_hash = ?`.
4. Optional: also invalidates all sessions for this user — `DELETE FROM
   sessions WHERE user_id = ?`. Forces fresh login on all devices, which is
   sane after a forced reset.

This is the substitute for `/api/auth/password/forgot` during MVP.

## Frontend Structure

### Routes (hash-based, hand-rolled router)

```
/                       Chat (protected)
/login                  Email+pw form + Google button + WeChat scan area
/signup                 Invitation code + email + display name + password
/settings               Change password + active sessions list
```

No react-router. ~80 lines of hash-router code is enough for this surface
area.

### Directory layout (additions)

```
frontend/src/
├── App.tsx                        (becomes router shell + AuthProvider)
├── main.tsx                       (unchanged)
├── styles.css                     (unchanged)
│
├── auth/
│   ├── AuthContext.tsx            (Context: { user, status })
│   ├── useAuth.ts                 (hook)
│   ├── ProtectedRoute.tsx
│   └── auth-api.ts                (typed wrappers around POST /auth/*)
│
├── router/
│   ├── router.tsx                 (hash router shell)
│   └── useRoute.ts
│
├── pages/
│   ├── ChatPage.tsx               (current App.tsx body moved here)
│   ├── LoginPage.tsx
│   ├── SignupPage.tsx
│   ├── SettingsPage.tsx
│   └── shared/
│       ├── AuthShell.tsx          (centered card layout shared by login/signup)
│       ├── FormField.tsx
│       └── ErrorBanner.tsx
│
├── components/
│   ├── (existing Sidebar, Header, MessageList, MessageBubble, Composer)
│   └── UserMenu.tsx               (avatar dropdown in header; "Settings" / "Sign out")
│
├── lib/
│   ├── api.ts                     (refactor: extract apiFetch wrapper)
│   └── theme.ts                   (unchanged)
│
└── hooks/
    └── useTheme.ts                (unchanged)
```

### `apiFetch` wrapper (the critical primitive)

```ts
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    window.location.hash = '#/login';
    throw new ApiError('UNAUTHORIZED', 'Login required');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? 'INTERNAL', body?.error?.message ?? res.statusText);
  }
  return res.json();
}
```

Every frontend network call goes through `apiFetch`, getting cookies,
401 redirects, and `ApiError` shaping for free.

### Auth bootstrap on page load

`<AuthProvider>` on mount does `GET /api/me`:
- 200 → `status = 'authenticated'`, render `<ProtectedRoute>` content or
  redirect to `/` if path is an auth page.
- 401 → `status = 'anonymous'`, redirect to `/login` if path is protected;
  show requested public page otherwise.
- Network error → show retry banner.

## Backend Structure

### Directory additions

```
backend/src/
├── app.ts                              (modify: mount auth.route + cookie middleware)
├── env.ts                              (modify: add auth-related env vars)
├── index.ts                            (unchanged)
├── middleware/
│   ├── request-logger.ts               (unchanged)
│   ├── auth.ts                         (new: requireAuth, requireAdmin)
│   └── rate-limit.ts                   (new: per-IP in-memory limiter)
├── modules/
│   ├── health/health.route.ts          (unchanged)
│   └── auth/
│       ├── auth.route.ts               (POST /signup, /login, /logout)
│       ├── me.route.ts                 (GET /me, POST /me/password, sessions)
│       ├── admin.route.ts              (invitations)
│       ├── oauth.route.ts              (Google + WeChat endpoints)
│       ├── auth.types.ts               (User, Session, Provider type defs)
│       ├── user.repo.ts
│       ├── session.repo.ts
│       ├── identity.repo.ts
│       ├── invitation.repo.ts
│       ├── password.ts                 (argon2 hash/verify)
│       ├── session.ts                  (token generation + cookie helpers)
│       ├── invitation.ts               (code generation, base32 alphabet)
│       └── providers/
│           ├── types.ts                (OAuthProvider interface)
│           ├── google.ts
│           └── wechat.ts
├── db/
│   ├── connection.ts                   (better-sqlite3 singleton + WAL pragma)
│   ├── migrations.ts                   (versioned array + applier)
│   └── id.ts                           (ulid helper)
└── scripts/
    ├── create-admin.ts
    └── reset-password.ts
```

### Environment variables (new)

```
# Session & cookies
PUBLIC_ORIGIN=http://localhost:5173        # frontend origin for CORS + origin check
SESSION_COOKIE_NAME=loopiq_sid             # rarely overridden

# Database
DATA_DIR=./data                            # SQLite file lives at DATA_DIR/app.db

# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback

# WeChat OAuth (open-platform "web app" credentials)
WECHAT_OAUTH_APP_ID=
WECHAT_OAUTH_APP_SECRET=
WECHAT_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/oauth/wechat/callback
```

`env.ts` validates these via zod (the project already uses zod for input
validation). Missing OAuth credentials at boot prints a warning but does
not refuse to start — those providers are reported as unavailable via
`/api/auth/config`, and the frontend renders only the buttons whose
providers are configured.

## Testing

Test framework: `vitest` (already installed). Style: `app.request()` to
exercise routes in-process — same pattern as the existing health route
test.

### Test surface

| File | Tests |
|---|---|
| `auth/password.test.ts` | argon2 hash + verify roundtrip; min/max length rules |
| `auth/session.test.ts` | token generation entropy; sliding renewal; expired sessions rejected |
| `auth/invitation.test.ts` | code charset; uniqueness; one-shot consumption; expiry |
| `auth.route.test.ts` | signup happy path; duplicate email 409; bad invitation 400; login happy; login wrong password = same error as missing user (timing test optional) |
| `me.route.test.ts` | requireAuth blocks without cookie; password change happy; password change wrong current 400 |
| `admin.route.test.ts` | requireAdmin blocks non-admin (403); invitation list/create/delete |
| `oauth.route.test.ts` | state generation + validation; expired state rejected; mock provider exchange |
| `rate-limit.test.ts` | exceeds limit returns 429; window resets |
| `middleware/auth.test.ts` | requireAuth sets `c.set('user')`; rejects missing/bad/expired cookie |

OAuth provider HTTP calls are mocked via `vi.spyOn(global, 'fetch')`. No
real network calls in tests.

### Coverage target

Not a hard percentage — every branch in `requireAuth`, every error code,
and every signup/login/logout flow must have at least one test.

## Deployment Considerations

### Docker

`backend/Dockerfile` (already exists) needs:
- `data/` volume mount for SQLite persistence.
- `DATA_DIR=/data` env in the runtime image.
- The CLI scripts (`create-admin`, `reset-password`) run inside the
  container: `docker exec -it loopiq-backend bun run create-admin you@example.com`.

### CORS / Origin in production

`PUBLIC_ORIGIN` must match the actual deployed frontend URL exactly,
scheme included (`https://app.loopiq.example`). Misconfiguration here is
the most common cause of "cookies not sticking" in production.

### Cookie `Secure` flag

In production (`NODE_ENV === 'production'`), `Secure` is mandatory.
The site must be served over HTTPS. Mixed HTTP/HTTPS will silently drop
cookies and produce hard-to-debug "logged out on every request" behavior.

### SQLite WAL

`connection.ts` sets `PRAGMA journal_mode=WAL` on first open. This lets
the cleanup background task run concurrently with request handling
without blocking.

## Open Questions and Risks

| Item | Note |
|---|---|
| WeChat open-platform credentials | Require an enterprise WeChat Open Platform account ("微信开放平台") for the "web app" product. If we don't have one yet, WeChat OAuth ships in a follow-up spec and only Google is in the first cut. |
| Google OAuth production verification | Required when the app is in "Production" status with sensitive scopes. Email scope is non-sensitive, so initial verification is light. |
| Single-process rate-limiter | Resets on backend restart. Acceptable for MVP but means a server restart resets all per-IP attempt counters — minor security degradation. |
| In-memory OAuth state | Same as above. A restart mid-OAuth-flow loses the state and the user gets an "invalid state" error and must retry. Acceptable. |
| No audit log | No record of who logged in when, who created which invitation, etc. Postponed to a later spec. |
| No "active sessions" UI for the first batch of users | The Settings page is part of this spec, but until users see XSS / suspicious login alerts, they won't think to use it. Acceptable. |

## Out of Scope (followup specs)

- Email verification flow + mail provider integration (Resend/Brevo/SES).
- User-driven forgot-password.
- Account-management UX: `PATCH /api/me`, OAuth bind/unbind.
- Admin user management UI (HTTP endpoints + page).
- Audit log table + admin viewer.
- Promote-to-admin endpoint.
- Two-factor auth (TOTP / WebAuthn).
- Additional OAuth providers (GitHub / Apple / Microsoft).
- Multi-node-safe rate limiting (Redis).
- Postgres migration.

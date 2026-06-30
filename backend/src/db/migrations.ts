import type { Database as DB } from 'better-sqlite3'

type Migration = { version: number; sql: string }

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id              TEXT PRIMARY KEY,
        email           TEXT UNIQUE,
        email_verified  INTEGER NOT NULL DEFAULT 0,
        password_hash   TEXT,
        display_name    TEXT,
        avatar_url      TEXT,
        role            TEXT NOT NULL DEFAULT 'user',
        created_at      INTEGER NOT NULL,
        last_login_at   INTEGER
      );
      CREATE INDEX users_email_idx ON users(email) WHERE email IS NOT NULL;

      CREATE TABLE user_identities (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider     TEXT NOT NULL,
        subject      TEXT NOT NULL,
        metadata     TEXT,
        created_at   INTEGER NOT NULL,
        last_used_at INTEGER,
        UNIQUE(provider, subject)
      );
      CREATE INDEX user_identities_user_idx ON user_identities(user_id);

      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        token_hash   TEXT NOT NULL UNIQUE,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   INTEGER NOT NULL,
        expires_at   INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        user_agent   TEXT,
        ip_address   TEXT
      );
      CREATE INDEX sessions_user_idx ON sessions(user_id);
      CREATE INDEX sessions_expires_idx ON sessions(expires_at);

      CREATE TABLE invitations (
        id          TEXT PRIMARY KEY,
        code        TEXT NOT NULL UNIQUE,
        created_by  TEXT REFERENCES users(id),
        used_by     TEXT REFERENCES users(id),
        used_at     INTEGER,
        expires_at  INTEGER NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX invitations_code_idx ON invitations(code);
    `,
  },
]

export function applyMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)
  const applied = new Set(
    (db.prepare('SELECT version FROM _migrations').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  )
  const insertVersion = db.prepare(
    'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
  )
  const tx = db.transaction((m: Migration) => {
    db.exec(m.sql)
    insertVersion.run(m.version, Date.now())
  })
  for (const m of migrations) {
    if (!applied.has(m.version)) tx(m)
  }
}

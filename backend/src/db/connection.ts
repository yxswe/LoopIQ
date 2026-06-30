import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database, { type Database as DB } from 'better-sqlite3'

let instance: DB | null = null

export function openDb(dataDir: string): DB {
  if (instance) return instance
  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'app.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  instance = db
  return db
}

export function getDb(): DB {
  if (!instance) throw new Error('db not initialized — call openDb() first')
  return instance
}

export function closeDb(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}

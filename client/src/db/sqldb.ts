/**
 * Browser SQLite via sql.js (WASM) — the app's local database, the way Daakia
 * uses SQLite. The whole DB is one file kept in memory and persisted to
 * localStorage (base64) on every write. Powers saved templates, the audit log,
 * and the Developer Tools DB Explorer.
 */
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { isAuditEventEnabled } from '../store/audit-config';

const LS_KEY = 'storybook.sqlite.v1';
let dbPromise: Promise<Database> | null = null;

async function open(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let db: Database;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const bytes = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
      db = new SQL.Database(bytes);
    } else {
      db = new SQL.Database();
    }
  } catch {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail_json TEXT
    );
    CREATE TABLE IF NOT EXISTS providers (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT,
      is_active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS palettes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      colors_json TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      accent TEXT NOT NULL,
      accent2 TEXT NOT NULL,
      accent3 TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompts (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      chat_model TEXT,
      image_engine TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'hero',
      species TEXT NOT NULL DEFAULT 'human',
      age TEXT NOT NULL DEFAULT '',
      look_description TEXT NOT NULL DEFAULT '',
      traits_json TEXT NOT NULL DEFAULT '[]',
      locked_seed INTEGER,
      reference_image TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

export async function persist(): Promise<void> {
  const db = await getDb();
  const bytes = db.export();
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  localStorage.setItem(LS_KEY, btoa(bin));
}

/** Run a statement with params, then persist. */
export async function run(sql: string, params: SqlValue[] = []): Promise<void> {
  const db = await getDb();
  db.run(sql, params);
  await persist();
}

/** Query → array of row objects. */
export async function all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: T[] = [];
  while (stmt.step()) out.push(stmt.getAsObject() as unknown as T);
  stmt.free();
  return out;
}

/** List table names (for the DB Explorer). */
export async function tables(): Promise<string[]> {
  const rows = await all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return rows.map((r) => r.name);
}

/** Append an audit entry. */
export async function audit(kind: string, summary: string, detail?: unknown): Promise<void> {
  // Gated by the Audit Config — disabled event types are not recorded.
  if (!isAuditEventEnabled(kind)) return;
  await run('INSERT INTO audit_log (ts, kind, summary, detail_json) VALUES (?,?,?,?)', [
    new Date().toISOString(), kind, summary, detail ? JSON.stringify(detail) : null,
  ]);
}

/** Key-value snapshot store (daakia-style) — UI state mirrored here for the DB Explorer. */
export async function kvSet(key: string, value: string): Promise<void> {
  await run('INSERT INTO kv (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', [
    key, value, new Date().toISOString(),
  ]);
}

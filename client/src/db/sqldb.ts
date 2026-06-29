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
    CREATE TABLE IF NOT EXISTS voices (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      engine_id TEXT NOT NULL,
      clone_voice_id TEXT NOT NULL,
      consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_audit (
      id INTEGER PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT,
      user_prompt TEXT,
      request_json TEXT,
      response_json TEXT
    );
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_stories (
      world_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      episode INTEGER NOT NULL DEFAULT 1,
      summary TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (world_id, story_id)
    );
    CREATE TABLE IF NOT EXISTS page_designs (
      story_id TEXT NOT NULL,
      page_idx INTEGER NOT NULL,
      elements_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (story_id, page_idx)
    );
    CREATE TABLE IF NOT EXISTS page_variants (
      story_id TEXT NOT NULL,
      page_idx INTEGER NOT NULL,
      variants_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (story_id, page_idx)
    );
    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author TEXT,
      exported_at TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_art_styles (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  try { db.run('ALTER TABLE characters ADD COLUMN voice_id TEXT;'); } catch { /* already exists */ }
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

const PREFS_KEY = 'storybook.prefs.v1';
function getMaxAuditLog(): number {
  try { const r = localStorage.getItem(PREFS_KEY); if (r) return Number(JSON.parse(r).maxAuditLogEntries) || 10000; } catch { /* */ }
  return 10000;
}
function getMaxAiAudit(): number {
  try { const r = localStorage.getItem(PREFS_KEY); if (r) return Number(JSON.parse(r).maxAiAuditEntries) || 10000; } catch { /* */ }
  return 10000;
}

/** Append an audit entry, trimming to the configured max. */
export async function audit(kind: string, summary: string, detail?: unknown): Promise<void> {
  if (!isAuditEventEnabled(kind)) return;
  const db = await getDb();
  db.run('INSERT INTO audit_log (ts, kind, summary, detail_json) VALUES (?,?,?,?)', [
    new Date().toISOString(), kind, summary, detail ? JSON.stringify(detail) : null,
  ]);
  const limit = getMaxAuditLog();
  db.run(`DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT ${limit})`);
  await persist();
}

/** Upsert lightweight AI audit rows (no detail fields) — does not overwrite cached detail. */
export async function syncAiAuditList(rows: Array<{ id: number; stage: string; model: string; ms: number; createdAt: string; error: boolean }>): Promise<void> {
  const db = await getDb();
  for (const e of rows) {
    db.run(
      `INSERT INTO ai_audit (id, stage, model, ms, created_at, is_error) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO NOTHING`,
      [e.id, e.stage, e.model, e.ms, e.createdAt, e.error ? 1 : 0],
    );
  }
  const limit = getMaxAiAudit();
  db.run(`DELETE FROM ai_audit WHERE id NOT IN (SELECT id FROM ai_audit ORDER BY id DESC LIMIT ${limit})`);
  await persist();
}

/** Upsert a full AI audit detail entry (system/user/request/response). */
export async function upsertAiAuditDetail(e: { id: number; stage: string; model: string; ms: number; createdAt: string; error: boolean; system: string; user: string; request: unknown; response: unknown }): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT INTO ai_audit (id, stage, model, ms, created_at, is_error, system_prompt, user_prompt, request_json, response_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       system_prompt=excluded.system_prompt, user_prompt=excluded.user_prompt,
       request_json=excluded.request_json, response_json=excluded.response_json`,
    [
      e.id, e.stage, e.model, e.ms, e.createdAt, e.error ? 1 : 0,
      e.system || null, e.user || null,
      e.request != null ? JSON.stringify(e.request) : null,
      e.response != null ? JSON.stringify(e.response) : null,
    ],
  );
  await persist();
}

export async function deleteAiAuditRow(id: number): Promise<void> {
  await run('DELETE FROM ai_audit WHERE id=?', [id]);
}

export async function clearAiAuditTable(): Promise<void> {
  await run('DELETE FROM ai_audit');
}

/** Key-value snapshot store (daakia-style) — UI state mirrored here for the DB Explorer. */
export async function kvSet(key: string, value: string): Promise<void> {
  await run('INSERT INTO kv (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', [
    key, value, new Date().toISOString(),
  ]);
}

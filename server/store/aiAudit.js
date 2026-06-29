/**
 * AI Audit (ce_audit) — records every LLM/image call with full request/response
 * detail, modelled on Daakia's AI Audit. Persisted to disk (server/output/
 * ai-audit.json) so records survive server restarts; kept in memory as a ring
 * buffer (newest first) for fast reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let MAX = 500;
const FILE = path.join(config.outputDir, 'ai-audit.json');

let seq = 0;
let entries = []; // newest first

// ── Load persisted entries on startup ───────────────────────────────────────
try {
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(raw)) {
      entries = raw;
      seq = entries.reduce((m, e) => Math.max(m, e.id || 0), 0);
    }
  }
} catch { /* corrupt/missing — start fresh */ }

let saveTimer = null;
function persist() {
  // Debounced write so a burst of calls doesn't thrash the disk.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(FILE, JSON.stringify(entries)); } catch { /* ignore */ }
  }, 250);
}

function flushSync() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { fs.writeFileSync(FILE, JSON.stringify(entries)); } catch { /* ignore */ }
}

// Flush synchronously on process exit so debounced writes are not lost.
process.once('SIGTERM', () => { flushSync(); process.exit(0); });
process.once('SIGINT', () => { flushSync(); process.exit(0); });
process.once('exit', () => { flushSync(); });

/** Update the in-memory ring buffer size (called from config route). */
export function setMax(n) {
  MAX = Math.max(1, Math.floor(n));
  if (entries.length > MAX) { entries.length = MAX; persist(); }
}

export function recordAiCall({ stage, model, ms, system, user, request, response, error }) {
  const entry = {
    id: ++seq,
    stage: stage || 'AI Chat',
    model: model || '',
    ms: ms ?? 0,
    createdAt: new Date().toISOString(),
    system: system || '',
    user: user || '',
    request: request ?? null,
    response: response ?? null,
    error: error || null,
  };
  entries.unshift(entry);
  if (entries.length > MAX) entries.length = MAX;
  persist();
  return entry;
}

export function listAiAudit() {
  // Lightweight list (no big request/response bodies).
  return entries.map((e) => ({
    id: e.id, stage: e.stage, model: e.model, ms: e.ms, createdAt: e.createdAt, error: !!e.error,
  }));
}

export function getAiAudit(id) {
  return entries.find((e) => e.id === Number(id)) || null;
}

export function deleteAiAudit(id) {
  const i = entries.findIndex((e) => e.id === Number(id));
  if (i >= 0) { entries.splice(i, 1); persist(); }
}

export function clearAiAudit() {
  entries.length = 0;
  persist();
}

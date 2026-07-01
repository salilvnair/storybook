/**
 * Story Library — persists every generated storybook to the user's home dir so
 * past creations survive forever and can be reopened/downloaded.
 *
 *   ~/.salilvnair/istorybook/story/<uuid>/
 *      meta.json     — { id, title, createdAt, pageCount, chat:{provider,model}, image:{engine,label}, ... }
 *      story.json    — the full story object (scenes, narration, says, thinks…)
 *      cover.png
 *      page-1.png … page-N.png
 *      book.pdf
 *
 * The server is the source of truth (files on disk). The client mirrors a
 * lightweight row into its sql.js `stories` table (a DB entry pointing here).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const ROOT = path.join(os.homedir(), '.salilvnair', 'istorybook', 'story');

function ensureRoot() { try { fs.mkdirSync(ROOT, { recursive: true }); } catch { /* ignore */ } }
function dirFor(id) { return path.join(ROOT, id); }
function writePng(dir, name, b64) {
  if (!b64) return null;
  const file = path.join(dir, name);
  try { fs.writeFileSync(file, Buffer.from(b64, 'base64')); return name; } catch { return null; }
}

/**
 * Save a finished storybook bundle. Returns the meta (incl. id).
 * @param {{ story:object, cover:string, pages:string[], pdfB64:string, meta:object }} bundle
 */
export function saveStory({ story, cover, pages = [], pdfB64, meta = {} }) {
  ensureRoot();
  const id = crypto.randomUUID();
  const dir = dirFor(id);
  fs.mkdirSync(dir, { recursive: true });

  const coverFile = writePng(dir, 'cover.png', cover);
  const pageFiles = [];
  pages.forEach((b64, i) => { const f = writePng(dir, `page-${i + 1}.png`, b64); if (f) pageFiles.push(f); });
  if (pdfB64) { try { fs.writeFileSync(path.join(dir, 'book.pdf'), Buffer.from(pdfB64, 'base64')); } catch { /* */ } }
  try { fs.writeFileSync(path.join(dir, 'story.json'), JSON.stringify(story, null, 2)); } catch { /* */ }

  const record = {
    id,
    title: story?.title || 'Untitled storybook',
    author: story?.author || '',
    createdAt: new Date().toISOString(),
    pageCount: Array.isArray(story?.scenes) ? story.scenes.length : pageFiles.length,
    coverFile, pageFiles,
    hasPdf: !!pdfB64,
    chat: meta.chat || null,     // { provider, model }
    image: meta.image || null,   // { engine, label }
  };
  try { fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(record, null, 2)); } catch { /* */ }
  return record;
}

/** List all saved stories (newest first). */
export function listStories() {
  ensureRoot();
  let ids = [];
  try { ids = fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory()); } catch { return []; }
  const out = [];
  for (const id of ids) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dirFor(id), 'meta.json'), 'utf8'));
      out.push(meta);
    } catch { /* skip corrupt */ }
  }
  return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Full record: meta + the story object. */
export function getStory(id) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dirFor(id), 'meta.json'), 'utf8'));
    let story = null;
    try { story = JSON.parse(fs.readFileSync(path.join(dirFor(id), 'story.json'), 'utf8')); } catch { /* */ }
    return { ...meta, story };
  } catch { return null; }
}

/** Absolute path to a file inside a story dir (cover/pdf/page), guarded. */
export function storyFile(id, name) {
  const safe = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(dirFor(id), safe);
  if (!file.startsWith(dirFor(id))) return null;
  return fs.existsSync(file) ? file : null;
}

/**
 * Persist an edited image back into a saved story (S-E5).
 * @param {string} id  story id
 * @param {'cover'|number|string} slot  'cover' or a 1-based page number
 * @param {string} b64  base64 PNG (no data: prefix)
 * @returns {{ ok:boolean, file?:string }}
 */
export function saveStoryImage(id, slot, b64) {
  const dir = dirFor(id);
  if (!b64 || !fs.existsSync(dir)) return { ok: false };
  const name = slot === 'cover' ? 'cover.png' : `page-${parseInt(slot, 10)}.png`;
  if (slot !== 'cover' && !Number.isFinite(parseInt(slot, 10))) return { ok: false };
  const written = writePng(dir, name, b64);
  return written ? { ok: true, file: written } : { ok: false };
}

export function removeStory(id) {
  try { fs.rmSync(dirFor(id), { recursive: true, force: true }); return true; } catch { return false; }
}

/** Patch meta.json fields (e.g. archived, title). */
export function patchStoryMeta(id, patch) {
  try {
    const file = path.join(dirFor(id), 'meta.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    const updated = { ...meta, ...patch };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    return updated;
  } catch { return null; }
}

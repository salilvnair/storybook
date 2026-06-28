/**
 * Image-generation engine abstraction.
 *
 * iStorybook talks to a *generic* image engine over HTTP — it never knows
 * the model implementation. Each engine is a provider that maps our generic
 * request to that engine's `/generate` body. The actual model runs wherever the
 * user points the URL: a Mac (mflux, Apple-Silicon) or RunPod (CUDA). Both
 * backends of each engine expose the SAME endpoints:
 *
 *   GET  /health   GET /status   POST /load   POST /generate   GET /image/{f}
 *
 * Engines defined here (add more later by appending to ENGINES):
 *   • ideogram4   — Ideogram 4. Supports a "magic prompt" LLM rewrite.
 *   • zimg-turbo  — Z-Image Turbo. Plain-text prompt, step/preset + negative prompt.
 *   • flux2       — FLUX.2-klein 4B/9B. Distilled, 4 steps, guidance=1.0, no negative prompt.
 *
 * Reference servers:
 *   experiments/{mflux,cuda}-id4/api_server.py        (ideogram4)
 *   experiments/{mflux,cuda}-zimg-turbo/api_server.py (zimg-turbo)
 *   experiments/{mflux,cuda}-flux2/api_server.py      (flux2)
 */
import { recordAiCall } from '../../store/aiAudit.js';

/** @typedef {{ prompt:string, aspect_ratio?:string, seed?:number,
 *   magic?:boolean, steps?:number, preset?:string, negativePrompt?:string }} GenOpts */

/**
 * Each engine declares which options apply (so the UI can hide the rest) and how
 * to build its `/generate` body from our generic options.
 */
export const ENGINES = {
  ideogram4: {
    id: 'ideogram4',
    label: 'Ideogram 4',
    model: 'ideogram-4',
    blurb: 'Photoreal + illustration model with a built-in “magic prompt” that rewrites your prompt for richer art. Great for storybook covers and scenes.',
    accent: '#8b5cf6',
    // Which generic options this engine understands → drives the settings UI.
    options: { magic: true, preset: true, negativePrompt: false, steps: false },
    presets: ['DEFAULT', 'TURBO', 'QUALITY'],
    /** @param {GenOpts} o */
    buildBody(o) {
      return {
        prompt: o.prompt,
        aspect_ratio: o.aspect_ratio || '1:1',
        magic: o.magic !== false,
        ...(o.preset ? { preset: String(o.preset) } : {}),
        ...(o.seed != null ? { seed: o.seed } : {}),
        return_base64: true,
      };
    },
  },

  'zimg-turbo': {
    id: 'zimg-turbo',
    label: 'Z-Image Turbo',
    model: 'z-image-turbo',
    blurb: 'Ultra-fast 6B turbo model — takes a plain-text prompt directly (no magic-prompt step). Tune speed/quality with steps or a preset; supports a negative prompt.',
    accent: '#22d3ee',
    options: { magic: false, preset: true, negativePrompt: true, steps: true },
    presets: ['FAST', 'TURBO', 'QUALITY'],
    /** @param {GenOpts} o */
    buildBody(o) {
      return {
        prompt: o.prompt,
        aspect_ratio: o.aspect_ratio || '1:1',
        ...(o.steps != null ? { steps: Number(o.steps) } : o.preset ? { preset: String(o.preset) } : {}),
        ...(o.negativePrompt ? { negative_prompt: o.negativePrompt } : {}),
        ...(o.seed != null ? { seed: o.seed } : {}),
        return_base64: true,
      };
    },
  },

  flux2: {
    id: 'flux2',
    label: 'FLUX.2-klein',
    model: 'flux2-klein',
    blurb: 'Black Forest Labs FLUX.2-klein distilled models (4B, 9B, 9B-KV). Excellent images in 4 steps. Plain-text prompt, no negative prompt, guidance=1.0. Runs on Mac (mflux/MLX) or CUDA (RunPod).',
    accent: '#f59e0b',
    options: { magic: false, preset: true, negativePrompt: false, steps: true, model: true },
    presets: ['FAST', 'DEFAULT', 'QUALITY'],
    models: ['4b', '9b', '9b-kv'],
    /** @param {GenOpts} o */
    buildBody(o) {
      return {
        prompt: o.prompt,
        aspect_ratio: o.aspect_ratio || '1:1',
        ...(o.model ? { model: String(o.model) } : {}),
        ...(o.steps != null ? { steps: Number(o.steps) } : o.preset ? { preset: String(o.preset) } : { preset: 'FAST' }),
        ...(o.seed != null ? { seed: o.seed } : {}),
        return_base64: true,
      };
    },
  },
};

export const DEFAULT_ENGINE = 'ideogram4';

export function getEngine(id) {
  return ENGINES[id] || ENGINES[DEFAULT_ENGINE];
}

/** Public list for the settings UI (no functions). */
export function engineList() {
  return Object.values(ENGINES).map((e) => ({
    id: e.id, label: e.label, blurb: e.blurb, accent: e.accent, options: e.options, presets: e.presets,
    models: e.models || [],
  }));
}

function cleanUrl(url) {
  const u = (url || '').replace(/\/$/, '');
  if (!u || u.includes('REPLACE') || u.includes('xxxxx')) {
    throw new Error('Image engine URL is not configured. Pick an engine and set its URL in Settings → Providers (a local Mac URL or a RunPod proxy URL).');
  }
  return u;
}

/** GET /status — model/GPU snapshot (same shape on both backends). */
export async function status(url) {
  const base = cleanUrl(url);
  const res = await fetch(`${base}/status`);
  if (!res.ok) throw new Error(`/status ${res.status}: ${await res.text()}`);
  return res.json();
}

/** POST /load then poll /status until ready (≤20 min). Identical for all engines. */
export async function ensureLoaded(url) {
  const base = cleanUrl(url);
  let snap;
  try { snap = await fetch(`${base}/status`).then((r) => r.json()); } catch { snap = { status: 'unknown' }; }
  if (snap.status === 'ready') return { status: 'ready', load_time_s: 0, vram_gb: snap.vram_used_gb ?? 0, server_url: base };
  await fetch(`${base}/load`, { method: 'POST' }).catch(() => {});
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetch(`${base}/status`).then((r) => r.json()).catch(() => ({ status: 'loading' }));
    if (s.status === 'ready') return { status: 'ready', load_time_s: s.load_time_s ?? 0, vram_gb: s.vram_used_gb ?? 0, server_url: base };
    if (s.status === 'error') throw new Error(`Model load failed: ${s.error}`);
  }
  throw new Error('Model load timed out after 20 min');
}

/**
 * Generate one image with streaming step progress via SSE `/generate/stream`.
 * Falls back to `/generate` if the stream endpoint is unavailable.
 * @param {string} engineId
 * @param {string} url
 * @param {string} prompt
 * @param {GenOpts} [opts]
 * @param {((ev:{step:number,total:number,pct:number,elapsed_s:number,it_s:number,prompt?:string,seed?:number,config?:string})=>void)|null} [onStep]
 * @returns {Promise<{image_b64:string, filename?:string, seed?:number, elapsed_s?:number}>}
 */
export async function generateStream(engineId, url, prompt, opts = {}, onStep = null) {
  const engine = getEngine(engineId);
  const base = cleanUrl(url);
  const seedRaw = opts.seed != null && opts.seed !== '' ? parseInt(String(opts.seed), 10) : undefined;
  const seed = seedRaw != null && !Number.isNaN(seedRaw) ? seedRaw : undefined;
  const reqBody = engine.buildBody({ ...opts, prompt, seed });

  let res;
  try {
    res = await fetch(`${base}/generate/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
  } catch {
    return generate(engineId, url, prompt, opts);
  }
  if (!res.ok || !res.body) {
    return generate(engineId, url, prompt, opts);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data;
        try { data = JSON.parse(line.slice(6)); } catch { continue; }
        if (data.type === 'step' && onStep) onStep(data);
        else if (data.type === 'done') result = data;
        else if (data.type === 'error') throw new Error(data.message || 'Stream error');
      }
    }
  } finally {
    reader.cancel?.();
  }

  if (!result) throw new Error('Stream ended without a done event');
  return result;
}

/**
 * Generate one image with the selected engine.
 * @param {string} engineId
 * @param {string} url        engine base URL (local Mac OR RunPod)
 * @param {string} prompt
 * @param {GenOpts} [opts]
 * @returns {Promise<{image_b64:string, filename?:string, seed?:number, elapsed_s?:number, prompt_used?:string}>}
 */
export async function generate(engineId, url, prompt, opts = {}) {
  const engine = getEngine(engineId);
  const base = cleanUrl(url);
  const seedRaw = opts.seed != null && opts.seed !== '' ? parseInt(String(opts.seed), 10) : undefined;
  const seed = seedRaw != null && !Number.isNaN(seedRaw) ? seedRaw : undefined;

  const reqBody = engine.buildBody({ ...opts, prompt, seed });
  const t0 = Date.now();
  const audit = (extra) => recordAiCall({
    stage: `Image (${engine.label})`, model: engine.model, ms: Date.now() - t0,
    system: `${engine.label} @ ${base}`, user: prompt, request: reqBody, ...extra,
  });

  let res;
  try {
    res = await fetch(`${base}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
  } catch (err) { audit({ response: null, error: err.message }); throw err; }
  if (!res.ok) {
    const text = await res.text();
    audit({ response: text, error: `${res.status}` });
    throw new Error(`${engine.label} /generate ${res.status}: ${text}`);
  }
  const data = await res.json();
  audit({ response: { ...data, image_b64: data.image_b64 ? `[${data.image_b64.length} b64 chars]` : null } });
  return data;
}

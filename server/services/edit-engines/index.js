/**
 * Image-EDIT engine abstraction (S-E2) — sibling of services/engines (generate).
 *
 * iStorybook talks to a *generic* inpaint/edit engine over HTTP. The client
 * sends an image + a brush mask + a refined prompt; the engine repaints only the
 * masked region and returns a new image. Each engine maps our generic request to
 * its own `/edit` body. The model runs wherever the user points the URL: a Mac
 * (MLX, Apple-Silicon) or CUDA (RunPod). Both backends expose the SAME endpoints:
 *
 *   GET /health   GET /status   POST /load   POST /edit   GET /image/{f}
 *
 * Engines (append more by adding to EDIT_ENGINES):
 *   • flux-fill — FLUX.1-Fill-dev. Mask-guided inpaint. white = repaint.
 *
 * Reference server: experiments/image-edit/flux-fill/api_server.py (S-E1).
 */
import { recordAiCall } from '../../store/aiAudit.js';
import { editGenerateOpenRouterImage, OPENROUTER_EDIT_MODELS, OPENROUTER_EDIT_DEFAULT_MODEL } from './openrouter-edit.js';
import { getOpenRouterKey } from '../../config.js';

/** @typedef {{ image_b64:string, mask_b64?:string|null, prompt:string,
 *   steps?:number, guidance?:number, seed?:number }} EditOpts */

// OpenAI /v1/images/edits models — only those confirmed to support mask inpainting
export const GPT_IMAGE_EDIT_MODELS = [
  'gpt-image-1-mini',          // cheapest — default
  'gpt-image-1',
  'gpt-image-2',
  'chatgpt-image-latest',
];

export { OPENROUTER_EDIT_MODELS, OPENROUTER_EDIT_DEFAULT_MODEL };

export const DIRECT_ENGINES = new Set(['gpt-image-1', 'openrouter-edit']);

export const EDIT_ENGINES = {
  'gpt-image-1': {
    id: 'gpt-image-1',
    label: 'GPT Image Edit (OpenAI)',
    model: 'gpt-image-1-mini',   // cheapest default
    blurb: 'OpenAI /v1/images/edits — cloud-based mask inpainting. Paint a region and describe what to change; only the painted area is regenerated. Supports gpt-image-1-mini (cheapest), gpt-image-1, gpt-image-2, and chatgpt-image-latest. Uses OPENAI_API_KEY (or LLM_API_KEY when LLM_TYPE=openai).',
    accent: '#10b981',
    direct: true,
    noUrl: true,
    options: { steps: false, guidance: false, seed: false, model: true },
    models: GPT_IMAGE_EDIT_MODELS,
    defaults: {},
    buildBody(o) {
      const model = GPT_IMAGE_EDIT_MODELS.includes(o.model) ? o.model : 'gpt-image-1-mini';
      return { image: o.image_b64, mask: o.mask_b64 || null, prompt: o.prompt, model };
    },
  },

  'openrouter-edit': {
    id: 'openrouter-edit',
    label: 'OpenRouter Image Edit',
    model: OPENROUTER_EDIT_DEFAULT_MODEL,
    blurb: 'OpenRouter Unified Image API — edit images with Google Gemini (Nano Banana), FLUX, and more. Pass a source image + optional mask + prompt; the model edits only the selected region. Default: google/gemini-2.5-flash-image (cheapest). Requires OPENROUTER_API_KEY.',
    accent: '#7c3aed',
    direct: true,
    noUrl: true,
    options: { steps: false, guidance: false, seed: false, model: true },
    models: OPENROUTER_EDIT_MODELS,
    defaults: {},
    buildBody(o) {
      const model = OPENROUTER_EDIT_MODELS.includes(o.model) ? o.model : OPENROUTER_EDIT_DEFAULT_MODEL;
      return { image: o.image_b64, mask: o.mask_b64 || null, prompt: o.prompt, model };
    },
  },
  'flux2-edit': {
    id: 'flux2-edit',
    label: 'FLUX.2-klein Edit (fast)',
    model: 'flux2-klein-edit',
    blurb: 'FLUX.2-klein Edit — fast, instruction-based image editing on Apple Silicon. Reuses the SAME FLUX.2-klein-4B weights you already run for generation (no ~24 GB download), ~4 steps. Describe the change ("add a blank speech bubble", "make the sky a sunset") and it edits the whole image. Brush mask is IGNORED — for region-precise edits use FLUX.1-Fill or GPT Image 1.',
    accent: '#f59e0b',
    wholeImageEdit: true,
    options: { steps: true, guidance: true, seed: true },
    defaults: { steps: 4, guidance: 1 },
    /** @param {EditOpts} o */
    buildBody(o) {
      return {
        image: o.image_b64,
        mask: o.mask_b64 || null,   // accepted but ignored by this engine
        prompt: o.prompt,
        ...(o.steps != null ? { steps: Number(o.steps) } : {}),
        ...(o.guidance != null ? { guidance: Number(o.guidance) } : {}),
        ...(o.seed != null ? { seed: o.seed } : {}),
        return_base64: true,
      };
    },
  },
  'flux-fill': {
    id: 'flux-fill',
    label: 'FLUX.1-Fill-dev (mask inpaint)',
    model: 'flux1-fill-dev',
    blurb: 'Black Forest Labs FLUX.1-Fill-dev — precise mask-guided inpaint. Brush a region (white = repaint), describe the change, and only that area is regenerated. More precise than FLUX.2 edit but a separate ~24 GB model and slower (30 steps). Runs on Mac (MLX) or CUDA (RunPod).',
    accent: '#ec4899',
    // Which generic options this engine understands → drives the settings UI.
    options: { steps: true, guidance: true, seed: true },
    defaults: { steps: 30, guidance: 30 },
    /** @param {EditOpts} o */
    buildBody(o) {
      return {
        image: o.image_b64,
        mask: o.mask_b64 || null,
        prompt: o.prompt,
        ...(o.steps != null ? { steps: Number(o.steps) } : {}),
        ...(o.guidance != null ? { guidance: Number(o.guidance) } : {}),
        ...(o.seed != null ? { seed: o.seed } : {}),
        return_base64: true,
      };
    },
  },
};

export const DEFAULT_EDIT_ENGINE = 'flux2-edit';

/** True if this engine calls an external API directly (no local URL needed). */
export function isDirectEngine(id) { return DIRECT_ENGINES.has(id); }

export function getEditEngine(id) {
  return EDIT_ENGINES[id] || EDIT_ENGINES[DEFAULT_EDIT_ENGINE];
}

/** Public list for the settings UI (no functions). */
export function editEngineList() {
  return Object.values(EDIT_ENGINES).map((e) => ({
    id: e.id, label: e.label, blurb: e.blurb, accent: e.accent,
    model: e.model || '',
    options: e.options, defaults: e.defaults || {},
    models: e.models || [],
    direct: e.direct || false, noUrl: e.noUrl || false,
    wholeImageEdit: e.wholeImageEdit || false,
  }));
}

function cleanUrl(url) {
  const u = (url || '').replace(/\/$/, '');
  if (!u || u.includes('REPLACE') || u.includes('xxxxx')) {
    throw new Error('Edit engine URL is not configured. Pick an engine and set its URL in Settings → Edit Engine (a local Mac URL or a RunPod proxy URL).');
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
 * Inpaint/edit one image with the selected edit engine.
 * @param {string} engineId
 * @param {string} url      engine base URL (local Mac OR RunPod)
 * @param {EditOpts} opts   { image_b64, mask_b64, prompt, steps?, guidance?, seed? }
 * @returns {Promise<{image_b64:string, filename?:string, seed?:number, elapsed_s?:number}>}
 */
export async function editGenerate(engineId, url, opts = {}) {
  const engine = getEditEngine(engineId);

  // Direct cloud engines — no local URL needed
  if (engine.direct) {
    if (engineId === 'openrouter-edit') {
      const apiKey = await getOpenRouterKey(url); // keychain → env var → ui fallback
      return editGenerateOpenRouterImage({ ...opts }, apiKey);
    }
    // gpt-image-1 (OpenAI) — handled by storybook.js via editGenerateGptImage directly
    throw new Error(`Direct engine ${engineId} must be called via its own route`);
  }

  const base = cleanUrl(url);
  if (!opts.image_b64) throw new Error('image_b64 required');
  const seedRaw = opts.seed != null && opts.seed !== '' ? parseInt(String(opts.seed), 10) : undefined;
  const seed = seedRaw != null && !Number.isNaN(seedRaw) ? seedRaw : undefined;
  const reqBody = engine.buildBody({ ...opts, seed });

  const t0 = Date.now();
  const audit = (extra) => recordAiCall({
    stage: `Image Edit (${engine.label})`, model: engine.model, ms: Date.now() - t0,
    system: `${engine.label} @ ${base}`, user: opts.prompt,
    request: { ...reqBody, image: '[b64]', mask: reqBody.mask ? '[b64]' : null }, ...extra,
  });

  let res;
  try {
    res = await fetch(`${base}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
  } catch (err) { audit({ response: null, error: err.message }); throw err; }
  if (!res.ok) {
    const text = await res.text();
    audit({ response: text, error: `${res.status}` });
    throw new Error(`${engine.label} /edit ${res.status}: ${text}`);
  }
  const data = await res.json();
  audit({ response: { ...data, image_b64: data.image_b64 ? `[${data.image_b64.length} b64 chars]` : null } });
  return data;
}

/**
 * RunPod Ideogram 4 client — talks to the deployed FastAPI server
 * (experiments/cuda-id4/api_server.py). Mirrors the call pattern used by the
 * ck8t cuda-id4 block: POST /generate with { prompt, preset, aspect_ratio, magic,
 * seed, return_base64 } → { image_b64, output_path, filename, seed, elapsed_s, prompt_used }.
 */
import { config } from '../config.js';
import { recordAiCall } from '../store/aiAudit.js';

function serverUrl(override) {
  const url = (override || config.runpod.url || '').replace(/\/$/, '');
  if (!url || url.includes('REPLACE')) {
    throw new Error(
      'RunPod URL is not configured. Set RUNPOD_URL in .env (your RunPod proxy URL), ' +
      'or set it in the app Settings.',
    );
  }
  return url;
}

/** GET /status — model/GPU snapshot. */
export async function status(override) {
  const base = serverUrl(override);
  const res = await fetch(`${base}/status`);
  if (!res.ok) throw new Error(`RunPod /status ${res.status}: ${await res.text()}`);
  return res.json();
}

/** POST /load — ensure the model is loaded; polls /status until ready (≤20 min). */
export async function ensureLoaded(override) {
  const base = serverUrl(override);
  let snap;
  try {
    snap = await fetch(`${base}/status`).then((r) => r.json());
  } catch {
    snap = { status: 'unknown' };
  }
  if (snap.status === 'ready') {
    return { status: 'ready', load_time_s: 0, vram_gb: snap.vram_used_gb ?? 0, server_url: base };
  }
  await fetch(`${base}/load`, { method: 'POST' }).catch(() => {});
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetch(`${base}/status`).then((r) => r.json()).catch(() => ({ status: 'loading' }));
    if (s.status === 'ready') {
      return { status: 'ready', load_time_s: s.load_time_s ?? 0, vram_gb: s.vram_used_gb ?? 0, server_url: base };
    }
    if (s.status === 'error') throw new Error(`Model load failed: ${s.error}`);
  }
  throw new Error('Model load timed out after 20 min');
}

/**
 * POST /generate — generate one image.
 * @param {string} prompt
 * @param {object} [opts] { preset, aspect_ratio, magic, seed, override }
 * @returns {Promise<{image_b64:string, filename?:string, seed?:number, elapsed_s?:number, prompt_used?:string}>}
 */
export async function generate(prompt, opts = {}) {
  const base = serverUrl(opts.override);
  const seedRaw = opts.seed != null && opts.seed !== '' ? parseInt(String(opts.seed), 10) : undefined;
  const seed = seedRaw != null && !Number.isNaN(seedRaw) ? seedRaw : undefined;

  const reqBody = {
    prompt,
    preset: String(opts.preset || config.runpod.preset),
    aspect_ratio: String(opts.aspect_ratio || config.runpod.aspectRatio),
    magic: opts.magic != null ? opts.magic !== false : config.runpod.magic,
    seed,
    return_base64: true,
  };
  const t0 = Date.now();
  const audit = (extra) => recordAiCall({
    stage: 'Image (Ideogram 4)', model: 'ideogram-4', ms: Date.now() - t0,
    system: `RunPod ${base}`, user: prompt, request: reqBody, ...extra,
  });

  let res;
  try {
    res = await fetch(`${base}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
  } catch (err) {
    audit({ response: null, error: err.message });
    throw err;
  }
  if (!res.ok) {
    const text = await res.text();
    audit({ response: text, error: `${res.status}` });
    throw new Error(`RunPod /generate ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Record without the giant base64 blob.
  audit({ response: { filename: data.filename, seed: data.seed, elapsed_s: data.elapsed_s, prompt_used: data.prompt_used } });
  return {
    image_b64: data.image_b64,
    filename: data.filename,
    seed: data.seed,
    elapsed_s: data.elapsed_s,
    prompt_used: data.prompt_used,
  };
}

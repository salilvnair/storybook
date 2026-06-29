/**
 * Music engine abstraction — mirrors audio-engines exactly.
 *
 * Each engine runs as a local Python server (or remote endpoint) and exposes:
 *   GET  /health    GET /status    POST /score
 *
 * POST /score body: { prompt, duration_seconds, format }
 * Response:         { audio_b64, format }
 *
 * Engines:
 *   • musicgen   — Meta MusicGen (MLX on Mac, CUDA on RunPod). Best quality open-source.
 *   • audioldm2  — AudioLDM2 (Stability AI). Excellent text-to-audio/music.
 */

export const DEFAULT_MUSIC_ENGINE = 'musicgen';

export const MUSIC_ENGINES = {
  musicgen: {
    id: 'musicgen',
    label: 'MusicGen',
    blurb: 'Meta MusicGen (MIT license) — the leading open-source text-to-music model. Runs locally on Mac (MLX) or GPU. Generates mood-matched background scores from a text prompt in seconds. Best pick for warm bedtime scores and adventure themes.',
    accent: '#7c3aed',
    capabilities: ['music', 'background-score'],
    options: { duration: true, format: true },
    formats: ['wav', 'mp3'],
    buildBody(prompt, opts = {}) {
      return {
        prompt,
        duration_seconds: opts.duration ?? 30,
        format: opts.format || 'wav',
        return_base64: true,
      };
    },
  },

  audioldm2: {
    id: 'audioldm2',
    label: 'AudioLDM2',
    blurb: 'AudioLDM2 (Stability AI, Apache 2.0) — latent diffusion model for text-to-audio. Excels at ambient soundscapes and whimsical textures alongside music. Runs locally or on RunPod.',
    accent: '#0ea5e9',
    capabilities: ['music', 'sfx', 'background-score'],
    options: { duration: true, format: true },
    formats: ['wav'],
    buildBody(prompt, opts = {}) {
      return {
        text: prompt,
        duration_in_s: opts.duration ?? 30,
        return_base64: true,
      };
    },
  },
};

function cleanMusicUrl(url) {
  return (url || '').replace(/\/+$/, '');
}

export function musicEngineList() {
  return Object.values(MUSIC_ENGINES).map((e) => ({
    id: e.id, label: e.label, blurb: e.blurb, accent: e.accent,
    capabilities: e.capabilities, options: e.options, formats: e.formats,
  }));
}

export async function musicEngineStatus(url) {
  const base = cleanMusicUrl(url);
  const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Music engine status ${res.status}`);
  return res.json();
}

export async function musicEngineGenerate(engineId, url, prompt, opts = {}) {
  const eng = MUSIC_ENGINES[engineId] || MUSIC_ENGINES[DEFAULT_MUSIC_ENGINE];
  const base = cleanMusicUrl(url);
  const body = eng.buildBody(prompt, opts);
  const res = await fetch(`${base}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Music engine ${res.status}: ${await res.text()}`);
  return res.json();
}

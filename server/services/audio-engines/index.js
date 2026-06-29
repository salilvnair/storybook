/**
 * TTS engine abstraction.
 *
 * iStorybook talks to a *generic* TTS engine over HTTP — the actual model runs
 * wherever the user points the URL (a local Mac, RunPod, etc.). Each engine maps
 * our generic synthesise request to that engine's body format.
 *
 * Each engine backend exposes:
 *   GET  /health   GET /status   POST /tts
 *
 * Engines defined here (in quality order):
 *   • qwen3-tts   — Qwen3-TTS (Alibaba). Best quality + instruction-following + zero-shot cloning.
 *   • fish-speech — Fish Speech. Best dedicated voice-cloning; fast; 17+ languages.
 *   • f5-tts      — F5-TTS (MIT). High-quality zero-shot cloning; clean minimal API.
 *   • kokoro      — Kokoro-82M. Lightweight / fast / offline; fixed speakers; no cloning.
 */
import { recordAiCall } from '../../store/aiAudit.js';

export const TTS_ENGINES = {
  'qwen3-tts': {
    id: 'qwen3-tts',
    label: 'Qwen3 TTS',
    model: 'qwen3-tts',
    blurb: 'Qwen3-TTS (Alibaba, Apache 2.0) — highest quality open-source TTS. Unique instruction-following: describe the speaking style in natural language ("warm bedtime storyteller pace"). Zero-shot voice cloning + 30+ languages. Best pick for rich narration.',
    accent: '#7c3aed',
    capabilities: ['tts', 'voice-clone', 'instruction-following'],
    options: { voice: true, speed: true, format: true },
    voices: ['Chelsie', 'Cherry', 'Ethan', 'Serena', 'narrator', 'child'],
    formats: ['wav', 'mp3', 'opus'],
    buildBody(text, opts = {}) {
      return {
        text,
        ...(opts.voice ? { voice: opts.voice } : {}),
        ...(opts.speed != null ? { speed: Number(opts.speed) } : {}),
        format: opts.format || 'wav',
        return_base64: true,
      };
    },
  },

  'fish-speech': {
    id: 'fish-speech',
    label: 'Fish Speech',
    model: 'fish-speech',
    blurb: 'Fish Speech (fishaudio, BSD-3) — best-in-class zero-shot voice cloning: provide a ≥5 s reference clip and it matches the voice. 17+ languages, fast inference. Primary pick for S17 "Grandma\'s voice" cloning.',
    accent: '#0ea5e9',
    capabilities: ['tts', 'voice-clone'],
    options: { voice: true, speed: true, format: true },
    voices: ['default', 'en_speaker_0', 'en_speaker_1', 'zh_speaker_0'],
    formats: ['wav', 'mp3'],
    buildBody(text, opts = {}) {
      return {
        text,
        ...(opts.voice ? { reference_id: opts.voice } : {}),
        ...(opts.speed != null ? { streaming: false, speed: Number(opts.speed) } : {}),
        format: opts.format || 'wav',
        return_base64: true,
      };
    },
  },

  'f5-tts': {
    id: 'f5-tts',
    label: 'F5-TTS',
    model: 'f5-tts',
    blurb: 'F5-TTS (MIT) — high-quality zero-shot voice cloning with a minimal clean API. No fixed speaker list; voice is determined by reference audio at clone time. Excellent alternative to Fish Speech for S17.',
    accent: '#f97316',
    capabilities: ['tts', 'voice-clone'],
    options: { voice: false, speed: true, format: true },
    voices: [],
    formats: ['wav', 'mp3'],
    buildBody(text, opts = {}) {
      return {
        text,
        ...(opts.speed != null ? { speed: Number(opts.speed) } : {}),
        format: opts.format || 'wav',
        return_base64: true,
      };
    },
  },

  kokoro: {
    id: 'kokoro',
    label: 'Kokoro TTS',
    model: 'kokoro-82m',
    blurb: 'Kokoro-82M (Apache 2.0) — ultra-lightweight 82M-param model; fastest local inference. Fixed speaker voices only, no voice cloning. Best for offline / low-RAM use or when you just need quick narration without cloning.',
    accent: '#34d399',
    capabilities: ['tts'],
    options: { voice: true, speed: true, format: true },
    voices: ['af_sarah', 'af_bella', 'am_michael', 'am_fenrir', 'bf_emma', 'bm_george'],
    formats: ['wav', 'mp3', 'opus'],
    buildBody(text, opts = {}) {
      return {
        text,
        ...(opts.voice ? { voice: opts.voice } : {}),
        ...(opts.speed != null ? { speed: Number(opts.speed) } : {}),
        format: opts.format || 'wav',
        return_base64: true,
      };
    },
  },
};

export const DEFAULT_AUDIO_ENGINE = 'qwen3-tts';

export function getAudioEngine(id) {
  return TTS_ENGINES[id] || TTS_ENGINES[DEFAULT_AUDIO_ENGINE];
}

/** Public list for the settings UI (no functions). */
export function audioEngineList() {
  return Object.values(TTS_ENGINES).map((e) => ({
    id: e.id, label: e.label, blurb: e.blurb, accent: e.accent,
    capabilities: e.capabilities || ['tts'],
    options: e.options, voices: e.voices, formats: e.formats,
  }));
}

function cleanAudioUrl(url) {
  const u = (url || '').replace(/\/$/, '');
  if (!u || u.includes('REPLACE') || u.includes('xxxxx')) {
    throw new Error('Audio engine URL is not configured. Set its URL in Settings → Providers (a local Mac URL or a RunPod proxy URL).');
  }
  return u;
}

/** GET /health — liveness ping. */
export async function audioEngineStatus(url) {
  const base = cleanAudioUrl(url);
  const res = await fetch(`${base}/health`);
  if (!res.ok) throw new Error(`/health ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Clone a voice from a reference audio clip (Fish Speech / F5-TTS).
 * Returns { voice_id, ... } from the engine's /clone endpoint.
 */
export async function audioEngineClone(engineId, url, sampleB64, refText) {
  const base = cleanAudioUrl(url);
  const body = {
    reference_audio: sampleB64,
    ...(refText ? { reference_text: refText } : {}),
  };
  const res = await fetch(`${base}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Clone ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Synthesise text with the selected TTS engine.
 * @param {string} engineId
 * @param {string} url        engine base URL (local Mac OR RunPod)
 * @param {string} text
 * @param {{ voice?:string, speed?:number, format?:string }} [opts]
 * @returns {Promise<{audio_b64:string, format:string, duration_s?:number}>}
 */
export async function audioEngineGenerate(engineId, url, text, opts = {}) {
  const engine = getAudioEngine(engineId);
  const base = cleanAudioUrl(url);
  const reqBody = engine.buildBody(text, opts);
  const t0 = Date.now();
  const audit = (extra) => recordAiCall({
    stage: `TTS (${engine.label})`, model: engine.model, ms: Date.now() - t0,
    system: `${engine.label} @ ${base}`, user: text.slice(0, 300), request: reqBody, ...extra,
  });

  let res;
  try {
    res = await fetch(`${base}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
  } catch (err) { audit({ response: null, error: err.message }); throw err; }
  if (!res.ok) {
    const errText = await res.text();
    audit({ response: errText, error: `${res.status}` });
    throw new Error(`${engine.label} /tts ${res.status}: ${errText}`);
  }
  const data = await res.json();
  audit({ response: { ...data, audio_b64: data.audio_b64 ? `[${data.audio_b64.length} b64 chars]` : null } });
  return data;
}

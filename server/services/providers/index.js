/**
 * Universal Provider SDK — the iStorybook platform core moat.
 *
 * ONE contract for EVERY AI capability:
 *   llm, image, tts, music, stt, translate, moderation
 *
 * Built-in providers wrap the existing engine abstractions; custom providers
 * can be added from the UI by pasting an OpenAPI/JSON schema.
 *
 * Contract:
 *   { id, label, capability, blurb, accent, options, health(), invoke() }
 *
 * Registration:
 *   registerProvider(spec)   — add a provider (built-in or custom)
 *   resolveProvider(cap, id) — get the active provider for a capability
 *   listProviders(cap?)      — list all providers, optionally filtered
 */

import { ENGINES, engineList, generate as imageGenerate, generateStream as imageGenerateStream } from '../engines/index.js';
import { TTS_ENGINES, audioEngineGenerate, audioEngineClone } from '../audio-engines/index.js';
import { MUSIC_ENGINES, musicEngineGenerate } from '../music-engines/index.js';

/** @type {Map<string, Provider>} */
const REGISTRY = new Map();

/** @typedef {{ id:string, label:string, capability:string, blurb?:string, accent?:string, options?:Record<string,unknown>, health:()=>Promise<{ok:boolean,status?:string}>, invoke:(params:unknown,opts?:unknown)=>Promise<unknown> }} Provider */

// ── Active provider IDs per capability (in-memory; loaded from config on boot) ─
const ACTIVE = {
  llm: '',
  image: '',
  tts: '',
  music: '',
  stt: '',
  translate: '',
  moderation: '',
};

// ── Fallback chains per capability ──────────────────────────────────────────────
const FALLBACK_CHAINS = {
  llm: [],
  image: [],
  tts: [],
  music: [],
  stt: [],
  translate: [],
  moderation: [],
};

// ── Register built-in image providers ───────────────────────────────────────────
function buildImageProvider(engine) {
  return {
    id: `image::${engine.id}`,
    label: engine.label,
    capability: 'image',
    blurb: engine.blurb,
    accent: engine.accent,
    options: engine.options,
    async health() {
      const { getImageConfig } = await import('../../store/image-config.js');
      const cfg = getImageConfig();
      const url = cfg.urls?.[engine.id] || '';
      if (!url) return { ok: false, status: 'no URL configured' };
      try {
        const r = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
        return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, status: e.message };
      }
    },
    async invoke(params, opts) {
      const { getImageConfig } = await import('../../store/image-config.js');
      const cfg = getImageConfig();
      const url = cfg.urls?.[engine.id] || '';
      return imageGenerate(url, params, { ...opts, engine: engine.id });
    },
  };
}

for (const engine of Object.values(ENGINES)) {
  const p = buildImageProvider(engine);
  REGISTRY.set(p.id, p);
}

// ── Register built-in TTS providers ──────────────────────────────────────────────
function buildTTSProvider(engine) {
  return {
    id: `tts::${engine.id}`,
    label: engine.label,
    capability: 'tts',
    blurb: engine.blurb,
    accent: engine.accent,
    options: engine.options,
    capabilities: engine.capabilities,
    async health() {
      const { getAudioConfig } = await import('../../store/audio-config.js');
      const cfg = getAudioConfig();
      const url = cfg.urls?.[engine.id] || cfg.url || '';
      if (!url) return { ok: false, status: 'no URL configured' };
      try {
        const r = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
        return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, status: e.message };
      }
    },
    async invoke(text, opts) {
      const { getAudioConfig } = await import('../../store/audio-config.js');
      const cfg = getAudioConfig();
      const url = cfg.urls?.[engine.id] || cfg.url || '';
      return audioEngineGenerate(url, text, { ...opts, engine: engine.id });
    },
  };
}

for (const engine of Object.values(TTS_ENGINES)) {
  const p = buildTTSProvider(engine);
  REGISTRY.set(p.id, p);
}

// ── Register built-in music providers ───────────────────────────────────────────
function buildMusicProvider(engine) {
  return {
    id: `music::${engine.id}`,
    label: engine.label,
    capability: 'music',
    blurb: engine.blurb,
    accent: engine.accent,
    options: engine.options,
    capabilities: engine.capabilities,
    async health() {
      const { getMusicConfig } = await import('../../store/music-config.js');
      const cfg = getMusicConfig();
      const url = cfg.url || '';
      if (!url) return { ok: false, status: 'no URL configured' };
      try {
        const r = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
        return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, status: e.message };
      }
    },
    async invoke(prompt, opts) {
      const { getMusicConfig } = await import('../../store/music-config.js');
      const cfg = getMusicConfig();
      const url = cfg.url || '';
      return musicEngineGenerate(url, prompt, { ...opts, engine: engine.id });
    },
  };
}

for (const engine of Object.values(MUSIC_ENGINES)) {
  const p = buildMusicProvider(engine);
  REGISTRY.set(p.id, p);
}

// ── Register built-in STT stub ────────────────────────────────────────────────
const STT_PROVIDER = {
  id: 'stt::whisper',
  label: 'Whisper',
  capability: 'stt',
  blurb: 'OpenAI Whisper (MIT) — the gold-standard open-source speech-to-text. Runs locally on Mac (mlx-whisper) or CUDA (RunPod). Transcribes in 99+ languages.',
  accent: '#06b6d4',
  options: { language: true, model: true },
  async health() {
    const url = process.env.STT_URL || '';
    if (!url) return { ok: false, status: 'no URL configured' };
    try {
      const r = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
      return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, status: e.message };
    }
  },
  async invoke(audioB64, opts = {}) {
    const url = process.env.STT_URL || '';
    if (!url) throw new Error('STT_URL not configured');
    const res = await fetch(`${url.replace(/\/+$/, '')}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_b64: audioB64, language: opts.language || 'en', model: opts.model || 'base' }),
    });
    if (!res.ok) throw new Error(`STT error: ${res.status}`);
    return res.json();
  },
};
REGISTRY.set(STT_PROVIDER.id, STT_PROVIDER);

// ── Register moderation stub ─────────────────────────────────────────────────
const MODERATION_PROVIDER = {
  id: 'moderation::llm-guard',
  label: 'LLM Guard',
  capability: 'moderation',
  blurb: 'LLM Guard (MIT) — open-source LLM moderation. Screens text + images for unsafe content, prompt injection, and PII. Runs locally or on RunPod.',
  accent: '#ef4444',
  options: { scanners: true },
  async health() {
    const url = process.env.MODERATION_URL || '';
    if (!url) return { ok: false, status: 'no URL configured' };
    try {
      const r = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
      return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, status: e.message };
    }
  },
  async invoke(text, opts = {}) {
    const url = process.env.MODERATION_URL || '';
    if (!url) return { safe: true, flags: [], note: 'moderation not configured — pass-through' };
    const res = await fetch(`${url.replace(/\/+$/, '')}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, ...opts }),
    });
    if (!res.ok) throw new Error(`Moderation error: ${res.status}`);
    return res.json();
  },
};
REGISTRY.set(MODERATION_PROVIDER.id, MODERATION_PROVIDER);

// ── Custom provider store (added via UI from JSON/OpenAPI schema) ─────────────
/** @type {Map<string,object>} */
const CUSTOM_PROVIDERS = new Map();

/**
 * Register a custom provider from a JSON schema.
 * @param {{ id:string, label:string, capability:string, url:string, invokeEndpoint:string, invokeMethod?:string, healthEndpoint?:string, requestTemplate?:object, responseField?:string }} schema
 */
export function registerCustomProvider(schema) {
  const { id, label, capability, url, invokeEndpoint = '/generate', invokeMethod = 'POST', healthEndpoint = '/health', requestTemplate = {}, responseField = 'result' } = schema;
  if (!id || !label || !capability || !url) throw new Error('Custom provider requires id, label, capability, url');

  const provider = {
    id: `custom::${id}`,
    label,
    capability,
    blurb: schema.blurb || `Custom provider: ${label}`,
    accent: schema.accent || '#64748b',
    options: schema.options || {},
    custom: true,
    schema,
    async health() {
      if (!healthEndpoint) return { ok: true, status: 'no health endpoint' };
      try {
        const r = await fetch(`${url.replace(/\/+$/, '')}${healthEndpoint}`, { signal: AbortSignal.timeout(5000) });
        return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}` };
      } catch (e) {
        return { ok: false, status: e.message };
      }
    },
    async invoke(params, opts) {
      const body = { ...requestTemplate, ...params, ...opts };
      const r = await fetch(`${url.replace(/\/+$/, '')}${invokeEndpoint}`, {
        method: invokeMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Custom provider ${id} error: ${r.status}`);
      const data = await r.json();
      return responseField ? data[responseField] : data;
    },
  };

  REGISTRY.set(provider.id, provider);
  CUSTOM_PROVIDERS.set(provider.id, schema);
  return provider;
}

export function removeCustomProvider(id) {
  const fullId = id.startsWith('custom::') ? id : `custom::${id}`;
  REGISTRY.delete(fullId);
  CUSTOM_PROVIDERS.delete(fullId);
}

export function listCustomProviders() {
  return [...CUSTOM_PROVIDERS.values()];
}

// ── Public API ───────────────────────────────────────────────────────────────

/** List all registered providers, optionally filtered by capability. */
export function listProviders(capability) {
  const all = [...REGISTRY.values()];
  return capability ? all.filter((p) => p.capability === capability) : all;
}

/** List providers as plain serialisable summaries. */
export function listProviderSummaries(capability) {
  return listProviders(capability).map((p) => ({
    id: p.id, label: p.label, capability: p.capability,
    blurb: p.blurb, accent: p.accent, options: p.options,
    capabilities: p.capabilities, custom: !!p.custom,
  }));
}

/** Get the active provider ID for a capability. */
export function getActiveProviderId(capability) {
  return ACTIVE[capability] || '';
}

/** Set the active provider for a capability. */
export function setActiveProvider(capability, id) {
  ACTIVE[capability] = id;
}

/** Set the fallback chain for a capability. */
export function setFallbackChain(capability, ids) {
  FALLBACK_CHAINS[capability] = ids;
}

/** Get the fallback chain for a capability. */
export function getFallbackChain(capability) {
  return FALLBACK_CHAINS[capability] || [];
}

/**
 * Resolve and return the active provider for a capability.
 * Falls back through the chain if the primary is unavailable.
 * @param {string} capability
 * @param {string} [overrideId] — force a specific provider
 * @returns {Provider}
 */
export function resolveProvider(capability, overrideId) {
  const id = overrideId || ACTIVE[capability];
  if (id && REGISTRY.has(id)) return REGISTRY.get(id);

  // Auto-resolve: first registered provider for this capability
  for (const [, p] of REGISTRY) {
    if (p.capability === capability) return p;
  }
  throw new Error(`No provider registered for capability: ${capability}`);
}

/**
 * Get a specific provider by full ID.
 * @param {string} id
 * @returns {Provider|undefined}
 */
export function getProvider(id) {
  return REGISTRY.get(id);
}

/**
 * Run a health check on ALL providers for a capability (or all if none given).
 */
export async function healthCheckAll(capability) {
  const providers = listProviders(capability);
  const results = await Promise.allSettled(providers.map(async (p) => {
    const h = await p.health();
    return { id: p.id, label: p.label, capability: p.capability, ...h };
  }));
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { id: providers[i].id, label: providers[i].label, capability: providers[i].capability, ok: false, status: r.reason?.message || 'error' };
  });
}

/**
 * Invoke a capability with automatic fallback.
 */
export async function invoke(capability, params, opts = {}) {
  const primary = resolveProvider(capability, opts.providerId);
  try {
    return await primary.invoke(params, opts);
  } catch (primaryErr) {
    const chain = getFallbackChain(capability);
    for (const fallbackId of chain) {
      if (fallbackId === primary.id) continue;
      const fallback = REGISTRY.get(fallbackId);
      if (!fallback) continue;
      try {
        return await fallback.invoke(params, opts);
      } catch { /* try next */ }
    }
    throw primaryErr;
  }
}

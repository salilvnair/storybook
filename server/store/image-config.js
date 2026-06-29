/**
 * Image-engine configuration (single-user, in-memory + .env seed).
 * The app's Settings → Providers panel POSTs here; generation reads it.
 * Per-engine URLs let the user keep both a local Mac URL and a RunPod URL.
 */
import { config } from '../config.js';
import { DEFAULT_ENGINE } from '../services/engines/index.js';

const state = {
  engine: process.env.IMAGE_ENGINE || DEFAULT_ENGINE,
  urls: {
    ideogram4: config.runpod.url || '',
    'zimg-turbo': '',
  },
  options: {
    magic: config.runpod.magic,
    preset: config.runpod.preset || 'DEFAULT',
    steps: null,
    negativePrompt: '',
    aspect_ratio: config.runpod.aspectRatio || '1:1',
    model: '',
  },
};

export function getImageConfig() {
  return state;
}

/** Resolve the active engine + URL + options, honouring a per-request override. */
export function resolveImageConfig(override = {}) {
  const engine = override.engine || state.engine || DEFAULT_ENGINE;
  const url = override.url || override.runpodUrl || state.urls[engine] || '';
  const options = { ...state.options, ...(override.options || {}) };
  return { engine, url, options };
}

export function setImageConfig(patch = {}) {
  if (typeof patch.engine === 'string') state.engine = patch.engine;
  if (patch.urls && typeof patch.urls === 'object') state.urls = { ...state.urls, ...patch.urls };
  if (patch.options && typeof patch.options === 'object') state.options = { ...state.options, ...patch.options };
  return state;
}

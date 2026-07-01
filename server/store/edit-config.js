/**
 * Image-EDIT engine configuration (S-E2) — sibling of store/image-config.js.
 * Single-user, in-memory + .env seed. Settings → Edit Engine POSTs here; the
 * /api/storybook/edit-image route reads it to run real inpaint (else the stub).
 * Per-engine URLs let the user keep both a local Mac URL and a RunPod URL.
 */
import { DEFAULT_EDIT_ENGINE, isDirectEngine } from '../services/edit-engines/index.js';
import { getOpenAiImageKey } from '../config.js';

const state = {
  engine: process.env.EDIT_ENGINE || DEFAULT_EDIT_ENGINE,
  urls: {
    'flux2-edit': process.env.EDIT_ENGINE_URL || '',
    'flux-fill': '',
  },
  options: {
    steps: null,
    guidance: null,
    seed: null,
  },
};

export function getEditConfig() {
  return state;
}

/** True when the active engine is ready to run (URL set, or direct engine with API key). */
export function isEditConfigured(override = {}) {
  const engine = override.engine || state.engine || DEFAULT_EDIT_ENGINE;
  if (isDirectEngine(engine)) return !!getOpenAiImageKey();
  const url = override.url || state.urls[engine] || '';
  return !!url && !url.includes('REPLACE') && !url.includes('xxxxx');
}

/** Resolve the active engine + URL + options, honouring a per-request override. */
export function resolveEditConfig(override = {}) {
  const engine = override.engine || state.engine || DEFAULT_EDIT_ENGINE;
  const url = override.url || override.runpodUrl || state.urls[engine] || '';
  const options = { ...state.options, ...(override.options || {}) };
  return { engine, url, options };
}

export function setEditConfig(patch = {}) {
  if (typeof patch.engine === 'string') state.engine = patch.engine;
  if (patch.urls && typeof patch.urls === 'object') state.urls = { ...state.urls, ...patch.urls };
  if (patch.options && typeof patch.options === 'object') state.options = { ...state.options, ...patch.options };
  return state;
}

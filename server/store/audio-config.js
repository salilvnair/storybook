/**
 * Audio-engine configuration (single-user, in-memory).
 * Settings → Providers panel POSTs here; narration reads it.
 */
import { DEFAULT_AUDIO_ENGINE } from '../services/audio-engines/index.js';

const state = {
  engine: process.env.AUDIO_ENGINE || DEFAULT_AUDIO_ENGINE,  // 'qwen3-tts'
  url: process.env.AUDIO_ENGINE_URL || '',
  options: {
    voice: '',
    speed: 1.0,
    format: 'wav',
  },
};

export function getAudioConfig() {
  return state;
}

/** Resolve the active engine + URL + options, honouring a per-request override. */
export function resolveAudioConfig(override = {}) {
  const engine = override.engine || state.engine || DEFAULT_AUDIO_ENGINE;
  const url = override.url || state.url || '';
  const options = { ...state.options, ...(override.options || {}) };
  return { engine, url, options };
}

export function setAudioConfig(patch = {}) {
  if (typeof patch.engine === 'string') state.engine = patch.engine;
  if (typeof patch.url === 'string') state.url = patch.url;
  if (patch.options && typeof patch.options === 'object') state.options = { ...state.options, ...patch.options };
  return state;
}

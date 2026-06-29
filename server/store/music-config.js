/**
 * Music-engine configuration (single-user, in-memory).
 * Mirrors audio-config.js exactly.
 */
import { DEFAULT_MUSIC_ENGINE } from '../services/music-engines/index.js';

const state = {
  engine: process.env.MUSIC_ENGINE || DEFAULT_MUSIC_ENGINE,
  url: process.env.MUSIC_ENGINE_URL || '',
  options: {
    duration: 30,
    format: 'wav',
  },
};

export function getMusicConfig() { return state; }

export function resolveMusicConfig(override = {}) {
  const engine = override.engine || state.engine || DEFAULT_MUSIC_ENGINE;
  const url = override.url || state.url || '';
  const options = { ...state.options, ...(override.options || {}) };
  return { engine, url, options };
}

export function setMusicConfig(patch = {}) {
  if (typeof patch.engine === 'string') state.engine = patch.engine;
  if (typeof patch.url === 'string') state.url = patch.url;
  if (patch.options && typeof patch.options === 'object') state.options = { ...state.options, ...patch.options };
  return state;
}

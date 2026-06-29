/**
 * Music engine store — mirrors audio-engine-store exactly.
 * Manages the music engine config (URL, options) and tracks health.
 */
import { create } from 'zustand';

export interface MusicEngineMeta {
  id: string;
  label: string;
  blurb: string;
  accent: string;
  capabilities: string[];
  options: { duration?: boolean; format?: boolean };
  formats: string[];
}

export interface MusicEngineConfig {
  engine: string;
  url: string;
  options: { duration: number; format: string };
}

interface MusicEngineState {
  engines: MusicEngineMeta[];
  config: MusicEngineConfig;
  health: 'unknown' | 'ok' | 'error';
  loaded: boolean;

  init: () => Promise<void>;
  setEngine: (id: string) => void;
  setUrl: (url: string) => void;
  setOption: (k: string, v: unknown) => void;
  save: () => Promise<void>;
  checkHealth: () => Promise<void>;
  current: () => MusicEngineMeta | undefined;
}

const DEFAULT_CONFIG: MusicEngineConfig = {
  engine: 'musicgen',
  url: '',
  options: { duration: 30, format: 'wav' },
};

export const useMusicEngineStore = create<MusicEngineState>((set, get) => ({
  engines: [],
  config: DEFAULT_CONFIG,
  health: 'unknown',
  loaded: false,

  init: async () => {
    try {
      const data = await fetch('/api/engines/music').then((r) => r.json());
      set({ engines: data.engines || [], config: data.config || DEFAULT_CONFIG, loaded: true });
    } catch { set({ loaded: true }); }
  },

  setEngine: (id) => set((s) => ({ config: { ...s.config, engine: id } })),
  setUrl: (url) => set((s) => ({ config: { ...s.config, url } })),
  setOption: (k, v) => set((s) => ({ config: { ...s.config, options: { ...s.config.options, [k]: v } } })),

  save: async () => {
    const { config } = get();
    await fetch('/api/music-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
    });
  },

  checkHealth: async () => {
    try {
      const data = await fetch('/api/music-config/health').then((r) => r.json());
      set({ health: data.ok ? 'ok' : 'error' });
    } catch { set({ health: 'error' }); }
  },

  current: () => {
    const { engines, config } = get();
    return engines.find((e) => e.id === config.engine);
  },
}));

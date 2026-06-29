import { create } from 'zustand';
import { audit } from '../db/sqldb';

export interface AudioEngineMeta {
  id: string;
  label: string;
  blurb: string;
  accent: string;
  capabilities: string[];
  options: { voice: boolean; speed: boolean; format: boolean };
  voices: string[];
  formats: string[];
}

export interface AudioConfig {
  engine: string;
  url: string;
  options: { voice: string; speed: number; format: string };
}

const STORAGE_KEY = 'storybook.audioEngine.v1';

const DEFAULT_CONFIG: AudioConfig = {
  engine: 'qwen3-tts',
  url: '',
  options: { voice: '', speed: 1.0, format: 'wav' },
};

function load(): AudioConfig {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return { ...DEFAULT_CONFIG, ...JSON.parse(r) }; } catch { /* */ }
  return DEFAULT_CONFIG;
}

async function pushServer(cfg: AudioConfig) {
  await fetch('/api/audio-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: cfg.engine, url: cfg.url, options: cfg.options }),
  }).catch(() => {});
}

export interface EngineHealth { configured: boolean; ok: boolean; status?: string }

interface AudioEngineState {
  engines: AudioEngineMeta[];
  config: AudioConfig;
  loaded: boolean;
  health: EngineHealth;
  checkHealth: () => Promise<void>;
  init: () => Promise<void>;
  setEngine: (id: string) => void;
  setUrl: (url: string) => void;
  setOption: <K extends keyof AudioConfig['options']>(k: K, v: AudioConfig['options'][K]) => void;
  /** Explicitly re-push the current config to the server (used by the Save button). */
  save: () => Promise<void>;
  current: () => AudioEngineMeta | undefined;
}

function persist(cfg: AudioConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* */ }
  void pushServer(cfg);
}

export const useAudioEngineStore = create<AudioEngineState>((set, get) => ({
  engines: [],
  config: load(),
  loaded: false,
  health: { configured: false, ok: false },

  checkHealth: async () => {
    const url = get().config.url || '';
    if (!url || url.includes('REPLACE') || url.includes('xxxxx')) {
      set({ health: { configured: false, ok: false } });
      return;
    }
    try {
      const res = await fetch('/api/audio-config/health');
      const d = await res.json();
      set({ health: { configured: !!d.configured, ok: !!d.ok, status: d.status } });
    } catch {
      set({ health: { configured: true, ok: false } });
    }
  },

  init: async () => {
    try {
      const res = await fetch('/api/engines/audio');
      if (res.ok) {
        const data = await res.json();
        set({ engines: data.engines || [], loaded: true });
      }
    } catch { /* server not up */ }
    await pushServer(get().config);
    void get().checkHealth();
  },

  setEngine: (id) => { const config = { ...get().config, engine: id }; set({ config }); persist(config); void audit('engine.change', `Audio engine → ${id}`, { engine: id }); },
  setUrl: (url) => { const config = { ...get().config, url }; set({ config }); persist(config); },
  setOption: (k, v) => { const config = { ...get().config, options: { ...get().config.options, [k]: v } }; set({ config }); persist(config); },
  save: async () => { await pushServer(get().config); await get().checkHealth(); },
  current: () => get().engines.find((e) => e.id === get().config.engine),
}));

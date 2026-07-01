import { create } from 'zustand';
import { audit, kvSet } from '../db/sqldb';

/**
 * Image-engine configuration on the client. The user picks an engine
 * (Ideogram 4 / Z-Image Turbo / …), gives each engine a URL (a local Mac URL
 * or a RunPod proxy URL), and toggles per-engine options. Persisted to
 * localStorage and pushed to the server (which performs generation).
 */
export interface EngineMeta {
  id: string;
  label: string;
  blurb: string;
  accent: string;
  model: string;
  options: { magic: boolean; preset: boolean; negativePrompt: boolean; steps: boolean; model?: boolean };
  presets: string[];
  models: string[];
  direct?: boolean;
  noUrl?: boolean;
}

export interface ImageConfig {
  engine: string;
  urls: Record<string, string>;
  options: { magic: boolean; preset: string; steps: number | null; negativePrompt: string; aspect_ratio: string; model: string };
}

const STORAGE_KEY = 'storybook.imageEngine.v1';

const DEFAULT_CONFIG: ImageConfig = {
  engine: 'ideogram4',
  urls: {},
  options: { magic: true, preset: 'DEFAULT', steps: null, negativePrompt: '', aspect_ratio: '1:1', model: '' },
};

function load(): ImageConfig {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return { ...DEFAULT_CONFIG, ...JSON.parse(r) }; } catch { /* */ }
  return DEFAULT_CONFIG;
}

async function pushServer(cfg: ImageConfig) {
  await fetch('/api/image-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: cfg.engine, urls: cfg.urls, options: cfg.options }),
  }).catch(() => {});
}

export interface EngineHealth { configured: boolean; ok: boolean; status?: string }

interface ImageEngineState {
  engines: EngineMeta[];
  config: ImageConfig;
  loaded: boolean;
  health: EngineHealth;
  checkHealth: () => Promise<void>;
  init: () => Promise<void>;
  setEngine: (id: string) => void;
  setUrl: (engineId: string, url: string) => void;
  setOption: <K extends keyof ImageConfig['options']>(k: K, v: ImageConfig['options'][K]) => void;
  /** Explicitly re-push the current config to the server (used by the Save button). */
  save: () => Promise<void>;
  current: () => EngineMeta | undefined;
}

function persist(cfg: ImageConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* */ }
  void kvSet('image.config', JSON.stringify(cfg)); // mirror to sql.js → DB Explorer › kv
  void pushServer(cfg);
}

export const useImageEngineStore = create<ImageEngineState>((set, get) => ({
  engines: [],
  config: load(),
  loaded: false,
  health: { configured: false, ok: false },

  checkHealth: async () => {
    // A URL must be set locally before there's any point pinging.
    const url = get().config.urls[get().config.engine] || '';
    if (!url || url.includes('REPLACE') || url.includes('xxxxx')) {
      set({ health: { configured: false, ok: false } });
      return;
    }
    try {
      const res = await fetch('/api/image-config/health');
      const d = await res.json();
      set({ health: { configured: !!d.configured, ok: !!d.ok, status: d.status } });
    } catch {
      set({ health: { configured: true, ok: false } });
    }
  },

  init: async () => {
    try {
      const res = await fetch('/api/engines');
      if (res.ok) {
        const data = await res.json();
        set({ engines: data.engines || [], loaded: true });
      }
    } catch { /* server not up */ }
    // Push our persisted config so the (stateless) server adopts it, then poll health.
    await pushServer(get().config);
    void get().checkHealth();
  },

  setEngine: (id) => { const config = { ...get().config, engine: id }; set({ config }); persist(config); void audit('engine.change', `Image engine → ${id}`, { engine: id }); },
  setUrl: (engineId, url) => { const config = { ...get().config, urls: { ...get().config.urls, [engineId]: url } }; set({ config }); persist(config); },
  setOption: (k, v) => { const config = { ...get().config, options: { ...get().config.options, [k]: v } }; set({ config }); persist(config); },
  save: async () => { persist(get().config); await pushServer(get().config); await get().checkHealth(); },
  current: () => get().engines.find((e) => e.id === get().config.engine),
}));

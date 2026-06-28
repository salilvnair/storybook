import { create } from 'zustand';
import { audit } from '../db/sqldb';

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
  options: { magic: boolean; preset: boolean; negativePrompt: boolean; steps: boolean };
  presets: string[];
}

export interface ImageConfig {
  engine: string;
  urls: Record<string, string>;
  options: { magic: boolean; preset: string; steps: number | null; negativePrompt: string; aspect_ratio: string };
}

const STORAGE_KEY = 'storybook.imageEngine.v1';

const DEFAULT_CONFIG: ImageConfig = {
  engine: 'ideogram4',
  urls: {},
  options: { magic: true, preset: 'DEFAULT', steps: null, negativePrompt: '', aspect_ratio: '1:1' },
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

interface ImageEngineState {
  engines: EngineMeta[];
  config: ImageConfig;
  loaded: boolean;
  init: () => Promise<void>;
  setEngine: (id: string) => void;
  setUrl: (engineId: string, url: string) => void;
  setOption: <K extends keyof ImageConfig['options']>(k: K, v: ImageConfig['options'][K]) => void;
  current: () => EngineMeta | undefined;
}

function persist(cfg: ImageConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* */ }
  void pushServer(cfg);
}

export const useImageEngineStore = create<ImageEngineState>((set, get) => ({
  engines: [],
  config: load(),
  loaded: false,

  init: async () => {
    try {
      const res = await fetch('/api/engines');
      if (res.ok) {
        const data = await res.json();
        set({ engines: data.engines || [], loaded: true });
      }
    } catch { /* server not up */ }
    // Push our persisted config so the (stateless) server adopts it.
    void pushServer(get().config);
  },

  setEngine: (id) => { const config = { ...get().config, engine: id }; set({ config }); persist(config); void audit('engine.change', `Image engine → ${id}`, { engine: id }); },
  setUrl: (engineId, url) => { const config = { ...get().config, urls: { ...get().config.urls, [engineId]: url } }; set({ config }); persist(config); },
  setOption: (k, v) => { const config = { ...get().config, options: { ...get().config.options, [k]: v } }; set({ config }); persist(config); },
  current: () => get().engines.find((e) => e.id === get().config.engine),
}));

import { create } from 'zustand';
import { audit, kvSet } from '../db/sqldb';

/**
 * Image-EDIT engine configuration on the client (S-E2) — sibling of
 * image-engine-store. The user picks an inpaint engine (FLUX.1-Fill-dev / …),
 * gives it a URL (a local Mac URL or a RunPod proxy URL), and tunes steps /
 * guidance / seed. Persisted to localStorage + sql.js `kv` and pushed to the
 * server, which performs the actual edit via /api/storybook/edit-image.
 */
export interface EditEngineMeta {
  id: string;
  label: string;
  blurb: string;
  accent: string;
  model: string;
  options: { steps: boolean; guidance: boolean; seed: boolean; model?: boolean };
  defaults: { steps?: number; guidance?: number };
  models: string[];
  direct?: boolean;
  noUrl?: boolean;
  wholeImageEdit?: boolean;
}

export interface EditConfig {
  engine: string;
  urls: Record<string, string>;
  options: { steps: number | null; guidance: number | null; seed: number | null; model: string };
}

const STORAGE_KEY = 'storybook.editEngine.v1';

const DEFAULT_CONFIG: EditConfig = {
  engine: 'flux2-edit',
  urls: {},
  options: { steps: null, guidance: null, seed: null, model: '' },
};

function load(): EditConfig {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return { ...DEFAULT_CONFIG, ...JSON.parse(r) }; } catch { /* */ }
  return DEFAULT_CONFIG;
}

async function pushServer(cfg: EditConfig) {
  await fetch('/api/edit-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: cfg.engine, urls: cfg.urls, options: cfg.options }),
  }).catch(() => {});
}

export interface EditEngineHealth { configured: boolean; ok: boolean; status?: string }

interface EditEngineState {
  engines: EditEngineMeta[];
  config: EditConfig;
  loaded: boolean;
  health: EditEngineHealth;
  checkHealth: () => Promise<void>;
  init: () => Promise<void>;
  setEngine: (id: string) => void;
  setUrl: (engineId: string, url: string) => void;
  setOption: <K extends keyof EditConfig['options']>(k: K, v: EditConfig['options'][K]) => void;
  save: () => Promise<void>;
  current: () => EditEngineMeta | undefined;
}

function persist(cfg: EditConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* */ }
  void kvSet('edit.config', JSON.stringify(cfg)); // mirror to sql.js → DB Explorer › kv
  void pushServer(cfg);
}

export const useEditEngineStore = create<EditEngineState>((set, get) => ({
  engines: [],
  config: load(),
  loaded: false,
  health: { configured: false, ok: false },

  checkHealth: async () => {
    const url = get().config.urls[get().config.engine] || '';
    if (!url || url.includes('REPLACE') || url.includes('xxxxx')) {
      set({ health: { configured: false, ok: false } });
      return;
    }
    try {
      const res = await fetch('/api/edit-config/health');
      const d = await res.json();
      set({ health: { configured: !!d.configured, ok: !!d.ok, status: d.status } });
    } catch {
      set({ health: { configured: true, ok: false } });
    }
  },

  init: async () => {
    try {
      const res = await fetch('/api/engines/edit');
      if (res.ok) {
        const data = await res.json();
        set({ engines: data.engines || [], loaded: true });
      }
    } catch { /* server not up */ }
    await pushServer(get().config);
    void get().checkHealth();
  },

  setEngine: (id) => { const config = { ...get().config, engine: id }; set({ config }); persist(config); void audit('engine.change', `Edit engine → ${id}`, { engine: id }); },
  setUrl: (engineId, url) => { const config = { ...get().config, urls: { ...get().config.urls, [engineId]: url } }; set({ config }); persist(config); },
  setOption: (k, v) => { const config = { ...get().config, options: { ...get().config.options, [k]: v } }; set({ config }); persist(config); },
  save: async () => { persist(get().config); await pushServer(get().config); await get().checkHealth(); },
  current: () => get().engines.find((e) => e.id === get().config.engine),
}));

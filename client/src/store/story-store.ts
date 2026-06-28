import { create } from 'zustand';
import { useTemplatesStore } from './templates-store';
import { usePrefsStore } from './prefs-store';
import { useImageEngineStore } from './image-engine-store';
import { useProvidersStore } from './providers-store';
import { useSettingsStore } from './settings-store';
import { audit, run } from '../db/sqldb';

/**
 * The image-engine override the client sends with every generation — the client
 * is the source of truth, so generation works even if the (stateless) server
 * restarted and lost its in-memory image config.
 */
function engineOverride(extra?: { runpodUrl?: string }) {
  const cfg = useImageEngineStore.getState().config;
  return { engine: cfg.engine, url: cfg.urls[cfg.engine] || '', options: cfg.options, ...extra };
}

/** Which chat + image engine produced this book — saved alongside the bundle. */
function genMeta() {
  const eng = useImageEngineStore.getState();
  const imageEngine = eng.engines.find((e) => e.id === eng.config.engine);
  const active = useProvidersStore.getState().providers.find((p) => p.isActive);
  const serverCfg = useSettingsStore.getState().serverConfig;
  return {
    chat: { provider: active?.name || (serverCfg?.llmModel ? 'server .env' : ''), model: active?.model || serverCfg?.llmModel || '' },
    image: { engine: eng.config.engine, label: imageEngine?.label || eng.config.engine },
  };
}

export interface Scene {
  index: number;
  title: string;
  narration: string;
  says: string;
  thinks: string;
  image_prompt: string;
}
export interface Story {
  title: string;
  author?: string;
  style?: string;
  scenes: Scene[];
}
export interface Page {
  index: number;
  title: string;
  image_b64: string;
}

type Phase = 'idle' | 'generating' | 'done' | 'error';

export interface GenStep {
  step: number; total: number; pct: number;
  elapsed_s: number; it_s: number;
  prompt?: string; seed?: number; config?: string;
}

interface StoryState {
  story: Story | null;
  phase: Phase;
  progress: { step: number; total: number; pct: number; label: string };
  cover: string;
  pages: Page[];
  warns: string[];
  error: string | null;
  pdfBase64: string | null;
  pdfFilename: string | null;
  storyId: string | null;
  genStep: GenStep | null;

  regenerating: number | null;
  regeneratingCover: boolean;

  setStory: (s: Story) => void;
  reset: () => void;
  generate: (override?: { runpodUrl?: string }) => Promise<void>;
  regeneratePage: (index: number, override?: { runpodUrl?: string }) => Promise<void>;
  regenerateCover: (override?: { runpodUrl?: string }) => Promise<void>;
}

async function rebuildPdf(story: Story, cover: string, pages: Page[], set: any) {
  try {
    const spec = useTemplatesStore.getState().defaultSpec();
    const pageImages = story.scenes.map((_, i) => pages[i]?.image_b64 || '');
    const res = await fetch('/api/storybook/rebuild-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story, cover, pages: pageImages, spec }),
    });
    const data = await res.json();
    if (data.pdf_base64) set({ pdfBase64: data.pdf_base64, pdfFilename: data.filename });
  } catch { /* non-fatal — stale PDF is better than an error */ }
}

export const useStoryStore = create<StoryState>((set, get) => ({
  story: null,
  phase: 'idle',
  progress: { step: 0, total: 0, pct: 0, label: '' },
  cover: '',
  pages: [],
  warns: [],
  error: null,
  pdfBase64: null,
  pdfFilename: null,
  storyId: null,
  genStep: null,
  regenerating: null,
  regeneratingCover: false,

  setStory: (s) => set({ story: s }),

  regenerateCover: async (override) => {
    const story = get().story;
    if (!story) return;
    set({ regeneratingCover: true });
    try {
      const res = await fetch('/api/storybook/regenerate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, override: engineOverride(override) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const newCover = data.image_b64 || get().cover;
      set({ cover: newCover, regeneratingCover: false });
      void rebuildPdf(story, newCover, get().pages, set);
    } catch (err) {
      set({ regeneratingCover: false, warns: [...get().warns, `Re-roll cover: ${err instanceof Error ? err.message : String(err)}`] });
    }
  },

  regeneratePage: async (index, override) => {
    const story = get().story;
    const scene = story?.scenes[index];
    if (!scene) return;
    set({ regenerating: index });
    try {
      const res = await fetch('/api/storybook/regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, style: story?.style, override: engineOverride(override) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const pages = [...get().pages];
      pages[index] = { index, title: scene.title, image_b64: data.image_b64 || '' };
      set({ pages, regenerating: null });
      void rebuildPdf(story, get().cover, pages, set);
    } catch (err) {
      set({ regenerating: null, warns: [...get().warns, `Re-roll scene ${index + 1}: ${err instanceof Error ? err.message : String(err)}`] });
    }
  },

  reset: () =>
    set({
      phase: 'idle',
      progress: { step: 0, total: 0, pct: 0, label: '' },
      cover: '',
      pages: [],
      warns: [],
      error: null,
      pdfBase64: null,
      pdfFilename: null,
      storyId: null,
      genStep: null,
      regeneratingCover: false,
    }),

  generate: async (override) => {
    const story = get().story;
    if (!story) return;

    // Seed empty page placeholders so the gallery shows the layout immediately
    const seededPages: Page[] = story.scenes.map((sc) => ({ index: sc.index - 1, title: sc.title, image_b64: '' }));
    set({
      phase: 'generating',
      progress: { step: 0, total: story.scenes.length + 2, pct: 0, label: 'Starting…' },
      cover: '',
      pages: seededPages,
      warns: [],
      error: null,
      pdfBase64: null,
      pdfFilename: null,
    });

    // Use the consumer's chosen default template + their AI feature toggles.
    const spec = useTemplatesStore.getState().defaultSpec();
    const features = usePrefsStore.getState().prefs.features;
    const t0 = Date.now();
    void audit('story.generate', `Generating "${story.title}" (${story.scenes.length} scenes)`, {
      title: story.title, scenes: story.scenes.length, template: spec.name,
    });

    try {
      const res = await fetch('/api/storybook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, override: engineOverride(override), spec, features, meta: genMeta() }),
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt: any;
          try { evt = JSON.parse(trimmed); } catch { continue; }
          handleEvent(evt, set, get);
        }
      }
      if (get().phase === 'done') {
        void audit('story.done', `Finished "${story.title}" in ${((Date.now() - t0) / 1000).toFixed(0)}s`, {
          title: story.title, scenes: story.scenes.length, ms: Date.now() - t0,
        });
      }
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

function handleEvent(evt: any, set: any, get: any) {
  switch (evt.type) {
    case 'progress':
      set({ progress: { step: evt.step, total: evt.total, pct: evt.pct, label: evt.label } });
      break;
    case 'cover':
      set({ cover: evt.image_b64 || '' });
      break;
    case 'page': {
      const pages = [...get().pages];
      pages[evt.index] = { index: evt.index, title: evt.title, image_b64: evt.image_b64 || '' };
      set({ pages });
      break;
    }
    case 'warn':
      set({ warns: [...get().warns, evt.message] });
      break;
    case 'gen_step':
      set({ genStep: { step: evt.step, total: evt.total, pct: evt.pct, elapsed_s: evt.elapsed_s, it_s: evt.it_s, prompt: evt.prompt, seed: evt.seed, config: evt.config } });
      break;
    case 'done': {
      set({ phase: 'done', genStep: null, pdfBase64: evt.pdf_base64, pdfFilename: evt.filename, storyId: evt.storyId || null, progress: { step: 1, total: 1, pct: 100, label: 'Storybook ready!' } });
      // Mirror a DB row pointing to the saved bundle (daakia-style; visible in DB Explorer).
      const st = get().story;
      if (evt.storyId && st) {
        const m = genMeta();
        void run('INSERT OR REPLACE INTO stories (id, title, page_count, chat_model, image_engine, created_at) VALUES (?,?,?,?,?,?)', [
          evt.storyId, st.title, st.scenes.length, m.chat.model, m.image.label, new Date().toISOString(),
        ]);
        void audit('story.done', `Saved "${st.title}" (${st.scenes.length} pages)`, { id: evt.storyId, image: m.image.label });
      }
      break;
    }
    case 'error':
      set({ phase: 'error', genStep: null, error: evt.message });
      break;
  }
}

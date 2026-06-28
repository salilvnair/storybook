import { create } from 'zustand';
import { useTemplatesStore } from './templates-store';
import { usePrefsStore } from './prefs-store';
import { audit } from '../db/sqldb';

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

  regenerating: number | null;

  setStory: (s: Story) => void;
  reset: () => void;
  generate: (override?: { runpodUrl?: string }) => Promise<void>;
  regeneratePage: (index: number, override?: { runpodUrl?: string }) => Promise<void>;
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
  regenerating: null,

  setStory: (s) => set({ story: s }),

  regeneratePage: async (index, override) => {
    const story = get().story;
    const scene = story?.scenes[index];
    if (!scene) return;
    set({ regenerating: index });
    try {
      const res = await fetch('/api/storybook/regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, style: story?.style, override }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const pages = [...get().pages];
      pages[index] = { index, title: scene.title, image_b64: data.image_b64 || '' };
      set({ pages, regenerating: null });
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
    const features = usePrefsStore.getState().features;
    const t0 = Date.now();
    void audit('story.generate', `Generating "${story.title}" (${story.scenes.length} scenes)`, {
      title: story.title, scenes: story.scenes.length, template: spec.name,
    });

    try {
      const res = await fetch('/api/storybook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, override, spec, features }),
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
    case 'done':
      set({ phase: 'done', pdfBase64: evt.pdf_base64, pdfFilename: evt.filename, progress: { step: 1, total: 1, pct: 100, label: 'Storybook ready!' } });
      break;
    case 'error':
      set({ phase: 'error', error: evt.message });
      break;
  }
}

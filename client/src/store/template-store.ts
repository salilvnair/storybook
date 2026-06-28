import { create } from 'zustand';
import { useTabsStore } from './tabs-store';

export interface CardRect { x: number; y: number; w: number; h: number } // 0–1 fractions of the text page

export interface TemplateSpec {
  name: string;
  pageKind: 'spread' | 'single';
  aspect: '2:1' | '3:2' | '1:1';
  textSide: 'left' | 'right';
  imageAspect: '1:1' | '3:4' | '4:3';
  glow: boolean;
  palette: string[];
  cardColor: string;
  frameColor: string;
  emphasisColor: string;
  inkColor: string;
  cardRect?: CardRect; // where the text card sits within the text page (drag/resize)
}

export const DEFAULT_CARD_RECT: CardRect = { x: 0.13, y: 0.28, w: 0.74, h: 0.44 };

export const DEFAULT_SPEC: TemplateSpec = {
  name: 'Classic board-book spread',
  pageKind: 'spread',
  aspect: '2:1',
  textSide: 'left',
  imageAspect: '1:1',
  glow: true,
  palette: ['#FCD653', '#F5BF6B', '#F7CCD7', '#FCD9B3', '#CFE0BF', '#E1D2EC', '#FAC7B7', '#CCE6DC'],
  cardColor: '#FFFDED',
  frameColor: '#73523A',
  emphasisColor: '#BC1F1F',
  inkColor: '#2E2426',
  cardRect: DEFAULT_CARD_RECT,
};

// A few one-click palette themes for the controls card.
export const PALETTE_THEMES: { name: string; colors: string[] }[] = [
  { name: 'Sunny', colors: ['#FCD653', '#F5BF6B', '#F7CCD7', '#FCD9B3', '#CFE0BF', '#E1D2EC'] },
  { name: 'Pastel', colors: ['#F7CCD7', '#CFE0BF', '#CCE6DC', '#E1D2EC', '#FCE3B3', '#C9E2F0'] },
  { name: 'Forest', colors: ['#CFE0BF', '#A9C9A4', '#CCE6DC', '#E7E0B8', '#BFD8C2', '#D8E6C0'] },
  { name: 'Dusk', colors: ['#E1D2EC', '#C9C2E8', '#F3C6D3', '#CBD6F0', '#E8D0E0', '#D4C5E8'] },
];

interface TemplateState {
  spec: TemplateSpec;
  samplePdf: string | null;
  rendering: boolean;
  error: string | null;
  setSpec: (patch: Partial<TemplateSpec>) => void;
  renderSample: () => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  spec: DEFAULT_SPEC,
  samplePdf: null,
  rendering: false,
  error: null,

  setSpec: (patch) => set((s) => ({ spec: { ...s.spec, ...patch } })),

  renderSample: async () => {
    set({ rendering: true, error: null });
    try {
      const res = await fetch('/api/template/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: get().spec }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ samplePdf: data.pdf_base64, rendering: false });
      // Open the rendered sample in a new IN-APP tab (not a browser tab).
      useTabsStore.getState().open('sample-preview');
    } catch (err) {
      set({ rendering: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

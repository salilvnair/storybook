import { create } from 'zustand';
import { all, run } from '../db/sqldb';
import { usePrefsStore } from './prefs-store';

export type ElementType = 'text' | 'image' | 'sticker' | 'shape' | 'bubble';
export type BubbleTail = 'none' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface ElementStyle {
  fontFamily?: string;
  fontSize?: number;       // em units, relative to canvas width
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  background?: string;
  opacity?: number;
  borderRadius?: number;   // px
  bubbleTail?: BubbleTail;
  emojiSize?: number;      // em
}

export interface PageElement {
  id: string;
  type: ElementType;
  x: number; y: number;   // 0-1 fractions of canvas
  w: number; h: number;
  z: number;
  rotation: number;
  content?: string;
  style?: ElementStyle;
}

export interface PageDesign {
  elements: PageElement[];
}

interface PageDesignState {
  designs: Record<string, Record<number, PageDesign>>;
  variants: Record<string, Record<number, string[]>>;
  loaded: boolean;

  load: () => Promise<void>;
  getDesign: (storyId: string, pageIdx: number) => PageDesign;
  setDesign: (storyId: string, pageIdx: number, design: PageDesign) => void;
  addElement: (storyId: string, pageIdx: number, el: PageElement) => void;
  updateElement: (storyId: string, pageIdx: number, id: string, patch: Partial<PageElement>) => void;
  removeElement: (storyId: string, pageIdx: number, id: string) => void;
  clearPage: (storyId: string, pageIdx: number) => void;

  getVariants: (storyId: string, pageIdx: number) => string[];
  addVariant: (storyId: string, pageIdx: number, img: string) => void;
  clearVariants: (storyId: string, pageIdx: number) => void;
}

export const usePageDesignStore = create<PageDesignState>((set, get) => ({
  designs: {},
  variants: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;

    let designRows = await all<{ story_id: string; page_idx: number; elements_json: string }>('SELECT * FROM page_designs');

    // One-time migration from localStorage → sql.js
    if (designRows.length === 0) {
      try {
        const lsDesigns = localStorage.getItem('istorybook_page_designs');
        const lsVariants = localStorage.getItem('istorybook_page_variants');
        const now = new Date().toISOString();
        if (lsDesigns) {
          const old = JSON.parse(lsDesigns) as Record<string, Record<string, PageDesign>>;
          for (const [storyId, pages] of Object.entries(old)) {
            for (const [idx, design] of Object.entries(pages)) {
              await run(
                `INSERT OR IGNORE INTO page_designs (story_id, page_idx, elements_json, updated_at) VALUES (?,?,?,?)`,
                [storyId, Number(idx), JSON.stringify(design.elements), now],
              );
            }
          }
          localStorage.removeItem('istorybook_page_designs');
        }
        if (lsVariants) {
          const old = JSON.parse(lsVariants) as Record<string, Record<string, string[]>>;
          for (const [storyId, pages] of Object.entries(old)) {
            for (const [idx, variants] of Object.entries(pages)) {
              if (variants.length) {
                await run(
                  `INSERT OR IGNORE INTO page_variants (story_id, page_idx, variants_json, updated_at) VALUES (?,?,?,?)`,
                  [storyId, Number(idx), JSON.stringify(variants), now],
                );
              }
            }
          }
          localStorage.removeItem('istorybook_page_variants');
        }
        designRows = await all<{ story_id: string; page_idx: number; elements_json: string }>('SELECT * FROM page_designs');
      } catch { /* migration failed, start fresh */ }
    }

    const designs: Record<string, Record<number, PageDesign>> = {};
    for (const row of designRows) {
      if (!designs[row.story_id]) designs[row.story_id] = {};
      designs[row.story_id][row.page_idx] = { elements: JSON.parse(row.elements_json as string) };
    }

    const variantRows = await all<{ story_id: string; page_idx: number; variants_json: string }>('SELECT * FROM page_variants');
    const variants: Record<string, Record<number, string[]>> = {};
    for (const row of variantRows) {
      if (!variants[row.story_id]) variants[row.story_id] = {};
      variants[row.story_id][row.page_idx] = JSON.parse(row.variants_json as string);
    }

    set({ designs, variants, loaded: true });
  },

  getDesign: (storyId, pageIdx) => get().designs[storyId]?.[pageIdx] ?? { elements: [] },

  setDesign: (storyId, pageIdx, design) => {
    set((s) => ({
      designs: { ...s.designs, [storyId]: { ...s.designs[storyId], [pageIdx]: design } },
    }));
    void run(
      `INSERT INTO page_designs (story_id, page_idx, elements_json, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(story_id, page_idx) DO UPDATE SET elements_json=excluded.elements_json, updated_at=excluded.updated_at`,
      [storyId, pageIdx, JSON.stringify(design.elements), new Date().toISOString()],
    );
  },

  addElement: (storyId, pageIdx, el) => {
    const d = get().getDesign(storyId, pageIdx);
    get().setDesign(storyId, pageIdx, { elements: [...d.elements, el] });
  },

  updateElement: (storyId, pageIdx, id, patch) => {
    const d = get().getDesign(storyId, pageIdx);
    get().setDesign(storyId, pageIdx, {
      elements: d.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  },

  removeElement: (storyId, pageIdx, id) => {
    const d = get().getDesign(storyId, pageIdx);
    get().setDesign(storyId, pageIdx, { elements: d.elements.filter((e) => e.id !== id) });
  },

  clearPage: (storyId, pageIdx) => get().setDesign(storyId, pageIdx, { elements: [] }),

  getVariants: (storyId, pageIdx) => get().variants[storyId]?.[pageIdx] ?? [],

  addVariant: (storyId, pageIdx, img) => {
    const maxVariants = usePrefsStore.getState().prefs.maxVariants ?? 4;
    const prev = get().getVariants(storyId, pageIdx);
    const next = [...prev.slice(-(maxVariants - 1)), img];
    set((s) => ({
      variants: { ...s.variants, [storyId]: { ...s.variants[storyId], [pageIdx]: next } },
    }));
    void run(
      `INSERT INTO page_variants (story_id, page_idx, variants_json, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(story_id, page_idx) DO UPDATE SET variants_json=excluded.variants_json, updated_at=excluded.updated_at`,
      [storyId, pageIdx, JSON.stringify(next), new Date().toISOString()],
    );
  },

  clearVariants: (storyId, pageIdx) => {
    set((s) => ({
      variants: { ...s.variants, [storyId]: { ...s.variants[storyId], [pageIdx]: [] } },
    }));
    void run(
      `INSERT INTO page_variants (story_id, page_idx, variants_json, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(story_id, page_idx) DO UPDATE SET variants_json='[]', updated_at=excluded.updated_at`,
      [storyId, pageIdx, '[]', new Date().toISOString()],
    );
  },
}));

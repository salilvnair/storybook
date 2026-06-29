import { create } from 'zustand';

export const FONT_OPTIONS = [
  { value: 'Georgia, serif', label: 'Georgia (Serif)' },
  { value: '"Palatino Linotype", Palatino, serif', label: 'Palatino (Classic)' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Arial, sans-serif', label: 'Arial (Clean)' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet (Friendly)' },
  { value: '"Comic Sans MS", Comic Sans, cursive', label: 'Comic Sans (Playful)' },
  { value: 'Verdana, sans-serif', label: 'Verdana (Wide)' },
  { value: '"Courier New", Courier, monospace', label: 'Courier (Type)' },
];

export interface BrandKit {
  bodyFont: string;
  headingFont: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;      // px for element default rounded corners
  defaultOpacity: number;    // 0-1
}

const DEFAULT_KIT: BrandKit = {
  bodyFont: 'Georgia, serif',
  headingFont: '"Palatino Linotype", Palatino, serif',
  accentColor: '#f97316',
  textColor: '#2E2426',
  backgroundColor: 'rgba(255,253,237,0.92)',
  borderRadius: 12,
  defaultOpacity: 1,
};

const LS_KEY = 'istorybook_brand_kit';

function load(): BrandKit {
  try { return { ...DEFAULT_KIT, ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Partial<BrandKit>) }; }
  catch { return DEFAULT_KIT; }
}

interface BrandKitState {
  kit: BrandKit;
  set: (patch: Partial<BrandKit>) => void;
  reset: () => void;
}

export const useBrandKitStore = create<BrandKitState>((set) => ({
  kit: load(),
  set: (patch) => {
    set((s) => {
      const next = { ...s.kit, ...patch };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* */ }
      return { kit: next };
    });
  },
  reset: () => {
    try { localStorage.removeItem(LS_KEY); } catch { /* */ }
    set({ kit: DEFAULT_KIT });
  },
}));

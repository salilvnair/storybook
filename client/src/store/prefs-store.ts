import { create } from 'zustand';

export interface AiFeatures {
  magicPrompt: boolean;
  speechBubbles: boolean;
  autoLoadModel: boolean;
}

export const ACCENTS: { name: string; accent: string; accent2: string; accent3: string }[] = [
  { name: 'Amber', accent: '#f59e0b', accent2: '#ec4899', accent3: '#8b5cf6' },
  { name: 'Ocean', accent: '#38bdf8', accent2: '#22d3ee', accent3: '#6366f1' },
  { name: 'Forest', accent: '#34d399', accent2: '#a3e635', accent3: '#14b8a6' },
  { name: 'Berry', accent: '#ec4899', accent2: '#f472b6', accent3: '#a855f7' },
];

const KEY = 'storybook.prefs.v1';

export interface Prefs {
  accent: string;
  features: AiFeatures;
  readerMode: 'classic' | 'pageflip';
  showCover: boolean;
  flipShadow: boolean;
  flipSpeed: number;
  maxAuditLogEntries: number;
  maxAiAuditEntries: number;
  maxVariants: number;
}

const DEFAULTS: Prefs = {
  accent: 'Amber',
  features: { magicPrompt: true, speechBubbles: true, autoLoadModel: true },
  readerMode: 'classic',
  showCover: true,
  flipShadow: true,
  flipSpeed: 900,
  maxAuditLogEntries: 10000,
  maxAiAuditEntries: 10000,
  maxVariants: 4,
};

function load(): Prefs {
  try { const r = localStorage.getItem(KEY); if (r) return { ...DEFAULTS, ...JSON.parse(r) }; } catch { /* */ }
  return DEFAULTS;
}

export function applyAccent(name: string) {
  const a = ACCENTS.find((x) => x.name === name) || ACCENTS[0];
  const root = document.documentElement.style;
  root.setProperty('--story-accent', a.accent);
  root.setProperty('--story-accent-2', a.accent2);
  root.setProperty('--story-accent-3', a.accent3);
}

interface PrefsState {
  prefs: Prefs;
  setAccent: (name: string) => void;
  setFeature: (k: keyof AiFeatures, v: boolean) => void;
  set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  save: () => Promise<void>;
}

function persist(p: Prefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ } }

export const usePrefsStore = create<PrefsState>((set, get) => {
  const init = load();
  if (typeof document !== 'undefined') applyAccent(init.accent);
  return {
    prefs: init,
    setAccent: (name) => {
      applyAccent(name);
      const prefs = { ...get().prefs, accent: name };
      set({ prefs });
      persist(prefs);
    },
    setFeature: (k, v) => {
      const prefs = { ...get().prefs, features: { ...get().prefs.features, [k]: v } };
      set({ prefs });
      persist(prefs);
    },
    set: (k, v) => {
      if (k === 'accent' && typeof v === 'string') applyAccent(v);
      const prefs = { ...get().prefs, [k]: v };
      set({ prefs });
      persist(prefs);
    },
    save: async () => { persist(get().prefs); },
  };
});

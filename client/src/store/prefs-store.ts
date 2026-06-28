import { create } from 'zustand';

export interface AiFeatures {
  magicPrompt: boolean;     // RunPod magic-prompt enhancement
  speechBubbles: boolean;   // ask the author for speech/thought bubbles
  autoLoadModel: boolean;   // warm the RunPod model before generating
}

export const ACCENTS: { name: string; accent: string; accent2: string; accent3: string }[] = [
  { name: 'Amber', accent: '#f59e0b', accent2: '#ec4899', accent3: '#8b5cf6' },
  { name: 'Ocean', accent: '#38bdf8', accent2: '#22d3ee', accent3: '#6366f1' },
  { name: 'Forest', accent: '#34d399', accent2: '#a3e635', accent3: '#14b8a6' },
  { name: 'Berry', accent: '#ec4899', accent2: '#f472b6', accent3: '#a855f7' },
];

const KEY = 'storybook.prefs.v1';

interface Prefs {
  accent: string;        // accent name
  features: AiFeatures;
}
const DEFAULTS: Prefs = {
  accent: 'Amber',
  features: { magicPrompt: true, speechBubbles: true, autoLoadModel: true },
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

interface PrefsState extends Prefs {
  setAccent: (name: string) => void;
  setFeature: (k: keyof AiFeatures, v: boolean) => void;
}

export const usePrefsStore = create<PrefsState>((set, get) => {
  const init = load();
  if (typeof document !== 'undefined') applyAccent(init.accent);
  const persist = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ } };
  return {
    ...init,
    setAccent: (name) => { applyAccent(name); set({ accent: name }); persist({ accent: name, features: get().features }); },
    setFeature: (k, v) => { const features = { ...get().features, [k]: v }; set({ features }); persist({ accent: get().accent, features }); },
  };
});

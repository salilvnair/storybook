/**
 * Language config — the master list of translation target languages, with
 * per-language enable/disable + custom order. Indian languages lead the default
 * list. Persisted to localStorage and mirrored to the sql.js `kv` table
 * (DB Explorer › kv › `language.config`). The reader's Language panel only shows
 * the ENABLED languages, in this order.
 */
import { create } from 'zustand';
import { kvSet } from '../db/sqldb';

export interface LangOption {
  id: string;
  label: string;
  /** Phrase sent to the /translate LLM (defaults to label). */
  translateAs?: string;
  enabled: boolean;
}

const KEY = 'storybook.languages.v1';

// Indian languages first (Hindi, Manglish, Malayalam …), then international.
export const DEFAULT_LANGUAGES: LangOption[] = [
  { id: 'hindi',     label: 'Hindi',     enabled: true },
  { id: 'manglish',  label: 'Manglish',  translateAs: 'Malayalam written using English letters (Manglish / romanised transliteration), NOT the Malayalam script', enabled: true },
  { id: 'malayalam', label: 'Malayalam', enabled: true },
  { id: 'tamil',     label: 'Tamil',     enabled: true },
  { id: 'telugu',    label: 'Telugu',    enabled: true },
  { id: 'kannada',   label: 'Kannada',   enabled: false },
  { id: 'bengali',   label: 'Bengali',   enabled: false },
  { id: 'marathi',   label: 'Marathi',   enabled: false },
  { id: 'spanish',    label: 'Spanish',    enabled: true },
  { id: 'french',     label: 'French',     enabled: true },
  { id: 'german',     label: 'German',     enabled: true },
  { id: 'italian',    label: 'Italian',    enabled: true },
  { id: 'portuguese', label: 'Portuguese', enabled: true },
  { id: 'arabic',     label: 'Arabic',     enabled: true },
  { id: 'japanese',   label: 'Japanese',   enabled: true },
  { id: 'korean',     label: 'Korean',     enabled: true },
  { id: 'chinese',    label: 'Chinese',    enabled: true },
  { id: 'dutch',      label: 'Dutch',      enabled: false },
  { id: 'polish',     label: 'Polish',     enabled: false },
  { id: 'swedish',    label: 'Swedish',    enabled: false },
  { id: 'norwegian',  label: 'Norwegian',  enabled: false },
  { id: 'russian',    label: 'Russian',    enabled: false },
];

function load(): LangOption[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as LangOption[];
      if (Array.isArray(saved) && saved.length) {
        // Merge: keep saved order/enabled, append any new defaults not yet stored.
        const byId = new Map(saved.map((l) => [l.id, l]));
        const merged = saved
          .map((s) => { const d = DEFAULT_LANGUAGES.find((x) => x.id === s.id); return d ? { ...d, enabled: s.enabled } : s; })
          .filter((l) => DEFAULT_LANGUAGES.some((d) => d.id === l.id));
        for (const d of DEFAULT_LANGUAGES) if (!byId.has(d.id)) merged.push(d);
        return merged;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_LANGUAGES.map((l) => ({ ...l }));
}

function persist(list: LangOption[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* */ }
  void kvSet('language.config', JSON.stringify(list));
}

interface LanguageConfigState {
  languages: LangOption[];
  setAll: (list: LangOption[]) => void;
  toggle: (id: string, enabled: boolean) => void;
  reset: () => void;
  /** Enabled languages in display order — used by the reader's Language panel. */
  enabled: () => LangOption[];
}

export const useLanguageConfigStore = create<LanguageConfigState>((set, get) => ({
  languages: load(),
  setAll: (list) => { set({ languages: list }); persist(list); },
  toggle: (id, enabled) => {
    const list = get().languages.map((l) => (l.id === id ? { ...l, enabled } : l));
    set({ languages: list }); persist(list);
  },
  reset: () => { const list = DEFAULT_LANGUAGES.map((l) => ({ ...l })); set({ languages: list }); persist(list); },
  enabled: () => get().languages.filter((l) => l.enabled),
}));

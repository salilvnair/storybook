import { create } from 'zustand';
import { all, run, audit } from '../db/sqldb';
import { ACCENTS } from './prefs-store';

/**
 * Customizable accent themes, persisted to the local sql.js DB (seeded from the
 * built-in ACCENTS). Each theme is 3 accent colours. Right-click a card to edit
 * its colours, add a new theme, or delete one — just like palettes.
 * The active theme id lives in localStorage so it can apply instantly on boot.
 */
export interface Theme {
  id: string;
  name: string;
  accent: string;
  accent2: string;
  accent3: string;
  sort: number;
}

const ACTIVE_KEY = 'storybook.themeActive.v1';
let loadInFlight: Promise<void> | null = null;

function uid() { return `thm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export function applyTheme(t: Pick<Theme, 'accent' | 'accent2' | 'accent3'>) {
  const root = document.documentElement.style;
  root.setProperty('--story-accent', t.accent);
  root.setProperty('--story-accent-2', t.accent2);
  root.setProperty('--story-accent-3', t.accent3);
}

interface ThemesState {
  themes: Theme[];
  activeId: string;
  loaded: boolean;
  load: () => Promise<void>;
  setActive: (id: string) => void;
  add: (t: Omit<Theme, 'id' | 'sort'>) => Promise<string>;
  update: (id: string, patch: Partial<Omit<Theme, 'id' | 'sort'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useThemesStore = create<ThemesState>((set, get) => ({
  themes: [],
  activeId: localStorage.getItem(ACTIVE_KEY) || '',
  loaded: false,

  load: async () => {
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      let rows = await all<{ id: string; name: string; accent: string; accent2: string; accent3: string; sort: number }>(
        'SELECT * FROM themes ORDER BY sort ASC, name ASC',
      );
      if (rows.length === 0) {
        const now = new Date().toISOString();
        for (let i = 0; i < ACCENTS.length; i++) {
          const a = ACCENTS[i];
          await run('INSERT INTO themes (id, name, accent, accent2, accent3, sort, updated_at) VALUES (?,?,?,?,?,?,?)', [
            uid(), a.name, a.accent, a.accent2, a.accent3, i, now,
          ]);
        }
        rows = await all('SELECT * FROM themes ORDER BY sort ASC, name ASC');
      }
      const themes: Theme[] = rows.map((r) => ({ id: r.id, name: r.name, accent: r.accent, accent2: r.accent2, accent3: r.accent3, sort: r.sort }));
      let activeId = get().activeId;
      if (!themes.some((t) => t.id === activeId)) activeId = themes[0]?.id || '';
      const active = themes.find((t) => t.id === activeId);
      if (active) applyTheme(active);
      set({ themes, activeId, loaded: true });
    })();
    try { await loadInFlight; } finally { loadInFlight = null; }
  },

  setActive: (id) => {
    const t = get().themes.find((x) => x.id === id);
    if (!t) return;
    applyTheme(t);
    localStorage.setItem(ACTIVE_KEY, id);
    set({ activeId: id });
    void audit('theme.apply', `Applied theme "${t.name}"`, { id });
  },

  add: async (t) => {
    const id = uid();
    const sort = get().themes.length;
    await run('INSERT INTO themes (id, name, accent, accent2, accent3, sort, updated_at) VALUES (?,?,?,?,?,?,?)', [
      id, t.name, t.accent, t.accent2, t.accent3, sort, new Date().toISOString(),
    ]);
    await get().load();
    return id;
  },

  update: async (id, patch) => {
    const t = get().themes.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, ...patch };
    await run('UPDATE themes SET name=?, accent=?, accent2=?, accent3=?, updated_at=? WHERE id=?', [
      next.name, next.accent, next.accent2, next.accent3, new Date().toISOString(), id,
    ]);
    await audit('theme.update', `Edited theme "${next.name}"`, { id });
    await get().load();
    if (get().activeId === id) applyTheme(next);
  },

  remove: async (id) => {
    await run('DELETE FROM themes WHERE id = ?', [id]);
    await get().load();
  },
}));

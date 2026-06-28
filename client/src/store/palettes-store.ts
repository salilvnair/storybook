import { create } from 'zustand';
import { all, run, audit } from '../db/sqldb';
import { PALETTE_THEMES } from './template-store';

/**
 * Editable colour palettes, persisted to the local sql.js DB. Up to MAX_PINNED
 * palettes are "pinned" and shown as cards in the Template builder. The rest
 * live in the manager. Seeded from PALETTE_THEMES on first run.
 */
export const MAX_PINNED = 4;

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  pinned: boolean;
  sort: number;
}

function uid() { return `pal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// Shared in-flight load so React StrictMode's double effect can't double-seed.
let loadInFlight: Promise<void> | null = null;

interface PalettesState {
  palettes: Palette[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (name: string, colors: string[], pinned?: boolean) => Promise<string>;
  update: (id: string, patch: { name?: string; colors?: string[] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  /** Pinned palettes (max MAX_PINNED), in sort order — these show as cards. */
  pinned: () => Palette[];
}

export const usePalettesStore = create<PalettesState>((set, get) => ({
  palettes: [],
  loaded: false,

  load: async () => {
    // De-dupe concurrent callers (StrictMode mounts the effect twice).
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      let rows = await all<{ id: string; name: string; colors_json: string; pinned: number; sort: number }>(
        'SELECT * FROM palettes ORDER BY sort ASC, name ASC',
      );
      // Seed from the built-in themes the very first time.
      if (rows.length === 0) {
        const now = new Date().toISOString();
        for (let i = 0; i < PALETTE_THEMES.length; i++) {
          const t = PALETTE_THEMES[i];
          await run('INSERT INTO palettes (id, name, colors_json, pinned, sort, updated_at) VALUES (?,?,?,?,?,?)', [
            uid(), t.name, JSON.stringify(t.colors), i < MAX_PINNED ? 1 : 0, i, now,
          ]);
        }
        rows = await all('SELECT * FROM palettes ORDER BY sort ASC, name ASC');
      }
      // Heal a previously double-seeded DB: drop exact (name+colors) duplicates.
      const seen = new Set<string>();
      const dupIds: string[] = [];
      for (const r of rows) {
        const k = `${r.name}::${r.colors_json}`;
        if (seen.has(k)) dupIds.push(r.id); else seen.add(k);
      }
      if (dupIds.length) {
        for (const id of dupIds) await run('DELETE FROM palettes WHERE id = ?', [id]);
        rows = rows.filter((r) => !dupIds.includes(r.id));
      }
      const palettes: Palette[] = rows.map((r) => ({
        id: r.id, name: r.name, colors: JSON.parse(r.colors_json), pinned: !!r.pinned, sort: r.sort,
      }));
      set({ palettes, loaded: true });
    })();
    try { await loadInFlight; } finally { loadInFlight = null; }
  },

  add: async (name, colors, pinned = false) => {
    const id = uid();
    const now = new Date().toISOString();
    const sort = get().palettes.length;
    // Respect the max-pinned cap.
    const pinnedCount = get().palettes.filter((p) => p.pinned).length;
    const canPin = pinned && pinnedCount < MAX_PINNED;
    await run('INSERT INTO palettes (id, name, colors_json, pinned, sort, updated_at) VALUES (?,?,?,?,?,?)', [
      id, name, JSON.stringify(colors), canPin ? 1 : 0, sort, now,
    ]);
    await audit('palette.add', `Added palette "${name}"`, { id });
    await get().load();
    return id;
  },

  update: async (id, patch) => {
    const p = get().palettes.find((x) => x.id === id);
    if (!p) return;
    const name = patch.name ?? p.name;
    const colors = patch.colors ?? p.colors;
    await run('UPDATE palettes SET name=?, colors_json=?, updated_at=? WHERE id=?', [
      name, JSON.stringify(colors), new Date().toISOString(), id,
    ]);
    await audit('palette.update', `Updated palette "${name}"`, { id });
    await get().load();
  },

  remove: async (id) => {
    const p = get().palettes.find((x) => x.id === id);
    await run('DELETE FROM palettes WHERE id = ?', [id]);
    await audit('palette.remove', `Removed palette "${p?.name ?? id}"`, { id });
    await get().load();
  },

  togglePin: async (id) => {
    const p = get().palettes.find((x) => x.id === id);
    if (!p) return;
    if (!p.pinned) {
      const pinnedCount = get().palettes.filter((x) => x.pinned).length;
      if (pinnedCount >= MAX_PINNED) {
        // Unpin the highest-sort pinned palette to make room (keeps the cap at 4).
        const victim = get().palettes.filter((x) => x.pinned).sort((a, b) => b.sort - a.sort)[0];
        if (victim) await run('UPDATE palettes SET pinned = 0 WHERE id = ?', [victim.id]);
      }
    }
    await run('UPDATE palettes SET pinned = ? WHERE id = ?', [p.pinned ? 0 : 1, id]);
    await get().load();
  },

  pinned: () => get().palettes.filter((p) => p.pinned).slice(0, MAX_PINNED),
}));

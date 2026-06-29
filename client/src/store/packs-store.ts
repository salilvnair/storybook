/**
 * S26 — .storybuddy pack store.
 * Tracks locally imported packs (installed from a .storybuddy JSON file).
 * Persisted to sql.js (page_designs / packs tables).
 */
import { create } from 'zustand';
import { all, run } from '../db/sqldb';
import type { TemplateSpec } from './template-store';
import type { Palette } from './palettes-store';
import type { StylePreset } from '../constants/style-presets';
import type { BrandKit } from './brandkit-store';

export interface StorybuddyPack {
  id: string;
  name: string;
  description: string;
  author?: string;
  exportedAt: string;
  installedAt: string;
  templates?: Array<{ name: string; spec: TemplateSpec }>;
  palettes?: Array<{ name: string; colors: string[] }>;
  artStyles?: StylePreset[];
  brandKit?: Partial<BrandKit>;
}

export interface StorybuddyFile {
  type: 'storybuddy-pack';
  version: string;
  name: string;
  description: string;
  author?: string;
  exportedAt: string;
  templates?: Array<{ name: string; spec: TemplateSpec }>;
  palettes?: Array<{ name: string; colors: string[] }>;
  artStyles?: StylePreset[];
  brandKit?: Partial<BrandKit>;
}

interface PacksState {
  packs: StorybuddyPack[];
  customArtStyles: StylePreset[];
  loaded: boolean;

  load: () => Promise<void>;
  install: (file: StorybuddyFile) => string;
  remove: (id: string) => void;
  addCustomStyle: (style: StylePreset) => void;
  removeCustomStyle: (id: string) => void;
}

const uid = () => Math.random().toString(36).slice(2, 9);

export const usePacksStore = create<PacksState>((set, get) => ({
  packs: [],
  customArtStyles: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;

    let packRows = await all<{ id: string; name: string; description: string; author: string | null; exported_at: string; installed_at: string; data_json: string }>('SELECT * FROM packs');

    // One-time migration from localStorage → sql.js
    if (packRows.length === 0) {
      try {
        const lsPacks = localStorage.getItem('istorybook_packs');
        if (lsPacks) {
          const old = JSON.parse(lsPacks) as StorybuddyPack[];
          for (const pack of old) {
            const { id, name, description, author, exportedAt, installedAt, ...rest } = pack;
            await run(
              `INSERT OR IGNORE INTO packs (id, name, description, author, exported_at, installed_at, data_json) VALUES (?,?,?,?,?,?,?)`,
              [id, name, description || '', author ?? null, exportedAt, installedAt, JSON.stringify(rest)],
            );
          }
          localStorage.removeItem('istorybook_packs');
          packRows = await all<{ id: string; name: string; description: string; author: string | null; exported_at: string; installed_at: string; data_json: string }>('SELECT * FROM packs');
        }
      } catch { /* migration failed */ }
    }

    let styleRows = await all<{ id: string; data_json: string }>('SELECT * FROM custom_art_styles');

    // One-time migration for custom art styles
    if (styleRows.length === 0) {
      try {
        const lsStyles = localStorage.getItem('istorybook_custom_styles');
        if (lsStyles) {
          const old = JSON.parse(lsStyles) as StylePreset[];
          for (const style of old) {
            await run(
              `INSERT OR IGNORE INTO custom_art_styles (id, data_json, created_at) VALUES (?,?,?)`,
              [style.id, JSON.stringify(style), new Date().toISOString()],
            );
          }
          localStorage.removeItem('istorybook_custom_styles');
          styleRows = await all<{ id: string; data_json: string }>('SELECT * FROM custom_art_styles');
        }
      } catch { /* migration failed */ }
    }

    const packs: StorybuddyPack[] = packRows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      author: (row.author as string | null) ?? undefined,
      exportedAt: row.exported_at as string,
      installedAt: row.installed_at as string,
      ...JSON.parse(row.data_json as string),
    }));

    const customArtStyles: StylePreset[] = styleRows.map((row) => JSON.parse(row.data_json as string));

    set({ packs, customArtStyles, loaded: true });
  },

  install: (file) => {
    const id = uid();
    const { templates, palettes, artStyles, brandKit } = file;
    const pack: StorybuddyPack = {
      id,
      name: file.name || 'Unnamed Pack',
      description: file.description || '',
      author: file.author,
      exportedAt: file.exportedAt,
      installedAt: new Date().toISOString(),
      templates,
      palettes,
      artStyles,
      brandKit,
    };
    set((s) => ({ packs: [...s.packs, pack] }));
    void run(
      `INSERT OR IGNORE INTO packs (id, name, description, author, exported_at, installed_at, data_json) VALUES (?,?,?,?,?,?,?)`,
      [id, pack.name, pack.description, pack.author ?? null, pack.exportedAt, pack.installedAt,
       JSON.stringify({ templates, palettes, artStyles, brandKit })],
    );
    return id;
  },

  remove: (id) => {
    set((s) => ({ packs: s.packs.filter((p) => p.id !== id) }));
    void run('DELETE FROM packs WHERE id=?', [id]);
  },

  addCustomStyle: (style) => {
    set((s) => ({ customArtStyles: [...s.customArtStyles.filter((x) => x.id !== style.id), style] }));
    void run(
      `INSERT INTO custom_art_styles (id, data_json, created_at) VALUES (?,?,?)
       ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json`,
      [style.id, JSON.stringify(style), new Date().toISOString()],
    );
  },

  removeCustomStyle: (id) => {
    set((s) => ({ customArtStyles: s.customArtStyles.filter((x) => x.id !== id) }));
    void run('DELETE FROM custom_art_styles WHERE id=?', [id]);
  },
}));

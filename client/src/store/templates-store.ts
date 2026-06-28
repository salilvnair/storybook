import { create } from 'zustand';
import { all, run, audit } from '../db/sqldb';
import { DEFAULT_SPEC, type TemplateSpec } from './template-store';

export interface SavedTemplate {
  id: string;
  name: string;
  spec: TemplateSpec;
  isDefault: boolean;
  updatedAt: string;
}

interface TemplatesState {
  saved: SavedTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (name: string, spec: TemplateSpec) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** The currently-selected default template spec (falls back to the built-in). */
  defaultSpec: () => TemplateSpec;
}

function uid() {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  saved: [],
  loaded: false,

  load: async () => {
    const rows = await all<{ id: string; name: string; spec_json: string; is_default: number; updated_at: string }>(
      'SELECT * FROM templates ORDER BY is_default DESC, updated_at DESC',
    );
    const saved: SavedTemplate[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      spec: JSON.parse(r.spec_json),
      isDefault: !!r.is_default,
      updatedAt: r.updated_at,
    }));
    set({ saved, loaded: true });
  },

  save: async (name, spec) => {
    const id = uid();
    const now = new Date().toISOString();
    const first = get().saved.length === 0;
    await run('INSERT INTO templates (id, name, spec_json, is_default, created_at, updated_at) VALUES (?,?,?,?,?,?)', [
      id, name, JSON.stringify(spec), first ? 1 : 0, now, now,
    ]);
    await audit('template.save', `Saved template "${name}"`, { id, name });
    await get().load();
  },

  setDefault: async (id) => {
    await run('UPDATE templates SET is_default = 0', []);
    await run('UPDATE templates SET is_default = 1 WHERE id = ?', [id]);
    const t = get().saved.find((s) => s.id === id);
    await audit('template.setDefault', `Set default template "${t?.name ?? id}"`, { id });
    await get().load();
  },

  remove: async (id) => {
    const t = get().saved.find((s) => s.id === id);
    await run('DELETE FROM templates WHERE id = ?', [id]);
    await audit('template.remove', `Deleted template "${t?.name ?? id}"`, { id });
    await get().load();
  },

  defaultSpec: () => {
    const d = get().saved.find((s) => s.isDefault) || get().saved[0];
    return d ? d.spec : DEFAULT_SPEC;
  },
}));

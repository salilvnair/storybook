import { create } from 'zustand';
import { run, all, kvSet } from '../db/sqldb';
import type { SqlValue } from 'sql.js';

export type CharacterRole = 'hero' | 'sidekick' | 'villain' | 'mentor' | 'minor';

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  species: string;
  age: string;
  lookDescription: string;
  traits: string[];
  lockedSeed: number | null;
  referenceImage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Serialized form sent to the server alongside a generate request. */
export interface CastEntry {
  id: string;
  name: string;
  lookDescription: string;
  lockedSeed: number | null;
}

interface Row {
  id: SqlValue;
  name: SqlValue;
  role: SqlValue;
  species: SqlValue;
  age: SqlValue;
  look_description: SqlValue;
  traits_json: SqlValue;
  locked_seed: SqlValue;
  reference_image: SqlValue;
  created_at: SqlValue;
  updated_at: SqlValue;
}

function rowToChar(r: Row): Character {
  return {
    id: String(r.id),
    name: String(r.name),
    role: (String(r.role || 'minor')) as CharacterRole,
    species: String(r.species || ''),
    age: String(r.age || ''),
    lookDescription: String(r.look_description || ''),
    traits: r.traits_json ? JSON.parse(String(r.traits_json)) : [],
    lockedSeed: r.locked_seed != null ? Number(r.locked_seed) : null,
    referenceImage: r.reference_image != null ? String(r.reference_image) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

const SEL_KEY = 'storybook.characters.selected.v1';

function loadSelected(): string[] {
  try {
    const raw = localStorage.getItem(SEL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSelected(ids: string[]) {
  const json = JSON.stringify(ids);
  try { localStorage.setItem(SEL_KEY, json); } catch { /* ignore */ }
  void kvSet('characters.selectedIds', json);
}

function uid(): string {
  return `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface CharactersState {
  characters: Character[];
  selectedIds: string[];
  editingId: string | null;

  load: () => Promise<void>;
  add: (data: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Character>;
  update: (id: string, patch: Partial<Omit<Character, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setEditing: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  getSelected: () => CastEntry[];
}

export const useCharactersStore = create<CharactersState>((set, get) => ({
  characters: [],
  selectedIds: loadSelected(),
  editingId: null,

  load: async () => {
    const rows = await all<Row>('SELECT * FROM characters ORDER BY created_at DESC');
    set({ characters: rows.map(rowToChar) });
  },

  add: async (data) => {
    const id = uid();
    const now = new Date().toISOString();
    await run(
      'INSERT INTO characters (id,name,role,species,age,look_description,traits_json,locked_seed,reference_image,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [id, data.name, data.role, data.species, data.age, data.lookDescription,
        JSON.stringify(data.traits), data.lockedSeed ?? null, data.referenceImage ?? null, now, now],
    );
    const char: Character = { ...data, id, createdAt: now, updatedAt: now };
    set((s) => ({ characters: [char, ...s.characters], editingId: id }));
    return char;
  },

  update: async (id, patch) => {
    const now = new Date().toISOString();
    const char = get().characters.find((c) => c.id === id);
    if (!char) return;
    const updated: Character = { ...char, ...patch, updatedAt: now };
    await run(
      'UPDATE characters SET name=?,role=?,species=?,age=?,look_description=?,traits_json=?,locked_seed=?,reference_image=?,updated_at=? WHERE id=?',
      [updated.name, updated.role, updated.species, updated.age, updated.lookDescription,
        JSON.stringify(updated.traits), updated.lockedSeed ?? null, updated.referenceImage ?? null, now, id],
    );
    set((s) => ({ characters: s.characters.map((c) => c.id === id ? updated : c) }));
  },

  remove: async (id) => {
    await run('DELETE FROM characters WHERE id=?', [id]);
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== id),
      editingId: s.editingId === id ? (s.characters.find((c) => c.id !== id)?.id ?? null) : s.editingId,
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    }));
    saveSelected(get().selectedIds);
  },

  setEditing: (id) => set({ editingId: id }),

  toggleSelected: (id) => {
    set((s) => {
      const next = s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id];
      saveSelected(next);
      return { selectedIds: next };
    });
  },

  setSelectedIds: (ids) => {
    saveSelected(ids);
    set({ selectedIds: ids });
  },

  getSelected: () => {
    const { characters, selectedIds } = get();
    return characters
      .filter((c) => selectedIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, lookDescription: c.lookDescription, lockedSeed: c.lockedSeed }));
  },
}));

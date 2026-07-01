/**
 * Character draft store — the single source of truth for the Character Studio
 * form, so BOTH the right-side form and the left-side "describe to AI" chat can
 * read/write it (mirrors the template-store pattern). The AI applies inferred
 * fields via `applyAi`; the form edits via `setField`.
 */
import { create } from 'zustand';
import type { Character, CharacterRole } from './characters-store';

export type CharacterDraft = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>;

/** Fields the AI is allowed to infer from a freeform description. */
export interface CharacterAiSpec {
  name?: string;
  role?: CharacterRole;
  species?: string;
  age?: string;
  lookDescription?: string;
  traits?: string[];
}

export const BLANK_DRAFT: CharacterDraft = {
  name: '', role: 'hero', species: 'human', age: 'young child (4–6)',
  lookDescription: '', traits: [], lockedSeed: null, referenceImage: null, voiceId: null,
};

interface CharacterDraftState {
  draft: CharacterDraft;
  dirty: boolean;
  setField: <K extends keyof CharacterDraft>(k: K, v: CharacterDraft[K]) => void;
  /** Merge AI-inferred fields into the draft (used by the chat renderers). */
  applyAi: (spec: CharacterAiSpec) => void;
  /** Load an existing character into the draft (or reset to blank when null). */
  loadFrom: (c: Character | null) => void;
  reset: () => void;
  clearDirty: () => void;
}

export const useCharacterDraftStore = create<CharacterDraftState>((set) => ({
  draft: { ...BLANK_DRAFT },
  dirty: false,
  setField: (k, v) => set((s) => ({ draft: { ...s.draft, [k]: v }, dirty: true })),
  applyAi: (spec) => set((s) => {
    const next: CharacterDraft = { ...s.draft };
    if (spec.name != null) next.name = spec.name;
    if (spec.role != null) next.role = spec.role;
    if (spec.species != null) next.species = spec.species;
    if (spec.age != null) next.age = spec.age;
    if (spec.lookDescription != null) next.lookDescription = spec.lookDescription;
    if (Array.isArray(spec.traits)) next.traits = spec.traits;
    return { draft: next, dirty: true };
  }),
  loadFrom: (c) => set({
    draft: c
      ? { name: c.name, role: c.role, species: c.species, age: c.age, lookDescription: c.lookDescription, traits: c.traits, lockedSeed: c.lockedSeed, referenceImage: c.referenceImage, voiceId: c.voiceId }
      : { ...BLANK_DRAFT },
    dirty: false,
  }),
  reset: () => set({ draft: { ...BLANK_DRAFT }, dirty: false }),
  clearDirty: () => set({ dirty: false }),
}));

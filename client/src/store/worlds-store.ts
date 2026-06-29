/** S24 — Story Universe / Series. Worlds group stories into a series. */
import { create } from 'zustand';
import { all, run, persist } from '../db/sqldb';

export interface World {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface WorldStory {
  world_id: string;
  story_id: string;
  episode: number;
  summary: string;
}

interface WorldsState {
  worlds: World[];
  worldStories: WorldStory[];
  activeWorldId: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  create: (name: string, description?: string) => Promise<World>;
  update: (id: string, patch: Partial<Pick<World, 'name' | 'description'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;

  linkStory: (worldId: string, storyId: string, episode: number, summary: string) => Promise<void>;
  unlinkStory: (worldId: string, storyId: string) => Promise<void>;
  storiesForWorld: (worldId: string) => WorldStory[];
  continuityContext: (worldId: string) => { characters: string; summaries: string };
}

export const useWorldsStore = create<WorldsState>((set, get) => ({
  worlds: [],
  worldStories: [],
  activeWorldId: null,
  loaded: false,

  load: async () => {
    const worlds = await all<World>('SELECT * FROM worlds ORDER BY created_at DESC');
    const worldStories = await all<WorldStory>('SELECT * FROM world_stories ORDER BY episode ASC');
    set({ worlds, worldStories, loaded: true });
  },

  create: async (name, description = '') => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run('INSERT INTO worlds (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)',
      [id, name, description, now, now]);
    await persist();
    const world: World = { id, name, description, created_at: now, updated_at: now };
    set((s) => ({ worlds: [world, ...s.worlds] }));
    return world;
  },

  update: async (id, patch) => {
    const now = new Date().toISOString();
    if (patch.name !== undefined) await run('UPDATE worlds SET name=?, updated_at=? WHERE id=?', [patch.name, now, id]);
    if (patch.description !== undefined) await run('UPDATE worlds SET description=?, updated_at=? WHERE id=?', [patch.description, now, id]);
    await persist();
    set((s) => ({ worlds: s.worlds.map((w) => w.id === id ? { ...w, ...patch, updated_at: now } : w) }));
  },

  remove: async (id) => {
    await run('DELETE FROM worlds WHERE id=?', [id]);
    await run('DELETE FROM world_stories WHERE world_id=?', [id]);
    await persist();
    set((s) => ({
      worlds: s.worlds.filter((w) => w.id !== id),
      worldStories: s.worldStories.filter((ws) => ws.world_id !== id),
      activeWorldId: s.activeWorldId === id ? null : s.activeWorldId,
    }));
  },

  setActive: (id) => set({ activeWorldId: id }),

  linkStory: async (worldId, storyId, episode, summary) => {
    await run(
      'INSERT INTO world_stories (world_id, story_id, episode, summary) VALUES (?,?,?,?) ON CONFLICT(world_id, story_id) DO UPDATE SET episode=excluded.episode, summary=excluded.summary',
      [worldId, storyId, episode, summary],
    );
    await persist();
    const ws: WorldStory = { world_id: worldId, story_id: storyId, episode, summary };
    set((s) => {
      const existing = s.worldStories.findIndex((x) => x.world_id === worldId && x.story_id === storyId);
      const updated = existing >= 0
        ? s.worldStories.map((x, i) => i === existing ? ws : x)
        : [...s.worldStories, ws];
      return { worldStories: updated };
    });
  },

  unlinkStory: async (worldId, storyId) => {
    await run('DELETE FROM world_stories WHERE world_id=? AND story_id=?', [worldId, storyId]);
    await persist();
    set((s) => ({ worldStories: s.worldStories.filter((x) => !(x.world_id === worldId && x.story_id === storyId)) }));
  },

  storiesForWorld: (worldId) => get().worldStories.filter((ws) => ws.world_id === worldId),

  continuityContext: (worldId) => {
    const { worldStories } = get();
    const entries = worldStories.filter((ws) => ws.world_id === worldId).sort((a, b) => a.episode - b.episode);
    const summaries = entries.map((e) => `Episode ${e.episode}: ${e.summary}`).join('\n');
    return { characters: '', summaries };
  },
}));

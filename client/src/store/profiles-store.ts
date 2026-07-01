/**
 * Multi-author profiles store — S46.
 * PIN-protected child/author profiles with per-profile reading stats.
 */
import { create } from 'zustand';
import { all, run, audit } from '../db/sqldb';

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  pin: string;
  role: 'child' | 'parent' | 'teacher';
  interests: string[];
  age?: number;
  readingLevel: 'pre' | 'early' | 'confident';
  createdAt: string;
}

interface ProfilesState {
  profiles: Profile[];
  activeProfileId: string;
  loaded: boolean;
  load: () => Promise<void>;
  add: (p: Omit<Profile, 'id' | 'createdAt'>) => Promise<void>;
  update: (id: string, p: Partial<Profile>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  switchTo: (id: string, pin: string) => Promise<void>;
  getActive: () => Profile | undefined;
}

function uid() { return `prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  activeProfileId: '',
  loaded: false,

  load: async () => {
    try {
      await run(`CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '👤',
        pin TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'child',
        interests_json TEXT NOT NULL DEFAULT '[]', age INTEGER,
        reading_level TEXT NOT NULL DEFAULT 'early',
        created_at TEXT NOT NULL
      )`, []);
    } catch { /* already exists */ }

    const rows = await all<{
      id: string; name: string; emoji: string; pin: string; role: string;
      interests_json: string; age: number | null; reading_level: string; created_at: string;
    }>('SELECT * FROM profiles ORDER BY created_at');

    const profiles: Profile[] = rows.map((r) => ({
      id: r.id, name: r.name, emoji: r.emoji, pin: r.pin,
      role: (r.role as Profile['role']) || 'child',
      interests: JSON.parse(r.interests_json || '[]'),
      age: r.age ?? undefined,
      readingLevel: (r.reading_level as Profile['readingLevel']) || 'early',
      createdAt: r.created_at,
    }));

    const savedActive = localStorage.getItem('istorybook.activeProfile') || '';
    set({ profiles, loaded: true, activeProfileId: savedActive || profiles[0]?.id || '' });
  },

  add: async (p) => {
    const id = uid();
    await run(
      'INSERT INTO profiles (id, name, emoji, pin, role, interests_json, age, reading_level, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, p.name, p.emoji || '👤', p.pin, p.role, JSON.stringify(p.interests || []), p.age ?? null, p.readingLevel, new Date().toISOString()],
    );
    await audit('profiles.add', `Added profile "${p.name}"`, { id, role: p.role });
    await get().load();
  },

  update: async (id, p) => {
    const existing = get().profiles.find((x) => x.id === id);
    if (!existing) return;
    await run(
      'UPDATE profiles SET name=?, emoji=?, pin=?, role=?, interests_json=?, age=?, reading_level=? WHERE id=?',
      [p.name ?? existing.name, p.emoji ?? existing.emoji, p.pin ?? existing.pin, p.role ?? existing.role,
       JSON.stringify(p.interests ?? existing.interests), p.age ?? existing.age ?? null,
       p.readingLevel ?? existing.readingLevel, id],
    );
    await get().load();
  },

  remove: async (id) => {
    const p = get().profiles.find((x) => x.id === id);
    await run('DELETE FROM profiles WHERE id=?', [id]);
    await audit('profiles.remove', `Removed profile "${p?.name ?? id}"`, { id });
    await get().load();
  },

  switchTo: async (id, pin) => {
    const p = get().profiles.find((x) => x.id === id);
    if (!p) throw new Error('Profile not found');
    if (p.pin && p.pin !== pin) throw new Error('Wrong PIN');
    set({ activeProfileId: id });
    localStorage.setItem('istorybook.activeProfile', id);
    await audit('profiles.switch', `Switched to profile "${p.name}"`, { id });
  },

  getActive: () => {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId);
  },
}));

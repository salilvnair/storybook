import { create } from 'zustand';
import { run, all, getDb, persist } from '../db/sqldb';
import type { SqlValue } from 'sql.js';

export interface VoiceProfile {
  id: string;
  label: string;
  engineId: string;
  cloneVoiceId: string;
  consentAt: string;
  createdAt: string;
}

interface Row {
  id: SqlValue;
  label: SqlValue;
  engine_id: SqlValue;
  clone_voice_id: SqlValue;
  consent_at: SqlValue;
  created_at: SqlValue;
}

function rowToVoice(r: Row): VoiceProfile {
  return {
    id: String(r.id),
    label: String(r.label),
    engineId: String(r.engine_id),
    cloneVoiceId: String(r.clone_voice_id),
    consentAt: String(r.consent_at),
    createdAt: String(r.created_at),
  };
}

function uid(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface VoicesState {
  voices: VoiceProfile[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (data: { label: string; engineId: string; cloneVoiceId: string; consentAt: string }) => Promise<VoiceProfile>;
  remove: (id: string) => Promise<void>;
}

export const useVoicesStore = create<VoicesState>((set, get) => ({
  voices: [],
  loaded: false,

  load: async () => {
    const rows = await all<Row>('SELECT * FROM voices ORDER BY created_at DESC');
    set({ voices: rows.map(rowToVoice), loaded: true });
  },

  add: async (data) => {
    const id = uid();
    const now = new Date().toISOString();
    await run(
      'INSERT INTO voices (id, label, engine_id, clone_voice_id, consent_at, created_at) VALUES (?,?,?,?,?,?)',
      [id, data.label, data.engineId, data.cloneVoiceId, data.consentAt, now],
    );
    const voice: VoiceProfile = { ...data, id, createdAt: now };
    set((s) => ({ voices: [voice, ...s.voices] }));
    return voice;
  },

  remove: async (id) => {
    await run('DELETE FROM voices WHERE id=?', [id]);
    set((s) => ({ voices: s.voices.filter((v) => v.id !== id) }));
    // Clear this voiceId from any characters using it
    const db = await getDb();
    db.run('UPDATE characters SET voice_id=NULL WHERE voice_id=?', [`clone:${id}`]);
    await persist();
  },
}));

import { create } from 'zustand';
import { kvSet } from '../db/sqldb';

/**
 * UI snapshot (daakia-style) — small bits of view state that should survive a
 * close/reopen so the app resumes exactly where you left off (which Settings
 * section was open, etc). Persisted to localStorage for instant restore and
 * mirrored to the sql.js `kv` table. The open tabs live in tabs-store.
 */
export interface UiSnapshot {
  settingsSection: string;
}

const KEY = 'storybook.ui.snapshot.v1';

function load(): UiSnapshot {
  try { const r = localStorage.getItem(KEY); if (r) return { settingsSection: 'general', ...JSON.parse(r) }; } catch { /* */ }
  return { settingsSection: 'general' };
}

function persist(snap: UiSnapshot) {
  const s = JSON.stringify(snap);
  try { localStorage.setItem(KEY, s); } catch { /* */ }
  void kvSet('ui.snapshot', s);
}

interface UiState extends UiSnapshot {
  setSettingsSection: (s: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  ...load(),
  setSettingsSection: (section) => { set({ settingsSection: section }); persist({ settingsSection: section }); },
}));

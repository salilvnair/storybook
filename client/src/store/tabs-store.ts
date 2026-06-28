import { create } from 'zustand';
import { kvSet } from '../db/sqldb';

export type TabType = 'story' | 'templates' | 'library' | 'sample-preview' | 'settings';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  closable: boolean;
}

// Singleton tabs re-focus instead of duplicating.
const SINGLETON: TabType[] = ['templates', 'library', 'sample-preview', 'settings'];

const META: Record<TabType, { title: string; closable: boolean }> = {
  'story': { title: 'My Story', closable: true },
  'templates': { title: 'Templates', closable: true },
  'library': { title: 'Library', closable: true },
  'sample-preview': { title: 'Sample', closable: true },
  'settings': { title: 'Settings', closable: true },
};

function uid() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface TabsState {
  tabs: Tab[];
  activeId: string;
  open: (type: TabType) => void;
  newStory: () => void;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
  closeRight: (id: string) => void;
  closeLeft: (id: string) => void;
  closeAll: () => void;
  duplicate: (id: string) => void;
  activate: (id: string) => void;
  reorder: (from: number, to: number) => void;
  rename: (id: string, title: string) => void;
}

const TABS_KEY = 'storybook.ui.tabs.v1';

/** Restore the open tabs + active tab so the app resumes where you left off. */
function loadTabs(): { tabs: Tab[]; activeId: string } {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { tabs?: Tab[]; activeId?: string };
      if (Array.isArray(p.tabs) && p.tabs.length > 0) {
        const tabs = p.tabs.filter((t) => t && t.id && t.type);
        if (tabs.length > 0) {
          const activeId = tabs.some((t) => t.id === p.activeId) ? p.activeId! : tabs[0].id;
          return { tabs, activeId };
        }
      }
    }
  } catch { /* ignore */ }
  const first: Tab = { id: uid(), type: 'story', title: 'My Story', closable: true };
  return { tabs: [first], activeId: first.id };
}

const initialTabs = loadTabs();

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: initialTabs.tabs,
  activeId: initialTabs.activeId,

  open: (type) => {
    if (SINGLETON.includes(type)) {
      const existing = get().tabs.find((t) => t.type === type);
      if (existing) { set({ activeId: existing.id }); return; }
    }
    const tab: Tab = { id: uid(), type, title: META[type].title, closable: META[type].closable };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  newStory: () => {
    const tab: Tab = { id: uid(), type: 'story', title: 'My Story', closable: true };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  close: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) {
        const fresh: Tab = { id: uid(), type: 'story', title: 'My Story', closable: true };
        return { tabs: [fresh], activeId: fresh.id };
      }
      let activeId = s.activeId;
      if (activeId === id) activeId = (tabs[idx] || tabs[idx - 1] || tabs[0]).id;
      return { tabs, activeId };
    });
  },

  closeOthers: (id) => set((s) => {
    const keep = s.tabs.filter((t) => t.id === id || !t.closable);
    const tabs = keep.length ? keep : s.tabs.filter((t) => t.id === id);
    return { tabs, activeId: id };
  }),

  closeRight: (id) => set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return s;
    const tabs = s.tabs.filter((t, i) => i <= idx || !t.closable);
    const activeId = tabs.some((t) => t.id === s.activeId) ? s.activeId : id;
    return { tabs, activeId };
  }),

  closeLeft: (id) => set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return s;
    const tabs = s.tabs.filter((t, i) => i >= idx || !t.closable);
    const activeId = tabs.some((t) => t.id === s.activeId) ? s.activeId : id;
    return { tabs, activeId };
  }),

  closeAll: () => set((s) => {
    const keep = s.tabs.filter((t) => !t.closable);
    if (keep.length === 0) {
      const fresh: Tab = { id: uid(), type: 'story', title: 'My Story', closable: true };
      return { tabs: [fresh], activeId: fresh.id };
    }
    return { tabs: keep, activeId: keep[0].id };
  }),

  duplicate: (id) => set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return s;
    const src = s.tabs[idx];
    const copy: Tab = { ...src, id: uid() };
    const tabs = [...s.tabs];
    tabs.splice(idx + 1, 0, copy);
    return { tabs, activeId: copy.id };
  }),

  activate: (id) => set({ activeId: id }),

  reorder: (from, to) => set((s) => {
    if (from === to) return s;
    const tabs = [...s.tabs];
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved);
    return { tabs };
  }),

  rename: (id, title) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),
}));

// Persist the tab layout on every change — localStorage for instant restore,
// mirrored to the sql.js kv table (daakia-style, visible in the DB Explorer).
useTabsStore.subscribe((s) => {
  const snapshot = JSON.stringify({ tabs: s.tabs, activeId: s.activeId });
  try { localStorage.setItem(TABS_KEY, snapshot); } catch { /* ignore */ }
  void kvSet('ui.tabs', snapshot);
});

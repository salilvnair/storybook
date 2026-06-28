import { create } from 'zustand';
import { all, run, audit } from '../db/sqldb';

export interface Provider {
  key: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string;
  isActive: boolean;
}

/** Push the provider list + active key to the server so the chat uses it. */
async function syncServer(providers: Provider[], activeKey: string) {
  await fetch('/api/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providers: providers.map((p) => ({ key: p.key, name: p.name, type: p.type, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey })),
      activeKey,
    }),
  }).catch(() => {});
}

interface ProvidersState {
  providers: Provider[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (p: Omit<Provider, 'key' | 'isActive'>) => Promise<void>;
  update: (key: string, p: Omit<Provider, 'key' | 'isActive'>) => Promise<void>;
  remove: (key: string) => Promise<void>;
  setActive: (key: string) => Promise<void>;
}

function uid() { return `prov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  loaded: false,

  load: async () => {
    const rows = await all<{ key: string; name: string; type: string; base_url: string; model: string; api_key: string; is_active: number }>(
      'SELECT * FROM providers ORDER BY is_active DESC, name',
    );
    const providers: Provider[] = rows.map((r) => ({
      key: r.key, name: r.name, type: (r.type as 'openai' | 'anthropic') || 'openai',
      baseUrl: r.base_url, model: r.model, apiKey: r.api_key || '', isActive: !!r.is_active,
    }));
    set({ providers, loaded: true });
    void syncServer(providers, providers.find((p) => p.isActive)?.key || '');
  },

  add: async (p) => {
    const key = uid();
    const first = get().providers.length === 0;
    await run('INSERT INTO providers (key, name, type, base_url, model, api_key, is_active) VALUES (?,?,?,?,?,?,?)', [
      key, p.name, p.type, p.baseUrl, p.model, p.apiKey, first ? 1 : 0,
    ]);
    await audit('provider.add', `Added LLM provider "${p.name}" (${p.model})`, { key, name: p.name, model: p.model });
    await get().load();
  },

  update: async (key, p) => {
    await run('UPDATE providers SET name=?, type=?, base_url=?, model=?, api_key=? WHERE key=?', [
      p.name, p.type, p.baseUrl, p.model, p.apiKey, key,
    ]);
    await audit('provider.update', `Updated provider "${p.name}"`, { key });
    await get().load();
  },

  remove: async (key) => {
    const p = get().providers.find((x) => x.key === key);
    await run('DELETE FROM providers WHERE key = ?', [key]);
    await audit('provider.remove', `Removed provider "${p?.name ?? key}"`, { key });
    await get().load();
  },

  setActive: async (key) => {
    await run('UPDATE providers SET is_active = 0', []);
    await run('UPDATE providers SET is_active = 1 WHERE key = ?', [key]);
    const p = get().providers.find((x) => x.key === key);
    await audit('provider.setActive', `Active provider → "${p?.name ?? key}"`, { key });
    await get().load();
  },
}));

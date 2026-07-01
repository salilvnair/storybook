/**
 * Custom providers store — S29.
 * Manages providers added via the UI from JSON/OpenAPI schema.
 */
import { create } from 'zustand';
import { audit } from '../db/sqldb';

export interface CustomProviderSchema {
  id: string;
  label: string;
  capability: 'image' | 'tts' | 'music' | 'stt' | 'translate' | 'moderation' | 'llm';
  url: string;
  blurb?: string;
  accent?: string;
  invokeEndpoint?: string;
  invokeMethod?: string;
  healthEndpoint?: string;
  requestTemplate?: Record<string, unknown>;
  responseField?: string;
  options?: Record<string, unknown>;
}

export interface ProviderHealth {
  id: string;
  label: string;
  capability: string;
  ok: boolean;
  status?: string;
}

interface CustomProvidersState {
  schemas: CustomProviderSchema[];
  health: Record<string, ProviderHealth>;
  activeProviders: Record<string, string>;
  fallbackChains: Record<string, string[]>;
  loaded: boolean;
  load: () => Promise<void>;
  register: (schema: CustomProviderSchema) => Promise<void>;
  remove: (id: string) => Promise<void>;
  checkHealth: (capability?: string) => Promise<void>;
  setActive: (capability: string, id: string) => Promise<void>;
  setFallbackChain: (capability: string, chain: string[]) => Promise<void>;
}

export const useCustomProvidersStore = create<CustomProvidersState>((set, get) => ({
  schemas: [],
  health: {},
  activeProviders: {},
  fallbackChains: {},
  loaded: false,

  load: async () => {
    const [customRes, activeRes] = await Promise.all([
      fetch('/api/providers/sdk/custom').then((r) => r.json()).catch(() => ({ providers: [] })),
      fetch('/api/providers/sdk/active').then((r) => r.json()).catch(() => ({ active: {}, fallbacks: {} })),
    ]);
    set({
      schemas: customRes.providers || [],
      activeProviders: activeRes.active || {},
      fallbackChains: activeRes.fallbacks || {},
      loaded: true,
    });
  },

  register: async (schema) => {
    const res = await fetch('/api/providers/sdk/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to register provider');
    }
    await audit('provider.sdk.add', `Registered custom provider "${schema.label}" (${schema.capability})`, { id: schema.id });
    await get().load();
  },

  remove: async (id) => {
    await fetch(`/api/providers/sdk/custom/${id}`, { method: 'DELETE' });
    await audit('provider.sdk.remove', `Removed custom provider "${id}"`, { id });
    await get().load();
  },

  checkHealth: async (capability?) => {
    const url = capability
      ? `/api/providers/sdk/health?capability=${capability}`
      : '/api/providers/sdk/health';
    const res = await fetch(url).then((r) => r.json()).catch(() => ({ results: [] }));
    const health: Record<string, ProviderHealth> = {};
    for (const h of (res.results || [])) {
      health[h.id] = h;
    }
    set({ health });
  },

  setActive: async (capability, id) => {
    await fetch('/api/providers/sdk/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability, id }),
    });
    set((s) => ({ activeProviders: { ...s.activeProviders, [capability]: id } }));
  },

  setFallbackChain: async (capability, chain) => {
    await fetch('/api/providers/sdk/fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability, chain }),
    });
    set((s) => ({ fallbackChains: { ...s.fallbackChains, [capability]: chain } }));
  },
}));

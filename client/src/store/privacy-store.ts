/**
 * Privacy mode + Self-hosting store — S30.
 * Controls whether photos/voice never leave the device (local-only routing).
 */
import { create } from 'zustand';
import { kvSet } from '../db/sqldb';

interface PrivacyState {
  privacyMode: boolean;
  kidsMode: boolean;
  parentPin: string;
  localEngines: Array<{ label: string; url: string; capability: string; engine: string }>;
  setPrivacyMode: (v: boolean) => Promise<void>;
  setKidsMode: (enabled: boolean, pin?: string) => Promise<void>;
  detectLocalEngines: () => Promise<void>;
  getCostEstimate: () => Promise<{ local: string; cloud: string; recommendation: string }>;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  privacyMode: false,
  kidsMode: false,
  parentPin: '',
  localEngines: [],

  setPrivacyMode: async (v) => {
    set({ privacyMode: v });
    await kvSet('privacy.mode', String(v));
  },

  setKidsMode: async (enabled, pin) => {
    const res = await fetch('/api/kids-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, parentPin: pin, pin: get().parentPin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    set({ kidsMode: data.enabled, ...(pin ? { parentPin: pin } : {}) });
    await kvSet('kids.mode', String(data.enabled));
  },

  detectLocalEngines: async () => {
    const res = await fetch('/api/providers/sdk/detect-local', { method: 'POST' }).then((r) => r.json()).catch(() => ({ detected: [] }));
    set({ localEngines: res.detected || [] });
  },

  getCostEstimate: async () => {
    const local = get().localEngines.length;
    return {
      local: local > 0 ? `~$0 (${local} local engine${local > 1 ? 's' : ''} detected)` : '~$0 (when using local engines)',
      cloud: '~$0.01–$0.10 per image (RunPod / cloud)',
      recommendation: local > 0
        ? '🟢 Local engines detected — privacy mode + zero marginal cost available.'
        : '🟡 No local engines found. Use "Detect Local" or configure a local URL in engine settings.',
    };
  },
}));

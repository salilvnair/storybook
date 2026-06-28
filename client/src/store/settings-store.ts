import { create } from 'zustand';

export interface LlmSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  type: 'openai' | 'anthropic';
}
export interface StorySettings {
  llm: LlmSettings;
  runpodUrl: string;
}

export interface ServerConfig {
  llmConfigured: boolean;
  runpodConfigured: boolean;
  llmModel: string;
}

const STORAGE_KEY = 'storybook.settings.v1';

const DEFAULTS: StorySettings = {
  llm: { baseUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', apiKey: '', type: 'openai' },
  runpodUrl: '',
};

function load(): StorySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

interface SettingsStore {
  settings: StorySettings;
  serverConfig: ServerConfig | null;
  setLlm: (patch: Partial<LlmSettings>) => void;
  setRunpodUrl: (url: string) => void;
  fetchServerConfig: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: load(),
  serverConfig: null,

  setLlm: (patch) => {
    const settings = { ...get().settings, llm: { ...get().settings.llm, ...patch } };
    set({ settings });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  },

  setRunpodUrl: (url) => {
    const settings = { ...get().settings, runpodUrl: url };
    set({ settings });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  },

  fetchServerConfig: async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) set({ serverConfig: await res.json() });
    } catch { /* server not up yet */ }
  },
}));

import { create } from 'zustand';
import { all, run, audit } from '../db/sqldb';

/**
 * Prompt Library — every prompt follows the SAME generic structure: a System
 * prompt and a User prompt (shown as tabs in the editor), exactly like the Story
 * Author. The variables ribbon applies to BOTH tabs. Values are persisted to the
 * local sql.js DB (`prompts` table, keyed by overrideKey) and pushed to the
 * server as overrides. If the DB has no value, the built-in default is used.
 */
export interface PromptPart {
  id: 'system' | 'user';
  label: string;
  icon: string;
  /** Server override key this part maps to. */
  overrideKey: string;
  default: string;       // '' = use the server default
}

export interface PromptDef {
  key: string;
  label: string;
  category: 'Story' | 'Illustration';
  description: string;
  color: string;
  /** Variables apply to BOTH System and User tabs. */
  variables: string[];
  parts: PromptPart[];   // always [system, user]
}

export const PROMPT_DEFS: PromptDef[] = [
  {
    key: 'storySystem',
    label: 'Story Author',
    category: 'Story',
    description: "The children's-author persona + the 5-scene / speech-bubble protocol.",
    color: '#f59e0b',
    variables: ['{{message}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'storySystem', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'storyUser', default: '{{message}}' },
    ],
  },
  {
    key: 'sceneStyle',
    label: 'Illustration Style',
    category: 'Illustration',
    description: 'The art direction appended to every scene + cover image prompt.',
    color: '#ec4899',
    variables: [],
    parts: [
      {
        id: 'system', label: 'System', icon: '⚙', overrideKey: 'sceneStyle',
        default:
          "bright flat cartoon illustration for a young children's picture book, thick black outlines, " +
          'bold pastel colours, big expressive eyes, cute characters, simple clean background',
      },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'sceneStyleUser', default: '' },
    ],
  },
  {
    key: 'coverPrompt',
    label: 'Cover Prompt',
    category: 'Illustration',
    description: 'How the cover image is described. {{title}} and {{scene}} are filled in.',
    color: '#8b5cf6',
    variables: ['{{title}}', '{{scene}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'coverPromptStyle', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'coverPrompt', default: 'Children\'s picture book cover for "{{title}}". {{scene}}' },
    ],
  },
];

/** Flatten to [{def, part}] for convenience. */
export const ALL_PARTS = PROMPT_DEFS.flatMap((d) => d.parts.map((p) => ({ def: d, part: p })));

interface PromptsState {
  /** Stored values keyed by overrideKey ('' / missing = use default). */
  values: Record<string, string>;
  loaded: boolean;
  load: () => Promise<void>;
  set: (overrideKey: string, value: string) => Promise<void>;
  reset: (overrideKey: string) => Promise<void>;
}

function defaultFor(overrideKey: string): string {
  for (const { part } of ALL_PARTS) if (part.overrideKey === overrideKey) return part.default;
  return '';
}

/** Build the flat override map sent to the server (only non-empty values). */
function serverOverrides(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { part } of ALL_PARTS) {
    const v = values[part.overrideKey];
    if (v && v.trim()) out[part.overrideKey] = v;
  }
  return out;
}

function pushServer(values: Record<string, string>) {
  fetch('/api/prompts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serverOverrides(values)),
  }).catch(() => {});
}

let loadInFlight: Promise<void> | null = null;

export const usePromptsStore = create<PromptsState>((setState, get) => ({
  values: {},
  loaded: false,

  load: async () => {
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      const rows = await all<{ key: string; value: string }>('SELECT key, value FROM prompts');
      const values: Record<string, string> = {};
      for (const r of rows) values[r.key] = r.value;
      setState({ values, loaded: true });
      pushServer(values);
    })();
    try { await loadInFlight; } finally { loadInFlight = null; }
  },

  set: async (overrideKey, value) => {
    const values = { ...get().values, [overrideKey]: value };
    setState({ values });
    await run('INSERT INTO prompts (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', [
      overrideKey, value, new Date().toISOString(),
    ]);
    void audit('prompt.update', `Edited prompt "${overrideKey}"`, { key: overrideKey });
    pushServer(values);
  },

  reset: async (overrideKey) => {
    await get().set(overrideKey, defaultFor(overrideKey));
  },
}));

export { defaultFor as promptDefault };

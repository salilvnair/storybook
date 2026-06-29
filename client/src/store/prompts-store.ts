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
  category: PromptCategory;
  description: string;
  color: string;
  /** Variables apply to BOTH System and User tabs. */
  variables: string[];
  parts: PromptPart[];   // always [system, user]
}

export type PromptCategory = 'Story' | 'Illustration' | 'Character' | 'ArtDirector' | 'Branching' | 'Language' | 'Learning';

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
  {
    key: 'characterConsistency',
    label: 'Character Consistency',
    category: 'Character',
    description: 'Controls how character descriptions are embedded in every scene prompt. {{characters}} is replaced with "Name: look; Name2: look2".',
    color: '#34d399',
    variables: ['{{characters}}'],
    parts: [
      {
        id: 'system', label: 'System', icon: '⚙', overrideKey: 'characterClause',
        default: 'Characters (always draw with exactly these features) — {{characters}}.',
      },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'characterClauseNotes', default: '' },
    ],
  },
  {
    key: 'photoHeroPrompt',
    label: 'Photo → Hero Portrait',
    category: 'Character',
    description: 'Base portrait prompt used when generating a cartoon hero from a photo. {{characterClause}} is replaced with the active character consistency clause.',
    color: '#f59e0b',
    variables: ['{{characterClause}}'],
    parts: [
      {
        id: 'system', label: 'System', icon: '⚙', overrideKey: 'photoHeroPrompt',
        default: 'Portrait of a cute cartoon child character. {{characterClause}}',
      },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'photoHeroPromptNotes', default: '' },
    ],
  },
  {
    key: 'artDirectorPrompt',
    label: 'Art Director',
    category: 'ArtDirector',
    description: 'System prompt for the AI Art Director that analyses a story and recommends an illustration style. {{title}}, {{summary}}, and {{styles}} are injected automatically.',
    color: '#f97316',
    variables: ['{{title}}', '{{summary}}', '{{styles}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'artDirectorPrompt', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'artDirectorPromptNotes', default: '' },
    ],
  },
  // S21 — Branching
  {
    key: 'branchingPrompt',
    label: 'Branching Story',
    category: 'Branching',
    description: 'Prompt used to add branch choices to a linear story. {{story}} is replaced with the full story JSON.',
    color: '#34d399',
    variables: ['{{story}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'branchingPrompt', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'branchingPromptNotes', default: '' },
    ],
  },
  // S22 — Translate
  {
    key: 'translatePrompt',
    label: 'Translate Story',
    category: 'Language',
    description: 'Prompt to translate the story text into {{targetLanguage}}.',
    color: '#38bdf8',
    variables: ['{{targetLanguage}}', '{{story}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'translatePrompt', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'translatePromptNotes', default: '' },
    ],
  },
  // S22 — Adapt level
  {
    key: 'adaptLevelPrompt',
    label: 'Reading Level',
    category: 'Language',
    description: 'Rewrites story text for a target reading level: pre-reader, early-reader, or confident-reader.',
    color: '#a78bfa',
    variables: ['{{level}}', '{{story}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'adaptLevelPrompt', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'adaptLevelPromptNotes', default: '' },
    ],
  },
  // S23 — Quiz
  {
    key: 'quizPrompt',
    label: 'Comprehension Quiz',
    category: 'Learning',
    description: 'Generates comprehension questions, SEL skill tag, and parent prompts from the story.',
    color: '#fbbf24',
    variables: ['{{story}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'quizPrompt', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'quizPromptNotes', default: '' },
    ],
  },
  // S23 — Vocab
  {
    key: 'vocabPrompt',
    label: 'Vocabulary Card',
    category: 'Learning',
    description: 'Generates a kid-friendly definition for a tapped word. {{word}} and {{context}} are filled in.',
    color: '#fb923c',
    variables: ['{{word}}', '{{context}}'],
    parts: [
      { id: 'system', label: 'System', icon: '⚙', overrideKey: 'vocabPrompt', default: '' },
      { id: 'user', label: 'User', icon: '💬', overrideKey: 'vocabPromptNotes', default: '' },
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

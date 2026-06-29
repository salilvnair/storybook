/**
 * In-memory prompt overrides set from the Prompt Library tab. Single-user app,
 * so a global store is fine. Empty values fall back to the built-in defaults.
 */
const KEYS = [
  'storySystem', 'storyUser',
  'sceneStyle', 'sceneStyleUser',
  'coverPrompt', 'coverPromptStyle',
  'characterClause', 'characterClauseNotes',
  'photoHeroPrompt', 'photoHeroPromptNotes',
  'artDirectorPrompt', 'artDirectorPromptNotes',
  // S21
  'branchingPrompt', 'branchingPromptNotes',
  // S22
  'translatePrompt', 'translatePromptNotes',
  'adaptLevelPrompt', 'adaptLevelPromptNotes',
  'phonicsPrompt', 'phonicsPromptNotes',
  // S23
  'quizPrompt', 'quizPromptNotes',
  'vocabPrompt', 'vocabPromptNotes',
  // S24 — injected from client when an active world is set
  'worldContinuity',
];
const overrides = Object.fromEntries(KEYS.map((k) => [k, '']));

export function getPromptOverrides() {
  return overrides;
}

export function setPromptOverrides(patch) {
  for (const k of KEYS) {
    if (typeof patch?.[k] === 'string') overrides[k] = patch[k];
  }
  return overrides;
}

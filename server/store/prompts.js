/**
 * In-memory prompt overrides set from the Prompt Library tab. Single-user app,
 * so a global store is fine. Empty values fall back to the built-in defaults.
 */
const KEYS = ['storySystem', 'storyUser', 'sceneStyle', 'sceneStyleUser', 'coverPrompt', 'coverPromptStyle'];
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

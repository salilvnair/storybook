/**
 * LLM provider registry — configurable providers (like Daakia/sidekick).
 * The client manages a list of OpenAI-compatible (or anthropic) providers and an
 * active one; the chat route uses the active provider as the LLM override.
 * In-memory (single-user app); the client also persists its copy in sql.js.
 */
let providers = []; // { key, name, type, baseUrl, model, apiKey }
let activeKey = '';

export function setProviders(list, active) {
  if (Array.isArray(list)) providers = list;
  if (typeof active === 'string') activeKey = active;
  return { providers, activeKey };
}

export function listProviders() {
  return { providers: providers.map((p) => ({ ...p, apiKey: p.apiKey ? '••••••' : '' })), activeKey };
}

/** The active provider config used as an LLM override (with the real key). */
export function activeProviderOverride() {
  const p = providers.find((x) => x.key === activeKey);
  if (!p || !p.baseUrl) return null;
  return { baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey, type: p.type || 'openai' };
}

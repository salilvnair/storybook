/**
 * Plugin / Extension System — S32.
 *
 * Plugins can extend iStorybook with:
 *   - Custom chat renderers (new StoryReadyCard types)
 *   - New page block types (in the template builder)
 *   - Additional providers (image/tts/music/stt)
 *   - Custom exporters (EPUB, DOCX, CBZ…)
 *
 * Plugin manifest schema:
 * {
 *   id: string,
 *   name: string,
 *   version: string,
 *   description: string,
 *   author: string,
 *   permissions: ('llm'|'image'|'storage'|'network')[],
 *   renderers?: { type: string, handlerUrl: string }[],
 *   providers?: ProviderSchema[],
 *   exporters?: { format: string, label: string, endpoint: string }[],
 *   hooks?: { event: string, handlerUrl: string }[]
 * }
 */

/** @type {Map<string, object>} */
const PLUGINS = new Map();

/** @type {Map<string, object[]>} */
const EXPORTERS = new Map();

/** @type {Map<string, {event:string, pluginId:string, url:string}[]>} */
const HOOKS = new Map();

// Allowed permissions — sandbox guard
const ALLOWED_PERMISSIONS = ['llm', 'image', 'tts', 'music', 'storage', 'network', 'read-stories', 'write-stories'];

export async function installPlugin(manifest) {
  const { id, name, version, permissions = [], providers = [], exporters = [], hooks = [] } = manifest;
  if (!id || !name) throw new Error('Plugin manifest requires id and name');

  // Permission validation
  const invalid = permissions.filter((p) => !ALLOWED_PERMISSIONS.includes(p));
  if (invalid.length) throw new Error(`Unknown permissions: ${invalid.join(', ')}`);

  PLUGINS.set(id, { ...manifest, installedAt: new Date().toISOString() });

  // Register providers
  if (providers.length) {
    const { registerCustomProvider } = await import('../providers/index.js').catch(() => ({ registerCustomProvider: () => {} }));
    for (const providerSchema of providers) {
      try { registerCustomProvider({ ...providerSchema, id: `${id}:${providerSchema.id}` }); } catch { /* skip */ }
    }
  }

  // Register exporters
  for (const exp of exporters) {
    if (!EXPORTERS.has(exp.format)) EXPORTERS.set(exp.format, []);
    EXPORTERS.get(exp.format).push({ ...exp, pluginId: id });
  }

  // Register hooks
  for (const hook of hooks) {
    if (!HOOKS.has(hook.event)) HOOKS.set(hook.event, []);
    HOOKS.get(hook.event).push({ event: hook.event, pluginId: id, url: hook.handlerUrl });
  }

  return { id, name, version };
}

export function uninstallPlugin(id) {
  const plugin = PLUGINS.get(id);
  if (!plugin) return false;
  PLUGINS.delete(id);
  for (const [format, list] of EXPORTERS) {
    EXPORTERS.set(format, list.filter((e) => e.pluginId !== id));
  }
  for (const [event, list] of HOOKS) {
    HOOKS.set(event, list.filter((h) => h.pluginId !== id));
  }
  return true;
}

export function listPlugins() {
  return [...PLUGINS.values()];
}

export function getPlugin(id) {
  return PLUGINS.get(id);
}

export function getExporters(format) {
  if (format) return EXPORTERS.get(format) || [];
  const all = {};
  for (const [fmt, list] of EXPORTERS) { all[fmt] = list; }
  return all;
}

/** Fire plugin hooks for an event. */
export async function firePluginHooks(event, payload) {
  const hooks = HOOKS.get(event) || [];
  for (const hook of hooks) {
    fetch(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload, ts: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}

/** Invoke an exporter plugin. */
export async function invokeExporter(format, storyData, opts = {}) {
  const exporters = EXPORTERS.get(format) || [];
  if (!exporters.length) throw new Error(`No exporter registered for format: ${format}`);
  const exp = exporters[0];
  const r = await fetch(exp.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story: storyData, opts }),
  });
  if (!r.ok) throw new Error(`Exporter ${format} failed: ${r.status}`);
  return r;
}

/**
 * Audit event framework — ditto daakia's ui-audit. Declares every app/UI event
 * type (module · button · action), lets the user enable/disable each one in the
 * Audit Config tab, and gates which events get recorded in the Audit Log.
 *
 * Pure localStorage functions (no zustand) so db/sqldb.ts can call isEnabled()
 * inside audit() without an import cycle.
 */
export interface AuditEventDef {
  id: string;          // === the audit `kind` (e.g. 'template.save')
  module: string;
  button: string;
  action: string;
  description: string;
  color: string;
}

export const MODULE_COLORS: Record<string, string> = {
  Story: '#8b5cf6',
  Templates: '#34d399',
  Palettes: '#f59e0b',
  Theme: '#a855f7',
  Prompts: '#ec4899',
  Providers: '#22d3ee',
  Engine: '#06b6d4',
  Tabs: '#94a3b8',
  Library: '#60a5fa',
  AI: '#a78bfa',
};

const D = (id: string, module: string, button: string, action: string, description: string): AuditEventDef => ({
  id, module, button, action, description, color: MODULE_COLORS[module] || '#94a3b8',
});

export const AUDIT_EVENT_DEFS: AuditEventDef[] = [
  // Story
  D('story.generate', 'Story', 'Generate Storybook', 'generate', 'Storybook generation started'),
  D('story.done', 'Story', 'Generate Storybook', 'done', 'Storybook finished generating'),
  // Templates
  D('template.save', 'Templates', 'Save template', 'save', 'A template was saved'),
  D('template.setDefault', 'Templates', 'Set default', 'set-default', 'A template was made the default'),
  D('template.remove', 'Templates', 'Delete', 'remove', 'A template was deleted'),
  // Palettes
  D('palette.add', 'Palettes', 'New / Duplicate', 'add', 'A palette was created'),
  D('palette.update', 'Palettes', 'Edit colours', 'update', 'A palette was edited'),
  D('palette.remove', 'Palettes', 'Delete', 'remove', 'A palette was deleted'),
  // Theme
  D('theme.update', 'Theme', 'Edit colours', 'update', 'A theme was edited'),
  D('theme.apply', 'Theme', 'Apply theme', 'apply', 'A theme was applied'),
  // Prompts
  D('prompt.update', 'Prompts', 'Save', 'update', 'A prompt was edited'),
  // Providers
  D('provider.add', 'Providers', 'Save Provider', 'add', 'An LLM provider was added'),
  D('provider.update', 'Providers', 'Edit', 'update', 'An LLM provider was updated'),
  D('provider.remove', 'Providers', 'Delete', 'remove', 'An LLM provider was removed'),
  D('provider.setActive', 'Providers', 'Set Active', 'set-active', 'Active LLM provider changed'),
  // Engine
  D('engine.change', 'Engine', 'Engine picker', 'change', 'Image engine / URL / options changed'),
  // Tabs
  D('tab.new', 'Tabs', 'New tab', 'new', 'A new tab was opened'),
  D('tab.close', 'Tabs', 'Close tab', 'close', 'A tab was closed'),
  // Library
  D('library.delete', 'Library', 'Delete', 'delete', 'A saved storybook was deleted'),
];

export const AUDIT_MODULE_ORDER = ['Story', 'Templates', 'Palettes', 'Theme', 'Prompts', 'Providers', 'Engine', 'Tabs', 'Library'];

const CONFIG_KEY = 'storybook.auditConfig.v1';

function loadConfig(): Record<string, boolean> {
  try { const r = localStorage.getItem(CONFIG_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return {};
}
function saveConfig(c: Record<string, boolean>) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch { /* */ }
}

/** Default: everything enabled. */
export function isAuditEventEnabled(id: string): boolean {
  const c = loadConfig();
  return c[id] !== false;
}
export function getAuditConfig(): Record<string, boolean> {
  return loadConfig();
}
export function setAuditEventEnabled(id: string, enabled: boolean) {
  const c = loadConfig(); c[id] = enabled; saveConfig(c);
}
export function resetAuditConfig() {
  saveConfig({});
}

/** Map an audit `kind` (or AI stage) to its module info for badges. */
export function moduleForKind(kind: string): { label: string; color: string } {
  const def = AUDIT_EVENT_DEFS.find((d) => d.id === kind);
  if (def) return { label: def.module, color: def.color };
  const prefix = kind.split('.')[0];
  const map: Record<string, string> = {
    story: 'Story', template: 'Templates', palette: 'Palettes', theme: 'Theme',
    prompt: 'Prompts', provider: 'Providers', engine: 'Engine', tab: 'Tabs', library: 'Library',
  };
  const m = map[prefix] || 'System';
  return { label: m, color: MODULE_COLORS[m] || '#64748b' };
}

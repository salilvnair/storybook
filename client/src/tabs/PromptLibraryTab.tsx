/**
 * PromptLibraryTab — 100% ditto daakia. Categorised + searchable sidebar
 * (PromptLibraryListView) + an editor (PromptLibraryEditorView). EVERY prompt
 * has the same generic structure: System + User tabs, with a Preview / Edit
 * toggle and a click-to-insert variables ribbon shown on BOTH tabs. Values
 * persist in the local sql.js DB (fallback to built-in defaults).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  PromptLibraryListView,
  PromptLibraryEditorView,
  EmptyStateView,
  type PromptLibrarySection,
  type PromptLibraryEditorTab,
  type PromptLibraryVariable,
} from '@salilvnair/dui';
import { SparkleIcon } from '../icons';
import { usePromptsStore, PROMPT_DEFS } from '../store/prompts-store';

const ACCENT = 'var(--story-accent-3)';

export function PromptLibraryTab() {
  const values = usePromptsStore((s) => s.values);
  const loaded = usePromptsStore((s) => s.loaded);
  const loadPrompts = usePromptsStore((s) => s.load);
  const setValue = usePromptsStore((s) => s.set);
  const resetValue = usePromptsStore((s) => s.reset);

  const [activeKey, setActiveKey] = useState<string>(PROMPT_DEFS[0].key);
  const [activePart, setActivePart] = useState<'system' | 'user'>('system');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');

  const def = PROMPT_DEFS.find((d) => d.key === activeKey) ?? null;
  const part = def?.parts.find((p) => p.id === activePart) ?? def?.parts[0] ?? null;

  useEffect(() => { if (!loaded) void loadPrompts(); }, [loaded, loadPrompts]);

  // Server defaults (blank stored value = use server default), keyed by overrideKey.
  const [serverDefaults, setServerDefaults] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/prompts/defaults').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setServerDefaults(d); }).catch(() => {});
  }, []);

  const effective = (overrideKey: string, declaredDefault: string): string => {
    const stored = values[overrideKey] ?? '';
    if (stored) return stored;
    return declaredDefault || serverDefaults[overrideKey] || '';
  };

  // Keep the Preview/Edit choice sticky across System↔User and prompt switches —
  // only the draft text re-syncs to the selected part.
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (def && part) setDraft(effective(part.overrideKey, part.default));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, activePart, loaded, serverDefaults]);

  const dirty = part ? draft !== effective(part.overrideKey, part.default) : false;

  const isCustom = (d: typeof PROMPT_DEFS[number]) =>
    d.parts.some((p) => (values[p.overrideKey] ?? '') !== '' && (values[p.overrideKey] ?? '') !== p.default);

  const sections: PromptLibrarySection[] = useMemo(() => {
    const cats = new Map<string, typeof PROMPT_DEFS>();
    for (const d of PROMPT_DEFS) {
      if (!cats.has(d.category)) cats.set(d.category, []);
      cats.get(d.category)!.push(d);
    }
    return [{
      id: 'prompts', title: 'Prompts',
      categories: [...cats.entries()].map(([cat, defs]) => ({
        id: cat, title: cat,
        items: defs.map((d) => ({
          id: d.key, title: d.label, description: d.description, avatarColor: d.color,
          isCustom: isCustom(d), isModified: d.key === activeKey && dirty,
        })),
      })),
    }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, activeKey, draft]);

  // System & User tabs (every prompt has them).
  const tabs: PromptLibraryEditorTab[] = (def?.parts ?? []).map((p) => ({ id: p.id, label: `${p.icon} ${p.label}` }));
  // Variables apply to BOTH tabs.
  const variables: PromptLibraryVariable[] = (def?.variables ?? []).map((v) => ({ pill: v, insert: v, title: `Insert ${v}` }));

  const save = () => { if (part) void setValue(part.overrideKey, draft); };
  const doReset = () => {
    if (!part) return;
    void resetValue(part.overrideKey);
    setDraft(part.default || serverDefaults[part.overrideKey] || '');
  };

  const selectPrompt = (id: string) => { setActiveKey(id); setActivePart('system'); };

  return (
    <div className="pl-fill">
      <div className="pl-root">
        <div className="pl-sidebar-host">
          <PromptLibraryListView
            sections={sections}
            activeId={activeKey}
            onSelect={selectPrompt}
            search={search}
            onSearchChange={setSearch}
            accentColor={ACCENT}
          />
        </div>

        <div className="pl-editor-host">
          {def && part ? (
            <PromptLibraryEditorView
              title={def.label}
              description={def.description}
              avatarColor={def.color}
              isCustom={isCustom(def)}
              isDirty={dirty}
              variables={variables}
              tabs={tabs}
              activeTabId={part.id}
              onTabChange={(id) => setActivePart(id as 'system' | 'user')}
              content={draft}
              onContentChange={setDraft}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSave={save}
              onVariableInsert={(ins) => setDraft((d) => d + ins)}
              accentColor={ACCENT}
            />
          ) : (
            <EmptyStateView icon={<SparkleIcon size={28} />} title="Select a prompt" message="Choose a prompt on the left to view and edit it." />
          )}
          {def && part && (
            <div className="pl-editor-footbar">
              <button className="pl-reset-link" onClick={doReset} title="Reset this part to default">↺ Reset to default</button>
              {def.key === 'storySystem' && part.id === 'system' && <span className="pl-foot-hint">Blank = use the server's built-in author prompt.</span>}
              {def.key === 'storySystem' && part.id === 'user' && <span className="pl-foot-hint">Wraps each parent message — {'{{message}}'} is the typed text.</span>}
              {def.key === 'sceneStyle' && part.id === 'user' && <span className="pl-foot-hint">Optional extra art direction, appended to the System style.</span>}
              {def.key === 'coverPrompt' && part.id === 'system' && <span className="pl-foot-hint">Optional style guidance prepended to the cover prompt.</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

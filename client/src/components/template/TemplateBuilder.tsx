/**
 * TemplateBuilder — the manual visual builder (no chat). Edit the layout with
 * controls (bound live to the template-store → the preview updates instantly),
 * name it, and Save to the local sql.js DB. Saved templates can be loaded, set
 * as the default (used by My Story), or deleted.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView, ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import { useTemplateStore, DEFAULT_SPEC, type TemplateSpec } from '../../store/template-store';
import { useTemplatesStore } from '../../store/templates-store';
import { downloadMjs } from './templateMjs';
import { RegionEditor } from './RegionEditor';
import { PaletteCards } from './PaletteCards';
import { StarIcon, TrashIcon, BookIcon, SaveIcon, BookIcon as LoadIcon, DownloadIcon } from '../../icons';

export function TemplateBuilder() {
  const spec = useTemplateStore((s) => s.spec);
  const setSpec = useTemplateStore((s) => s.setSpec);
  const { saved, loaded, load, save, setDefault, remove } = useTemplatesStore();
  const [name, setName] = useState('');
  const [tplMenu, setTplMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const seg = <T extends string | boolean>(label: string, value: T, current: T, set: (v: T) => void) => (
    <button key={String(value)} type="button" className={`tcx-seg${current === value ? ' is-active' : ''}`} onClick={() => set(value)}>
      {label}
    </button>
  );
  const swatch = (key: keyof TemplateSpec) => (
    <label className="tcx-swatch">
      <input type="color" value={String(spec[key])} onChange={(e) => setSpec({ [key]: e.target.value } as Partial<TemplateSpec>)} />
      <span className="tcx-swatch-dot" style={{ background: String(spec[key]) }} />
    </label>
  );

  const doSave = () => {
    const n = name.trim() || `Template ${saved.length + 1}`;
    void save(n, spec);
    setName('');
  };

  return (
    <div className="tb-pane">
      <div className="tb-head">
        <BookIcon size={16} style={{ color: 'var(--story-accent-3)' }} />
        <span className="tb-head-title">Design your template</span>
      </div>

      <div className="tb-body">
        <div className="tcx-card" style={{ background: 'transparent', padding: 0, boxShadow: 'none' }}>
          <div className="tcx-row">
            <span className="tcx-label">Page</span>
            <div className="tcx-segs">
              {seg('Spread', 'spread', spec.pageKind, (v) => setSpec({ pageKind: v }))}
              {seg('Single', 'single', spec.pageKind, (v) => setSpec({ pageKind: v }))}
            </div>
          </div>
          {spec.pageKind === 'spread' && (
            <>
              <div className="tcx-row">
                <span className="tcx-label">Shape</span>
                <div className="tcx-segs">
                  {seg('2:1', '2:1', spec.aspect, (v) => setSpec({ aspect: v }))}
                  {seg('3:2', '3:2', spec.aspect, (v) => setSpec({ aspect: v }))}
                  {seg('Square', '1:1', spec.aspect, (v) => setSpec({ aspect: v }))}
                </div>
              </div>
              <div className="tcx-row">
                <span className="tcx-label">Text on</span>
                <div className="tcx-segs">
                  {seg('◧ Left', 'left', spec.textSide, (v) => setSpec({ textSide: v }))}
                  {seg('Right ◨', 'right', spec.textSide, (v) => setSpec({ textSide: v }))}
                </div>
              </div>
              <div className="tcx-row">
                <span className="tcx-label">Glow</span>
                <div className="tcx-segs">
                  {seg('On', true, spec.glow, (v) => setSpec({ glow: v }))}
                  {seg('Off', false, spec.glow, (v) => setSpec({ glow: v }))}
                </div>
              </div>
            </>
          )}
          <div className="tcx-row tcx-row-top">
            <span className="tcx-label">Palette</span>
            <PaletteCards />
          </div>
          <div className="tcx-row">
            <span className="tcx-label">Colours</span>
            <div className="tcx-swatches">
              <span className="tcx-swatch-wrap">Card {swatch('cardColor')}</span>
              <span className="tcx-swatch-wrap">Frame {swatch('frameColor')}</span>
              <span className="tcx-swatch-wrap">Accent {swatch('emphasisColor')}</span>
            </div>
          </div>
        </div>

        {/* Drag/resize the text card (S8.04) — spread only */}
        {spec.pageKind === 'spread' && (
          <div className="tb-region">
            <div className="tb-region-head">📐 Text-card position</div>
            <RegionEditor />
          </div>
        )}

        {/* Save */}
        <div className="tb-save-row">
          <TextInputView value={name} placeholder="Template name…" width="fw" size="md"
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSave(); }} />
          <ButtonView size="md" accentColor="var(--story-accent-3)" iconLeft={<SaveIcon size={14} />} onClick={doSave}>Save template</ButtonView>
        </div>
        <div className="tb-secondary-row">
          <button className="tb-reset" onClick={() => setSpec(DEFAULT_SPEC)}>↺ Reset to classic spread</button>
          <button className="tb-reset" onClick={() => downloadMjs(spec, name || 'template')} title="Download a runnable render script for this template">⬇ Export .mjs</button>
        </div>

        {/* Saved templates */}
        <div className="tb-saved">
          <div className="tb-saved-head">Saved templates {saved.length > 0 && <span>({saved.length})</span>}</div>
          {saved.length === 0 && <div className="tb-saved-empty">No saved templates yet — design one above and hit Save.</div>}
          {saved.map((t) => (
            <div
              key={t.id}
              className={`tb-saved-item${t.isDefault ? ' is-default' : ''}`}
              onContextMenu={(e) => { e.preventDefault(); setTplMenu({ id: t.id, x: e.clientX, y: e.clientY }); }}
            >
              <button className="tb-saved-load" onClick={() => setSpec(t.spec)} title="Load into the editor">
                <span className="tb-saved-swatch" style={{ background: t.spec.palette?.[0] }} />
                <span className="tb-saved-name">{t.name}</span>
                {t.isDefault && <span className="tb-default-badge">DEFAULT</span>}
              </button>
              <button className="tb-icon" title="Set as default (used by My Story)" onClick={() => void setDefault(t.id)}>
                <StarIcon size={13} style={{ color: t.isDefault ? 'var(--story-accent)' : 'var(--color-text-muted)' }} />
              </button>
              <button className="tb-icon" title="Delete" onClick={() => void remove(t.id)}>
                <TrashIcon size={13} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <ContextMenuView
        open={!!tplMenu}
        anchorEl={null}
        position={tplMenu ? { x: tplMenu.x, y: tplMenu.y } : undefined}
        onClose={() => setTplMenu(null)}
        rounded
        items={((): ContextMenuItem[] => {
          const t = saved.find((x) => x.id === tplMenu?.id);
          if (!t) return [];
          return [
            { id: 'load', label: 'Load into editor', icon: <LoadIcon size={13} style={{ color: 'var(--story-accent-3)' }} />, onClick: () => { setSpec(t.spec); setTplMenu(null); } },
            { id: 'default', label: t.isDefault ? 'Default (used by My Story)' : 'Set as default', disabled: t.isDefault, icon: <StarIcon size={13} style={{ color: 'var(--story-accent)' }} />, onClick: () => { void setDefault(t.id); setTplMenu(null); } },
            { id: 'export', label: 'Export .mjs', icon: <DownloadIcon size={13} style={{ color: 'var(--story-accent-2)' }} />, onClick: () => { downloadMjs(t.spec, t.name); setTplMenu(null); } },
            { id: 'sep', label: '', separator: true },
            { id: 'delete', label: 'Delete', danger: true, icon: <TrashIcon size={13} style={{ color: 'var(--color-error, #f87171)' }} />, onClick: () => { void remove(t.id); setTplMenu(null); } },
          ];
        })()}
      />
    </div>
  );
}

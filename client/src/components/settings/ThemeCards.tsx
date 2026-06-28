/**
 * ThemeCards — customizable accent-theme cards (ditto the palette editor).
 *   • click a card to apply the theme app-wide
 *   • right-click → DUI ContextMenuView (Edit colours, Duplicate, Delete)
 *   • "Edit colours" / "+ New" open a DUI ModalView popup with 3 colour pickers
 * Persisted to the local sql.js DB; falls back to the built-in ACCENTS.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView, ModalView, ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import { useThemesStore, type Theme } from '../../store/themes-store';
import { PaletteIcon, CopyIcon, TrashIcon, PlusIcon } from '../../icons';

interface MenuState { id: string; x: number; y: number }
interface EditState { id: string | null; name: string; accent: string; accent2: string; accent3: string }

const BLANK: Omit<EditState, 'id'> = { name: 'New theme', accent: '#f59e0b', accent2: '#ec4899', accent3: '#8b5cf6' };

export function ThemeCards() {
  const { themes, activeId, loaded, load, setActive, add, update, remove } = useThemesStore();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const openEdit = (t?: Theme) =>
    setEdit(t ? { id: t.id, name: t.name, accent: t.accent, accent2: t.accent2, accent3: t.accent3 } : { id: null, ...BLANK });

  const saveEdit = async () => {
    if (!edit) return;
    const body = { name: edit.name.trim() || 'Theme', accent: edit.accent, accent2: edit.accent2, accent3: edit.accent3 };
    if (edit.id) await update(edit.id, body); else await add(body);
    setEdit(null);
  };

  const swatch = (key: 'accent' | 'accent2' | 'accent3', label: string) => edit && (
    <div className="thm-edit-swatch">
      <label className="pal-swatch" style={{ background: edit[key] }}>
        <input type="color" value={edit[key]} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} />
      </label>
      <div className="thm-edit-meta"><span className="thm-edit-role">{label}</span><span className="pal-edit-hex">{edit[key]}</span></div>
    </div>
  );

  return (
    <div className="thm-wrap">
      <div className="thm-cards">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`thm-card${activeId === t.id ? ' is-active' : ''}`}
            onClick={() => setActive(t.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ id: t.id, x: e.clientX, y: e.clientY }); }}
            title={`${t.name} — click to apply, right-click to edit`}
          >
            <span className="thm-card-preview">
              <span className="thm-bar" style={{ background: t.accent }} />
              <span className="thm-bar thm-bar-sm" style={{ background: t.accent2 }} />
              <span className="thm-bar thm-bar-xs" style={{ background: t.accent3 }} />
            </span>
            <span className="thm-card-foot">
              <span className="thm-card-name">{t.name}</span>
              {activeId === t.id && <span className="thm-card-check" style={{ background: t.accent3 }}>✓</span>}
            </span>
          </button>
        ))}
        <button type="button" className="thm-card thm-card-add" onClick={() => openEdit()} title="Create a new theme">
          <PlusIcon size={18} /><span className="thm-card-name">New</span>
        </button>
      </div>

      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        onClose={() => setMenu(null)}
        rounded
        items={((): ContextMenuItem[] => {
          const t = themes.find((x) => x.id === menu?.id);
          if (!t) return [];
          return [
            { id: 'edit', label: 'Edit colours', icon: <PaletteIcon size={13} style={{ color: t.accent3 }} />, onClick: () => { openEdit(t); setMenu(null); } },
            { id: 'dup', label: 'Duplicate', icon: <CopyIcon size={13} style={{ color: t.accent2 }} />, onClick: () => { void add({ name: `${t.name} copy`, accent: t.accent, accent2: t.accent2, accent3: t.accent3 }); setMenu(null); } },
            { id: 'sep', label: '', separator: true },
            { id: 'del', label: 'Delete', danger: true, disabled: themes.length <= 1, icon: <TrashIcon size={13} style={{ color: 'var(--color-error, #f87171)' }} />, onClick: () => { void remove(t.id); setMenu(null); } },
          ];
        })()}
      />

      <ModalView
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit theme' : 'New theme'}
        subtitle="Pick your three accent colours, then save."
        size="sm"
        headerColor="var(--story-accent-3)"
        headerGradient
        footerRight={
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView size="md" variant="secondary" onClick={() => setEdit(null)}>Cancel</ButtonView>
            <ButtonView size="md" accentColor="var(--story-accent-3)" onClick={saveEdit}>Save theme</ButtonView>
          </div>
        }
      >
        {edit && (
          <div className="pal-edit">
            <TextInputView value={edit.name} width="fw" size="md" placeholder="Theme name…"
              onChange={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} />
            <div className="thm-edit-grid">
              {swatch('accent', 'Primary')}
              {swatch('accent2', 'Secondary')}
              {swatch('accent3', 'Tertiary')}
            </div>
            <div className="thm-edit-live" style={{ ['--p' as string]: edit.accent, ['--s' as string]: edit.accent2, ['--t' as string]: edit.accent3 }}>
              <span style={{ background: edit.accent }} /><span style={{ background: edit.accent2 }} /><span style={{ background: edit.accent3 }} />
              <em>Live preview</em>
            </div>
          </div>
        )}
      </ModalView>
    </div>
  );
}

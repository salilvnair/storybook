/**
 * PaletteCards — editable colour-palette cards for the Template builder.
 *   • up to 4 pinned palettes show as big cards (click to apply to the spec)
 *   • right-click a card → DUI ContextMenuView (Edit colours, Pin/Unpin,
 *     Duplicate, Delete) with colourful icons
 *   • "Edit colours" / "+ New" open a DUI ModalView popup with per-colour
 *     pickers; everything persists to the local sql.js DB.
 */
import { useEffect, useState } from 'react';
import { ButtonView, IconButtonView, TextInputView, ModalView, ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import { usePalettesStore, MAX_PINNED, type Palette } from '../../store/palettes-store';
import { useTemplateStore } from '../../store/template-store';
import { PaletteIcon, StarIcon, CopyIcon, TrashIcon, PlusIcon, CloseIcon } from '../../icons';

interface MenuState { id: string; x: number; y: number }
interface EditState { id: string | null; name: string; colors: string[] }

const FALLBACK_COLORS = ['#FCD653', '#F7CCD7', '#CFE0BF', '#E1D2EC', '#C9E2F0', '#FAC7B7'];

export function PaletteCards() {
  const { palettes, loaded, load, add, update, remove, togglePin, pinned } = usePalettesStore();
  const setSpec = useTemplateStore((s) => s.setSpec);
  const activePalette = useTemplateStore((s) => s.spec.palette);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const cards = pinned();
  const pinnedCount = palettes.filter((p) => p.pinned).length;

  const apply = (p: Palette) => setSpec({ palette: p.colors });
  const isActive = (p: Palette) => JSON.stringify(p.colors) === JSON.stringify(activePalette);

  const openEdit = (p?: Palette) =>
    setEdit(p ? { id: p.id, name: p.name, colors: [...p.colors] } : { id: null, name: 'New palette', colors: [...FALLBACK_COLORS] });

  const saveEdit = async () => {
    if (!edit) return;
    const colors = edit.colors.filter(Boolean);
    if (edit.id) await update(edit.id, { name: edit.name.trim() || 'Palette', colors });
    else await add(edit.name.trim() || 'Palette', colors, pinnedCount < MAX_PINNED);
    setEdit(null);
  };

  return (
    <div className="pal-wrap">
      <div className="pal-cards">
        {cards.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pal-card${isActive(p) ? ' is-active' : ''}`}
            onClick={() => apply(p)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
            title={`${p.name} — click to apply, right-click for options`}
          >
            <span className="pal-card-strip">
              {p.colors.slice(0, 6).map((c, i) => <span key={i} style={{ background: c }} />)}
            </span>
            <span className="pal-card-name">{p.name}</span>
          </button>
        ))}

        <button type="button" className="pal-card pal-card-add" onClick={() => openEdit()} title="Create a new palette">
          <PlusIcon size={16} />
          <span className="pal-card-name">New</span>
        </button>
      </div>

      {/* Right-click context menu */}
      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        onClose={() => setMenu(null)}
        rounded
        items={((): ContextMenuItem[] => {
          const p = palettes.find((x) => x.id === menu?.id);
          if (!p) return [];
          return [
            { id: 'edit', label: 'Edit colours', icon: <PaletteIcon size={13} style={{ color: 'var(--story-accent-3)' }} />, onClick: () => { openEdit(p); setMenu(null); } },
            { id: 'pin', label: p.pinned ? 'Unpin from builder' : 'Pin to builder', icon: <StarIcon size={13} style={{ color: 'var(--story-accent)' }} />, onClick: () => { void togglePin(p.id); setMenu(null); } },
            { id: 'dup', label: 'Duplicate', icon: <CopyIcon size={13} style={{ color: 'var(--story-accent-2)' }} />, onClick: () => { void add(`${p.name} copy`, p.colors, false); setMenu(null); } },
            { id: 'sep', label: '', separator: true },
            { id: 'del', label: 'Delete', danger: true, icon: <TrashIcon size={13} style={{ color: 'var(--color-error, #f87171)' }} />, onClick: () => { void remove(p.id); setMenu(null); } },
          ];
        })()}
      />

      {/* Edit-colours popup */}
      <ModalView
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit palette' : 'New palette'}
        subtitle="Tune each colour, then save to your library."
        size="sm"
        headerColor="var(--story-accent-3)"
        headerGradient
        footerRight={
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView size="md" variant="secondary" onClick={() => setEdit(null)}>Cancel</ButtonView>
            <ButtonView size="md" accentColor="var(--story-accent-3)" onClick={saveEdit}>Save palette</ButtonView>
          </div>
        }
      >
        {edit && (
          <div className="pal-edit">
            <TextInputView
              value={edit.name}
              width="fw"
              size="md"
              placeholder="Palette name…"
              onChange={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })}
            />
            <div className="pal-edit-grid">
              {edit.colors.map((c, i) => (
                <div key={i} className="pal-edit-swatch">
                  <label className="pal-swatch" style={{ background: c }}>
                    <input type="color" value={c} onChange={(e) => {
                      const colors = [...edit.colors]; colors[i] = e.target.value; setEdit({ ...edit, colors });
                    }} />
                  </label>
                  <span className="pal-edit-hex">{c}</span>
                  {edit.colors.length > 1 && (
                    <IconButtonView size="sm" tooltip="Remove colour" icon={<CloseIcon size={11} />}
                      onClick={() => setEdit({ ...edit, colors: edit.colors.filter((_, j) => j !== i) })} />
                  )}
                </div>
              ))}
            </div>
            {edit.colors.length < 8 && (
              <ButtonView size="sm" variant="secondary" iconLeft={<PlusIcon size={12} />}
                onClick={() => setEdit({ ...edit, colors: [...edit.colors, '#E1D2EC'] })}>Add colour</ButtonView>
            )}
          </div>
        )}
      </ModalView>
    </div>
  );
}

/**
 * WorldsManager — S24 Story Universe / Series.
 * Create/edit/delete "worlds"; assign stories to a world with an episode number and summary.
 */
import { useEffect, useState } from 'react';
import { ButtonView, IconButtonView, TextInputView, ChipView } from '@salilvnair/dui';
import { useWorldsStore, type World } from '../../store/worlds-store';
import { TrashIcon } from '../../icons';
import { SettingsPanelHeader } from './SettingsPanelHeader';

const WORLD_PALETTE = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#6366f1'];
const WORLD_ICONS   = ['🪐', '🌍', '🌕', '⭐', '🌌', '🌠', '🔮'];

const accent = (idx: number) => WORLD_PALETTE[idx % WORLD_PALETTE.length];
const icon   = (idx: number) => WORLD_ICONS[idx % WORLD_ICONS.length];

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}

export function WorldsManager() {
  const { worlds, worldStories, loaded, load, create, update, remove, setActive, activeWorldId } = useWorldsStore();

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const world = await create(newName.trim(), newDesc.trim());
    setNewName(''); setNewDesc('');
    setActive(world.id);
    setCreating(false);
  };

  const startEdit = (w: World) => { setEditing(w.id); setEditName(w.name); setEditDesc(w.description); };
  const saveEdit  = async () => {
    if (!editing) return;
    await update(editing, { name: editName.trim(), description: editDesc.trim() });
    setEditing(null);
  };

  const storyCount = (id: string) => worldStories.filter((ws) => ws.world_id === id).length;

  return (
    <div className="story-tab-scroll">
      <div className="wm-root">

        <SettingsPanelHeader icon="🌌" title="Story Universe" subtitle="Group stories into a series with shared characters and continuity." action={<ChipView size="sm" color="#7c3aed" label={`${worlds.length} world${worlds.length !== 1 ? 's' : ''}`} />} />

        {/* ── Active banner ───────────────────────────────────────── */}
        {activeWorldId && (() => {
          const w = worlds.find((w) => w.id === activeWorldId);
          const idx = worlds.findIndex((w) => w.id === activeWorldId);
          const c = accent(idx);
          return w ? (
            <div className="wm-active-banner" style={{ borderColor: c + '55', background: c + '0e' }}>
              <span className="wm-active-planet" style={{ color: c }}>{icon(idx)}</span>
              <span>Active universe: <strong style={{ color: c }}>{w.name}</strong></span>
              <ButtonView size="xs" accentColor="rgba(255,255,255,0.2)" onClick={() => setActive(null)}>
                Clear
              </ButtonView>
            </div>
          ) : null;
        })()}

        {/* ── World list ──────────────────────────────────────────── */}
        {worlds.length === 0 ? (
          <div className="wm-empty-state">
            <div className="wm-empty-icon">🌌</div>
            <div className="wm-empty-title">No worlds yet</div>
            <div className="wm-empty-sub">Create your first universe below and start building a series</div>
          </div>
        ) : (
          <div className="wm-list">
            {worlds.map((w, idx) => {
              const isActive = activeWorldId === w.id;
              const c = accent(idx);
              const planet = icon(idx);
              const sc = storyCount(w.id);

              return (
                <div key={w.id} className={`wm-card${isActive ? ' wm-card-active' : ''}`}
                  style={{ '--wm-c': c } as React.CSSProperties}>

                  {/* Accent stripe */}
                  <div className="wm-stripe" style={{ background: `linear-gradient(180deg, ${c}, ${c}55)` }} />

                  <div className="wm-card-body">
                    {editing === w.id ? (
                      /* ── Edit form ── */
                      <div className="wm-edit-form">
                        <TextInputView size="md" width="fw" value={editName} placeholder="Universe name"
                          onChange={(v) => setEditName(v)} />
                        <TextInputView size="md" width="fw" value={editDesc} placeholder="Short description (optional)"
                          onChange={(v) => setEditDesc(v)} />
                        <div className="wm-edit-btns">
                          <ButtonView size="sm" accentColor={c} onClick={saveEdit}>Save</ButtonView>
                          <ButtonView size="sm" accentColor="rgba(255,255,255,0.2)" onClick={() => setEditing(null)}>Cancel</ButtonView>
                        </div>
                      </div>
                    ) : (
                      /* ── Card display ── */
                      <>
                        <div className="wm-card-top">
                          <span className="wm-planet" style={{ color: c, textShadow: `0 0 18px ${c}88` }}>{planet}</span>
                          <div className="wm-card-info">
                            <div className="wm-card-nameline">
                              <span className="wm-card-name">{w.name}</span>
                              {isActive && <ChipView size="xs" color={c} label="ACTIVE UNIVERSE" />}
                            </div>
                            {w.description && <div className="wm-card-desc">{w.description}</div>}
                          </div>
                          <div className="wm-card-actions">
                            <div>
                              <IconButtonView size="sm"
                                icon={<span style={{ fontSize: 14, color: isActive ? c : 'var(--color-text-muted)' }}>{isActive ? '★' : '☆'}</span>}
                                onClick={() => setActive(isActive ? null : w.id)}
                                tooltip={isActive ? 'Deactivate universe' : 'Set as active universe'} />
                            </div>
                            <div>
                              <IconButtonView size="sm"
                                icon={<span style={{ fontSize: 13 }}>✏️</span>}
                                onClick={() => startEdit(w)}
                                tooltip="Edit world" />
                            </div>
                            <div>
                              <IconButtonView size="sm"
                                icon={<TrashIcon size={13} />}
                                onClick={() => void remove(w.id)}
                                tooltip="Delete world" />
                            </div>
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="wm-stats">
                          <span className="wm-stat-chip" style={{ background: c + '18', color: c, borderColor: c + '40' }}>
                            📖 {sc} {sc === 1 ? 'story' : 'stories'}
                          </span>
                          <span className="wm-stat-chip" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', borderColor: 'rgba(255,255,255,0.08)' }}>
                            🗓 {fmtDate(w.created_at)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Create new world ─────────────────────────────────────── */}
        <div className="wm-create-card">
          <div className="wm-create-title">
            <span style={{ fontSize: 16 }}>✦</span> New Universe
          </div>
          <div className="wm-create-fields">
            <TextInputView size="md" width="fw" value={newName}
              placeholder="Universe name — e.g. «Fern Forest Chronicles»"
              onChange={(v) => setNewName(v)} />
            <TextInputView size="md" width="fw" value={newDesc}
              placeholder="Short description (optional)"
              onChange={(v) => setNewDesc(v)} />
          </div>
          <div className="wm-create-footer">
            <ButtonView size="md" accentColor="#7c3aed"
              disabled={!newName.trim() || creating}
              onClick={() => void handleCreate()}>
              {creating ? 'Creating…' : 'Create Universe'}
            </ButtonView>
          </div>
        </div>

        <div className="wm-hint">
          💡 To link a finished story to a universe, open it in the book viewer and use the Universe panel in the toolbar.
        </div>
      </div>
    </div>
  );
}

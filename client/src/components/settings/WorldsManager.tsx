/**
 * WorldsManager — S24 Story Universe / Series.
 * Create/edit/delete "worlds"; assign stories to a world with an episode number and summary.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView, ChipView } from '@salilvnair/dui';
import { useWorldsStore, type World } from '../../store/worlds-store';
import { PlusIcon, TrashIcon } from '../../icons';

export function WorldsManager() {
  const { worlds, loaded, load, create, update, remove, setActive, activeWorldId } = useWorldsStore();

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

  const startEdit = (w: World) => {
    setEditing(w.id); setEditName(w.name); setEditDesc(w.description);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await update(editing, { name: editName.trim(), description: editDesc.trim() });
    setEditing(null);
  };

  return (
    <div className="story-tab-scroll">
    <div className="bs-settings-pane ie-pane" style={{ padding: '0 4px' }}>
      <div className="bs-settings-section-head">
        <span style={{ fontSize: 15 }}>🪐</span>
        <h3 className="bs-settings-h3">Story Universe</h3>
        <ChipView size="sm" color="#7c3aed" label={`${worlds.length} world${worlds.length !== 1 ? 's' : ''}`} />
      </div>

      <p className="wm-desc">
        Group stories into a series. The active world injects continuity context (characters, prior events) into each new story you generate.
      </p>

      {/* Active world indicator */}
      {activeWorldId && (
        <div className="wm-active-banner">
          🌐 Active universe: <strong>{worlds.find((w) => w.id === activeWorldId)?.name ?? '—'}</strong>
          <button className="wm-clear-btn" onClick={() => setActive(null)}>Clear</button>
        </div>
      )}

      {/* World list */}
      <div className="wm-list">
        {worlds.length === 0 && <div className="wm-empty">No worlds yet. Create one below.</div>}
        {worlds.map((w) => (
          <div key={w.id} className={`wm-card${activeWorldId === w.id ? ' wm-card-active' : ''}`}>
            {editing === w.id ? (
              <div className="wm-edit-form">
                <TextInputView value={editName} onChange={(e) => setEditName((e.target as HTMLInputElement).value)} size="sm" width="fw" placeholder="World name" />
                <TextInputView value={editDesc} onChange={(e) => setEditDesc((e.target as HTMLInputElement).value)} size="sm" width="fw" placeholder="Description (optional)" />
                <div className="wm-edit-btns">
                  <ButtonView size="sm" label="Save" onClick={saveEdit} />
                  <ButtonView size="sm" label="Cancel" variant="ghost" onClick={() => setEditing(null)} />
                </div>
              </div>
            ) : (
              <>
                <div className="wm-card-head">
                  <span className="wm-card-name">{w.name}</span>
                  <div className="wm-card-actions">
                    <button className="wm-icon-btn" onClick={() => setActive(activeWorldId === w.id ? null : w.id)} title="Set as active universe">
                      {activeWorldId === w.id ? '★' : '☆'}
                    </button>
                    <button className="wm-icon-btn" onClick={() => startEdit(w)} title="Edit">✏</button>
                    <button className="wm-icon-btn wm-icon-del" onClick={() => void remove(w.id)} title="Delete world"><TrashIcon size={12} /></button>
                  </div>
                </div>
                {w.description && <p className="wm-card-desc">{w.description}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Create new world */}
      <div className="wm-create">
        <div className="wm-create-head">
          <PlusIcon size={13} /> New world
        </div>
        <TextInputView
          value={newName} size="sm" width="fw" placeholder="World name (e.g. «Fern Forest Chronicles»)"
          onChange={(e) => setNewName((e.target as HTMLInputElement).value)}
        />
        <TextInputView
          value={newDesc} size="sm" width="fw" placeholder="Short description (optional)"
          onChange={(e) => setNewDesc((e.target as HTMLInputElement).value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ButtonView
            size="sm" label={creating ? 'Creating…' : 'Create world'}
            disabled={!newName.trim() || creating}
            onClick={() => void handleCreate()}
          />
        </div>
      </div>

      <div className="wm-hint">
        💡 To link a finished story to a world, open it in the book viewer and use the Universe panel in the toolbar.
      </div>
    </div>
    </div>
  );
}

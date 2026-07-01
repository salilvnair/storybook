/**
 * CharacterStudio — Settings panel for creating and managing reusable characters.
 * Each character's look description is injected into every scene prompt at
 * generation time, giving visual consistency across all pages.
 */
import { useState, useEffect, useRef } from 'react';
import {
  ButtonView, ChipView, TextInputView, SelectInputView, MultilineInputView,
  type SelectOption,
} from '@salilvnair/dui';
import { useCharactersStore, type Character, type CharacterRole } from '../../store/characters-store';
import { useCharacterDraftStore } from '../../store/character-draft-store';
import { useVoicesStore } from '../../store/voices-store';
import { useAudioEngineStore } from '../../store/audio-engine-store';
import { UserIcon, UsersIcon, PlusIcon, TrashIcon, LockIcon, SaveIcon, CameraIcon, MicIcon } from '../../icons';
import { PhotoHeroModal } from './PhotoHeroModal';
import { SettingsPanelHeader } from './SettingsPanelHeader';

const ROLE_META: Record<CharacterRole, { label: string; color: string }> = {
  hero:     { label: 'Hero',     color: '#34d399' },
  sidekick: { label: 'Sidekick', color: '#60a5fa' },
  villain:  { label: 'Villain',  color: '#f87171' },
  mentor:   { label: 'Mentor',   color: '#f59e0b' },
  minor:    { label: 'Minor',    color: '#94a3b8' },
};

const ROLE_OPTIONS: SelectOption[] = (Object.keys(ROLE_META) as CharacterRole[]).map((r) => ({
  value: r,
  label: ROLE_META[r].label,
  color: ROLE_META[r].color,
}));

const AGE_OPTIONS = ['toddler (1–3)', 'young child (4–6)', 'older child (7–10)', 'teen (11–15)', 'adult', 'elder'];
const AGE_SELECT_OPTIONS: SelectOption[] = AGE_OPTIONS.map((a) => ({ value: a, label: a }));

const SPECIES_PRESETS = ['human', 'rabbit', 'fox', 'bear', 'cat', 'dog', 'elephant', 'lion', 'dragon', 'robot'];
const SPECIES_OPTIONS: SelectOption[] = [
  ...SPECIES_PRESETS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  { value: '__other__', label: 'Other…' },
];

function avatarColor(name: string): string {
  const colors = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.trim() ? name.trim()[0].toUpperCase() : '?';
  const bg = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

interface TraitEditorProps {
  traits: string[];
  onChange: (t: string[]) => void;
}

function TraitEditor({ traits, onChange }: TraitEditorProps) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim().toLowerCase();
    if (!v || traits.includes(v)) { setInput(''); return; }
    onChange([...traits, v]);
    setInput('');
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {traits.map((t) => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, padding: '2px 8px', fontSize: 12, color: 'var(--color-text-primary)',
          }}>
            {t}
            <ButtonView size="xs" accentColor="#f87171"
              onClick={() => onChange(traits.filter((x) => x !== t))}
              style={{ padding: '0 2px', minWidth: 0, lineHeight: 1 }}>
              ✕
            </ButtonView>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <TextInputView
          size="sm"
          value={input}
          placeholder="brave, curious, kind…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ flex: 1, fontSize: 12 }}
        />
        <ButtonView size="sm" accentColor="var(--color-primary)" onClick={add}>+ Add</ButtonView>
      </div>
    </div>
  );
}

const EMPTY_VOICES: string[] = [];

function CharacterForm() {
  const { characters, editingId, add, update, remove, setEditing } = useCharactersStore();
  const { voices, loaded: voicesLoaded, load: loadVoices } = useVoicesStore();
  // Derive directly from snapshot (not s.current() which calls get() internally)
  const engineVoices = useAudioEngineStore((s) => s.engines.find((e) => e.id === s.config.engine)?.voices ?? EMPTY_VOICES);
  const char = characters.find((c) => c.id === editingId) ?? null;
  // Draft lives in a shared store so the "describe to AI" chat can populate it too.
  const draft = useCharacterDraftStore((s) => s.draft);
  const dirty = useCharacterDraftStore((s) => s.dirty);
  const set = useCharacterDraftStore((s) => s.setField);
  const loadFrom = useCharacterDraftStore((s) => s.loadFrom);
  const clearDirty = useCharacterDraftStore((s) => s.clearDirty);
  const [photoModal, setPhotoModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!voicesLoaded) void loadVoices(); }, [voicesLoaded, loadVoices]);

  useEffect(() => {
    loadFrom(char);
  }, [editingId, char?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    if (char) {
      await update(char.id, draft);
    } else {
      await add(draft);
    }
    clearDirty();
  };

  const handleNew = () => {
    setEditing(null);
    loadFrom(null);
  };

  const handleDelete = async () => {
    if (!char) return;
    if (!confirm(`Delete character "${char.name}"? This cannot be undone.`)) return;
    await remove(char.id);
  };

  const handleRefImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      set('referenceImage', ev.target?.result as string ?? null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="gen-card" style={{ flex: 1, minWidth: 0 }}>
      <div className="gen-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <UserIcon size={15} />
        {char ? `Editing: ${char.name}` : 'New character'}
        {!char && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Fill in the form and save
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Name */}
        <div className="gen-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="gen-k">Name *</span>
          <TextInputView
            size="md"
            value={draft.name}
            placeholder="Luna the Rabbit"
            onChange={(e) => set('name', e.target.value)}
            width="fw"
          />
        </div>

        {/* Role + Species + Age — row */}
        {(() => {
          const isCustomSpecies = !SPECIES_PRESETS.includes(draft.species);
          const speciesDropVal = isCustomSpecies ? '__other__' : (draft.species || '');
          return (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="gen-k">Role</span>
                  <SelectInputView
                    size="md"
                    value={draft.role}
                    onChange={(v) => set('role', v as CharacterRole)}
                    options={ROLE_OPTIONS}
                    width="fw"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="gen-k">Species / type</span>
                  <SelectInputView
                    size="md"
                    value={speciesDropVal}
                    onChange={(v) => {
                      if (v === '__other__') { if (!isCustomSpecies) set('species', ''); }
                      else set('species', v);
                    }}
                    options={SPECIES_OPTIONS}
                    placeholder="— select —"
                    width="fw"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="gen-k">Age group</span>
                  <SelectInputView
                    size="md"
                    value={draft.age}
                    onChange={(v) => set('age', v)}
                    options={AGE_SELECT_OPTIONS}
                    placeholder="— select —"
                    width="fw"
                  />
                </div>
              </div>
              {isCustomSpecies && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="gen-k">Custom name</span>
                  <TextInputView
                    size="md"
                    value={draft.species}
                    placeholder="e.g. unicorn, phoenix, alien…"
                    onChange={(e) => set('species', e.target.value)}
                    width="fw"
                  />
                </div>
              )}
            </>
          );
        })()}

        {/* Look description — THE KEY FIELD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="gen-k">Look description</span>
            <span style={{ fontSize: 10, color: '#34d399', fontWeight: 500 }}>← injected into every scene prompt</span>
          </div>
          <MultilineInputView
            size="md"
            rows={3}
            value={draft.lookDescription}
            placeholder="a small silver rabbit with soft blue eyes, a fluffy cotton tail, wearing a tiny purple bow on her left ear"
            onChange={(e) => set('lookDescription', e.target.value)}
            resize="vertical"
          />
        </div>

        {/* Traits */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="gen-k">Personality traits</span>
          <TraitEditor traits={draft.traits} onChange={(t) => set('traits', t)} />
        </div>

        {/* Locked seed + reference image */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="gen-k" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <LockIcon size={12} /> Locked seed{' '}
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(optional)</span>
            </span>
            <TextInputView
              size="sm"
              type="number"
              value={draft.lockedSeed ?? ''}
              placeholder="e.g. 42 — for re-roll consistency"
              onChange={(e) => set('lockedSeed', e.target.value ? parseInt(e.target.value, 10) : null)}
              width="fw"
            />
          </div>
          <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="gen-k" style={{ whiteSpace: 'nowrap' }}>
              Reference image{' '}
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(optional)</span>
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {draft.referenceImage && (
                <img src={draft.referenceImage} alt="ref"
                  style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
              )}
              <ButtonView size="sm" onClick={() => fileRef.current?.click()}>
                {draft.referenceImage ? '🔄 Change' : '📎 Upload'}
              </ButtonView>
              {draft.referenceImage && (
                <ButtonView size="sm" accentColor="#f87171" onClick={() => set('referenceImage', null)}>
                  Remove
                </ButtonView>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefImage} />
            </div>
          </div>
        </div>

        {/* Narration voice */}
        {(() => {
          const voiceOptions: SelectOption[] = [
            { value: '', label: '— default narrator voice —' },
            ...engineVoices.map((v) => ({ value: v, label: `${v} (engine built-in)` })),
            ...voices.map((v) => ({ value: `clone:${v.id}`, label: `🎙 ${v.label}` })),
          ];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="gen-k" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MicIcon size={12} /> Narration voice
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(optional — used when this character speaks)</span>
              </span>
              <SelectInputView
                size="sm"
                value={draft.voiceId ?? ''}
                onChange={(v) => set('voiceId', v || null)}
                options={voiceOptions}
                width="fw"
              />
            </div>
          );
        })()}

        {/* Photo → Hero */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
          padding: '8px 10px', borderRadius: 8,
          background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            <b style={{ color: '#34d399' }}>📸 Photo → Hero</b>
            <span style={{ color: 'var(--color-text-muted)', marginLeft: 6 }}>
              Generate a cartoon likeness from a real photo (local engine only).
            </span>
          </div>
          <ButtonView size="sm" accentColor="#34d399" iconLeft={<CameraIcon size={13} />}
            onClick={() => setPhotoModal(true)}>
            Open
          </ButtonView>
        </div>

        {/* Action buttons — right-aligned */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 4, justifyContent: 'flex-end' }}>
          <ButtonView size="sm" iconLeft={<SaveIcon size={13} />} onClick={handleSave}
            disabled={!dirty && !!char}>
            {char ? 'Save changes' : 'Create character'}
          </ButtonView>
          {char && (
            <ButtonView size="sm" variant="secondary" onClick={handleNew} iconLeft={<PlusIcon size={13} />}>
              New
            </ButtonView>
          )}
          {char && (
            <ButtonView size="sm" accentColor="#f87171" variant="secondary"
              iconLeft={<TrashIcon size={13} />} onClick={handleDelete}>
              Delete
            </ButtonView>
          )}
        </div>
      </div>

      <PhotoHeroModal
        open={photoModal}
        onClose={() => setPhotoModal(false)}
        characterName={char?.name || draft.name || undefined}
        onSelect={(image_b64) => {
          set('referenceImage', `data:image/png;base64,${image_b64}`);
        }}
      />
    </div>
  );
}

function CharacterList() {
  const { characters, editingId, setEditing } = useCharactersStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ButtonView size="sm" iconLeft={<PlusIcon size={13} />} onClick={() => setEditing(null)}
        style={{ width: '100%' }}>
        New character
      </ButtonView>

      {characters.length === 0 && (
        <div style={{
          padding: '20px 12px', textAlign: 'center',
          color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.5,
          border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8,
        }}>
          <UsersIcon size={24} style={{ opacity: 0.4, marginBottom: 6 }} />
          <div>No characters yet.</div>
          <div>Create one to get started.</div>
        </div>
      )}

      {characters.map((c) => {
        const isActive = c.id === editingId;
        const rm = ROLE_META[c.role];
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setEditing(c.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(c.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              background: isActive ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isActive ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: 'var(--color-text-primary)',
            }}
          >
            <Avatar name={c.name} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <ChipView size="xs" color={rm.color} label={rm.label} />
                {c.species && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{c.species}</span>}
              </div>
            </div>
            {c.lockedSeed != null && <LockIcon size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The Character Studio body (list + form) — reused by the top-nav Character
 * Studio tab (right pane). `header` toggles the settings-style heading.
 */
export function CharacterStudioContent({ header = true }: { header?: boolean }) {
  const load = useCharactersStore((s) => s.load);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="story-tab-scroll">
      <div className="prov-page">
        {header && (
          <SettingsPanelHeader icon="🧬" title="Character Studio" subtitle="Build reusable characters whose look is injected into every scene — consistent across all pages." />
        )}

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 210, flexShrink: 0 }}>
            <CharacterList />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CharacterForm />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settings panel wrapper (kept for any legacy reference). */
export function CharacterStudio() {
  return <CharacterStudioContent />;
}

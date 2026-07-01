/**
 * Multi-author profiles panel — S46.
 * PIN-protected child/parent/teacher profiles.
 */
import { useState, useEffect } from 'react';
import { ButtonView, IconButtonView, TextInputView, SelectInputView, ChipView } from '@salilvnair/dui';
import { useProfilesStore, type Profile } from '../../store/profiles-store';
import { useFamilyInsightsStore, type InsightSummary } from '../../store/family-insights-store';
import { TrashIcon } from '../../icons';
import { SettingsPanelHeader } from './SettingsPanelHeader';

const EMOJIS = ['👦', '👧', '🧒', '👨', '👩', '👴', '👵', '🧑', '🐱', '🐶', '🦁', '🐼'];
const READING_LEVELS = [
  { value: 'pre',        label: 'Pre-reader (ages 2–4)' },
  { value: 'early',      label: 'Early reader (ages 5–7)' },
  { value: 'confident',  label: 'Confident reader (ages 8+)' },
];
const ROLES = [
  { value: 'child',   label: 'Child' },
  { value: 'parent',  label: 'Parent' },
  { value: 'teacher', label: 'Teacher' },
];

const ROLE_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  child:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Child',   icon: '🎒' },
  parent:  { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Parent',  icon: '🏠' },
  teacher: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Teacher', icon: '📚' },
};

const LEVEL_CFG: Record<string, { color: string; label: string }> = {
  pre:       { color: '#f472b6', label: 'Pre-reader' },
  early:     { color: '#fb923c', label: 'Early reader' },
  confident: { color: '#4ade80', label: 'Confident' },
};

const BLANK: Omit<Profile, 'id' | 'createdAt'> = {
  name: '', emoji: '👦', pin: '', role: 'child',
  interests: [], age: undefined, readingLevel: 'early',
};

export function ProfilesPanel() {
  const { profiles, activeProfileId, loaded, load, add, update, remove, switchTo } = useProfilesStore();
  const { getSummary } = useFamilyInsightsStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [switchPin, setSwitchPin] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Record<string, InsightSummary>>({});

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => {
    for (const p of profiles) {
      getSummary(p.id).then((s) => setSummary((prev) => ({ ...prev, [p.id]: s })));
    }
  }, [profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const rc = (role: string) => ROLE_CFG[role] ?? ROLE_CFG.child;
  const lc = (level: string) => LEVEL_CFG[level] ?? LEVEL_CFG.early;
  const formRc = rc(form.role);

  async function handleAdd() {
    setError('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    try {
      await add(form);
      setShowAdd(false); setEditId(null); setForm({ ...BLANK });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
  }

  async function handleSwitch(id: string) {
    setError('');
    try {
      await switchTo(id, switchPin[id] || '');
      setSwitchPin({});
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <div className="story-tab-scroll">
      <div className="pp-root">

        <SettingsPanelHeader icon="👤" title="Profiles" subtitle="PIN-protected child, parent, and teacher profiles with reading insights." action={<ButtonView size="sm" accentColor="#a78bfa" onClick={() => { setShowAdd(true); setEditId(null); setForm({ ...BLANK }); }}>+ New Profile</ButtonView>} />

        {error && <div className="pp-error">{error}</div>}

        {/* ── Add / edit form ─────────────────────────────────────── */}
        {(showAdd || editId) && (
          <div className="pp-form-card" style={{
            borderColor: formRc.color + '55',
            boxShadow: `0 0 0 1px ${formRc.color}22, 0 4px 24px rgba(0,0,0,0.3)`,
          }}>
            <div className="pp-form-title" style={{ color: formRc.color }}>
              {editId ? '✏️ Edit Profile' : '✨ New Profile'}
            </div>

            <div className="pp-emoji-label">Choose avatar</div>
            <div className="pp-emoji-grid">
              {EMOJIS.map((e) => (
                <ButtonView key={e} size="xs" accentColor={form.emoji === e ? formRc.color : undefined}
                  onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                  style={{
                    width: 40, height: 40, fontSize: 20, padding: 0, borderRadius: 10, flexShrink: 0,
                    border: form.emoji === e ? `2px solid ${formRc.color}` : '1px solid rgba(255,255,255,0.08)',
                    background: form.emoji === e ? formRc.bg : 'rgba(255,255,255,0.03)',
                    boxShadow: form.emoji === e ? `0 0 8px ${formRc.color}55` : 'none',
                  }}>
                  {e}
                </ButtonView>
              ))}
            </div>

            <div className="pp-form-grid">
              <div className="pp-form-field">
                <div className="pp-field-label">Name</div>
                <TextInputView size="md" value={form.name} placeholder="e.g. Emma"
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              </div>
              <div className="pp-form-field">
                <div className="pp-field-label">PIN (optional)</div>
                <TextInputView size="md" value={form.pin} placeholder="4-digit PIN" type="password"
                  onChange={(v) => setForm((f) => ({ ...f, pin: v }))} />
              </div>
              <div className="pp-form-field">
                <div className="pp-field-label">Role</div>
                <SelectInputView size="md" value={form.role} options={ROLES}
                  onChange={(v) => setForm((f) => ({ ...f, role: v as Profile['role'] }))} />
              </div>
              <div className="pp-form-field">
                <div className="pp-field-label">Reading Level</div>
                <SelectInputView size="md" value={form.readingLevel} options={READING_LEVELS}
                  onChange={(v) => setForm((f) => ({ ...f, readingLevel: v as Profile['readingLevel'] }))} />
              </div>
              <div className="pp-form-field">
                <div className="pp-field-label">Age (optional)</div>
                <TextInputView size="md" value={String(form.age ?? '')} placeholder="e.g. 6" type="number"
                  onChange={(v) => setForm((f) => ({ ...f, age: v ? parseInt(v) : undefined }))} />
              </div>
            </div>

            <div className="pp-form-footer">
              <ButtonView size="md" accentColor={formRc.color} onClick={async () => {
                if (editId) { await update(editId, form); setEditId(null); } else { await handleAdd(); }
              }}>
                {editId ? 'Save Changes' : 'Create Profile'}
              </ButtonView>
              <ButtonView size="md" accentColor="rgba(255,255,255,0.2)"
                onClick={() => { setShowAdd(false); setEditId(null); }}>
                Cancel
              </ButtonView>
            </div>
          </div>
        )}

        {/* ── Profile list ─────────────────────────────────────────── */}
        <div className="pp-list">
          {!profiles.length && !showAdd && (
            <div className="pp-empty">
              <div className="pp-empty-icon">👤</div>
              <div className="pp-empty-title">No profiles yet</div>
              <div className="pp-empty-sub">Create one to start tracking reading progress</div>
            </div>
          )}

          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const rc_ = rc(p.role);
            const lc_ = lc(p.readingLevel);
            const ins: InsightSummary | undefined = summary[p.id];

            return (
              <div key={p.id} className={`pp-card${isActive ? ' pp-card-active' : ''}`}
                style={{ '--pp-c': rc_.color } as React.CSSProperties}>

                {/* Left accent stripe */}
                <div className="pp-stripe"
                  style={{ background: `linear-gradient(180deg, ${rc_.color}, ${rc_.color}66)` }} />

                <div className="pp-card-body">
                  {/* Avatar + meta + actions */}
                  <div className="pp-card-top">
                    <div className="pp-avatar" style={{
                      boxShadow: isActive
                        ? `0 0 0 3px ${rc_.color}, 0 0 18px ${rc_.color}55`
                        : '0 0 0 2px rgba(255,255,255,0.1)',
                      background: rc_.bg,
                    }}>
                      {p.emoji}
                    </div>

                    <div className="pp-meta">
                      <div className="pp-nameline">
                        <span className="pp-name">{p.name}</span>
                        {isActive && <ChipView size="xs" color={rc_.color} label="ACTIVE" />}
                      </div>
                      <div className="pp-badges">
                        <span className="pp-badge" style={{ background: rc_.bg, color: rc_.color, borderColor: rc_.color + '44' }}>
                          {rc_.icon} {rc_.label}
                        </span>
                        <span className="pp-badge" style={{ background: lc_.color + '18', color: lc_.color, borderColor: lc_.color + '44' }}>
                          {lc_.label}
                        </span>
                        {p.age != null && (
                          <span className="pp-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', borderColor: 'rgba(255,255,255,0.1)' }}>
                            Age {p.age}
                          </span>
                        )}
                        {p.pin && (
                          <span className="pp-badge" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderColor: '#fbbf2440' }}>
                            🔒 PIN
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pp-actions">
                      {!isActive && (
                        <>
                          {p.pin && (
                            <TextInputView size="sm" value={switchPin[p.id] || ''} type="password"
                              placeholder="PIN" style={{ width: 70 }}
                              onChange={(v) => setSwitchPin((s) => ({ ...s, [p.id]: v }))} />
                          )}
                          <ButtonView size="sm" accentColor={rc_.color} onClick={() => handleSwitch(p.id)}>
                            Switch
                          </ButtonView>
                        </>
                      )}
                      <ButtonView size="sm" accentColor="rgba(255,255,255,0.18)"
                        onClick={() => {
                          setEditId(p.id);
                          setForm({ name: p.name, emoji: p.emoji, pin: p.pin, role: p.role, interests: p.interests, age: p.age, readingLevel: p.readingLevel });
                          setShowAdd(false);
                        }}>
                        Edit
                      </ButtonView>
                      <div>
                        <IconButtonView size="sm" icon={<TrashIcon size={12} />}
                          onClick={() => remove(p.id)} tooltip="Delete profile" />
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  {ins && (
                    <div className="pp-stats">
                      {ins.streak > 0 && (
                        <span className="pp-stat pp-stat-fire">🔥 {ins.streak}d streak</span>
                      )}
                      <span className="pp-stat pp-stat-book">📚 {ins.totalStoriesRead} stories</span>
                      {(ins.totalPagesRead ?? 0) > 0 && (
                        <span className="pp-stat pp-stat-pages">📖 {ins.totalPagesRead} pages</span>
                      )}
                      {ins.avgQuizScore > 0 && (
                        <span className="pp-stat pp-stat-quiz">🎓 {Math.round(ins.avgQuizScore)}% quiz avg</span>
                      )}
                    </div>
                  )}

                  {/* Next suggestions */}
                  {ins?.suggestions?.length > 0 && (
                    <div className="pp-suggests">
                      <span className="pp-suggests-lbl">💡 Next for {p.name}</span>
                      <div className="pp-suggest-chips">
                        {ins.suggestions.slice(0, 3).map((s) => (
                          <span key={s} className="pp-suggest-chip">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

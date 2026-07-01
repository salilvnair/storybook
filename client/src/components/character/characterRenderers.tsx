/**
 * ConvEngine custom renderers for Character Studio's "describe to AI" mode. The
 * assistant emits {type:'CharacterControls'} carrying an [[apply-char:{…}]] spec;
 * we apply it to the live character-draft store (so the right-side form fills in)
 * and show a suggestion card with a "Create Character" button.
 */
import { useEffect, useState } from 'react';
import { useCharacterDraftStore, type CharacterAiSpec } from '../../store/character-draft-store';
import { useCharactersStore } from '../../store/characters-store';

interface Actions {
  submit: (text: string, params?: Record<string, unknown>) => void;
  submitSilent: (params?: Record<string, unknown>) => void;
  appendBubble: (text: string, role?: string) => void;
  prefillInput: (text: string) => void;
}

function CharacterControlsCard({ payload, actions }: { payload: { intro?: string }; actions: Actions }) {
  const draft = useCharacterDraftStore((s) => s.draft);
  const applyAi = useCharacterDraftStore((s) => s.applyAi);
  const clearDirty = useCharacterDraftStore((s) => s.clearDirty);
  const add = useCharactersStore((s) => s.add);
  const setEditing = useCharactersStore((s) => s.setEditing);
  const [created, setCreated] = useState(false);

  // The LLM ships an inferred character via an [[apply-char:{…}]] sentinel.
  const rawIntro = payload?.intro || '';
  const specMatch = rawIntro.match(/\[\[apply-char:([\s\S]*?)\]\]/);
  const intro = rawIntro.replace(/\[\[apply-char:[\s\S]*?\]\]/, '').trim();
  useEffect(() => {
    if (!specMatch) return;
    try { applyAi(JSON.parse(specMatch[1]) as CharacterAiSpec); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specMatch?.[1]]);

  const hasSpec = !!specMatch;

  const createCharacter = async () => {
    if (!draft.name.trim()) return;
    const c = await add(draft);
    clearDirty();
    setEditing(c.id);
    setCreated(true);
    actions.submit(`Created ${c.name}`, { action: 'created' });
  };

  return (
    <div className="ce-interactive-card csx-card">
      {intro && <p className="csx-intro">{intro}</p>}

      {hasSpec && (
        <div className="csx-summary">
          <div className="csx-row"><span className="csx-k">Name</span><span className="csx-v">{draft.name || '—'}</span></div>
          <div className="csx-row"><span className="csx-k">Role</span><span className="csx-v">{draft.role} · {draft.species} · {draft.age}</span></div>
          {draft.lookDescription && <div className="csx-row"><span className="csx-k">Look</span><span className="csx-v csx-look">{draft.lookDescription}</span></div>}
          {draft.traits.length > 0 && (
            <div className="csx-row"><span className="csx-k">Traits</span>
              <span className="csx-traits">{draft.traits.map((t) => <span key={t} className="csx-trait">{t}</span>)}</span>
            </div>
          )}
        </div>
      )}

      {hasSpec && (
        <div className="csx-actions">
          <button className="ce-interactive-submit csx-create" disabled={!draft.name.trim() || created} onClick={() => void createCharacter()}>
            {created ? '✓ Created' : '✨ Create Character'}
          </button>
          <button className="ce-interactive-submit csx-ghost" onClick={() => actions.prefillInput('Make them ')}>✏ Refine</button>
        </div>
      )}
    </div>
  );
}

export const characterControlsRenderer = {
  key: 'CharacterControls', priority: 200, hideBubble: false,
  match: ({ effectiveType }: { effectiveType: string }) => effectiveType === 'CharacterControls',
  Component: CharacterControlsCard,
};

export const CHARACTER_RENDERERS = [characterControlsRenderer];

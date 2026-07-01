/**
 * PageFlipBook — the Library saved-story reader. Thin wrapper over the shared
 * FlipBook (react-pageflip). Reader mode ('pageflip' curl | 'classic' 3D) only
 * changes the interior page density; cover & back are always rigid.
 *
 * S-E5 — each illustration (cover + page images) carries a 🖌 Edit button that
 * opens the shared AIEditPanel; applied edits are persisted via
 * POST /api/stories/:id/image and the <img> is cache-busted so the swap shows live.
 */
import { useEffect, useState } from 'react';
import { usePrefsStore } from '../../store/prefs-store';
import { FlipBook, FlipPage, interiorDensity } from './FlipBook';
import { AIEditPanel } from '../edit/AIEditPanel';

interface Scene { title?: string; narration?: string; says?: string; thinks?: string; image_prompt?: string }
interface Props { storyId: string; pageCount: number; title: string }

/** 'cover' or a 1-based page number. */
type Slot = 'cover' | number;

export function PageFlipBook({ storyId, pageCount, title }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const readerMode = usePrefsStore((s) => s.prefs.readerMode);
  const density = interiorDensity(readerMode);

  // S-E5 — AI edit overlay: which slot is being edited + a per-slot cache-buster.
  const [editing, setEditing] = useState<Slot | null>(null);
  const [vers, setVers] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`/api/stories/${storyId}`)
      .then((r) => r.json())
      .then((d) => setScenes(d?.story?.scenes || []))
      .catch(() => {});
  }, [storyId]);

  const slotKey = (s: Slot) => (s === 'cover' ? 'cover' : `page-${s}`);
  const srcFor = (s: Slot) => {
    const base = s === 'cover' ? `/api/stories/${storyId}/cover` : `/api/stories/${storyId}/page/${s}`;
    const v = vers[slotKey(s)];
    return v ? `${base}?v=${v}` : base;
  };
  const promptFor = (s: Slot) =>
    s === 'cover' ? scenes[0]?.image_prompt || title : scenes[s - 1]?.image_prompt || scenes[s - 1]?.narration || '';

  const persist = async (b64: string) => {
    if (editing == null) return;
    const slot = editing;
    try {
      const res = await fetch(`/api/stories/${storyId}/image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: slot === 'cover' ? 'cover' : slot, image_b64: b64 }),
      });
      if (res.ok) setVers((v) => ({ ...v, [slotKey(slot)]: Date.now() }));
    } catch { /* keep the old image */ }
  };

  return (
    <div className="bf-stage">
      <FlipBook key={`${storyId}-${readerMode}`} pageCount={pageCount}>
        <FlipPage className="pfb-cover-page" density="hard">
          <div className="bp-art">
            <img src={srcFor('cover')} alt={title} draggable={false}
              onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
            <div className="pfb-cover-title">{title}</div>
            <button className="bp-edit-btn" title="AI edit this image"
              onClick={(e) => { e.stopPropagation(); setEditing('cover'); }}>🖌️ Edit</button>
          </div>
        </FlipPage>

        {Array.from({ length: pageCount }).flatMap((_, i) => [
          <FlipPage key={`text-${i}`} className="pfb-text-page" density={density}>
            <div className="bp-text">
              <div className="bp-num">Page {i + 1}</div>
              <div className="bp-stitle">{scenes[i]?.title}</div>
              <p className="bp-narr">{scenes[i]?.narration}</p>
              {scenes[i]?.says && <div className="bp-bubble bp-says">💬 &ldquo;{scenes[i]?.says}&rdquo;</div>}
              {scenes[i]?.thinks && <div className="bp-bubble bp-thinks">💭 {scenes[i]?.thinks}</div>}
            </div>
          </FlipPage>,
          <FlipPage key={`img-${i}`} className="pfb-image-page" density={density}>
            <div className="bp-art">
              <img src={srcFor(i + 1)} alt={scenes[i]?.title || `Page ${i + 1}`} draggable={false}
                onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
              <button className="bp-edit-btn" title="AI edit this image"
                onClick={(e) => { e.stopPropagation(); setEditing(i + 1); }}>🖌️ Edit</button>
            </div>
          </FlipPage>,
        ])}

        <FlipPage className="pfb-back-page" density="hard">
          <div className="bp-backcover">
            <div className="bp-bc-end">The End</div>
            <div className="bp-bc-title">{title}</div>
            <div className="bp-bc-mark">📖 iStorybook</div>
          </div>
        </FlipPage>
      </FlipBook>

      {editing != null && (
        <div className="bp-edit-overlay" onClick={() => setEditing(null)}>
          <div className="bp-edit-modal" onClick={(e) => e.stopPropagation()}>
            <AIEditPanel
              key={slotKey(editing)}
              imageSrc={srcFor(editing)}
              currentPrompt={promptFor(editing)}
              title={editing === 'cover' ? 'AI Edit — cover' : `AI Edit — page ${editing}`}
              onApply={(b64) => void persist(b64)}
              onClose={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

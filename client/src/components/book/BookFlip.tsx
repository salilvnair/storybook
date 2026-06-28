/**
 * BookFlip — a REAL two-page flip-book. The book is always an open spread: a
 * LEFT page and a RIGHT page (never stitched into one wide image). Only the
 * RIGHT page turns — a single leaf with a FRONT (current right page) and a BACK
 * (next left page) that pivots on the centre spine (transform-origin: left
 * center, preserve-3d, backface-visibility hidden). Drag the page to turn it.
 *
 *   spread 0 : title page (left) + cover art (right)
 *   spread k : scene text (left) + scene illustration (right)
 *
 * Technique per davidwalsh / 3dtransforms.desandro / cssscript flip-book guides.
 */
import { useEffect, useRef, useState } from 'react';

interface Scene { title?: string; narration?: string; says?: string; thinks?: string }
interface Props { storyId: string; pageCount: number; title: string }
interface Turn { dir: 1 | -1; rot: number; settling?: 'commit' | 'revert' }

const FOLD = 180;
const THRESHOLD = 0.3;

export function BookFlip({ storyId, pageCount, title }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [s, setS] = useState(0);                  // spread index: 0 = cover, 1..N = scenes
  const [turn, setTurn] = useState<Turn | null>(null);

  const bookRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const startX = useRef(0);
  const pageW = useRef(340);

  useEffect(() => {
    fetch(`/api/stories/${storyId}`).then((r) => r.json()).then((d) => setScenes(d?.story?.scenes || [])).catch(() => {});
  }, [storyId]);

  // spread 0 = closed front (cover on the right); 1..N = open scenes;
  // last (pageCount+1) = closed back (back cover on the left).
  const total = pageCount + 2;
  const backSpread = total - 1;

  // ── page content ──────────────────────────────────────────────────────────
  // The cover (spread 0) has no LEFT page; the back (last spread) has no RIGHT page.
  const Left = (k: number) => {
    if (k <= 0) return null;
    if (k > pageCount) {
      return (
        <div className="bp-backcover">
          <div className="bp-bc-end">The End</div>
          <div className="bp-bc-title">{title}</div>
          <div className="bp-bc-mark">📖 iStorybook</div>
        </div>
      );
    }
    const sc = scenes[k - 1];
    return (
      <div className="bp-text">
        <div className="bp-num">Page {k}</div>
        <div className="bp-stitle">{sc?.title}</div>
        <p className="bp-narr">{sc?.narration}</p>
        {sc?.says && <div className="bp-bubble bp-says">💬 “{sc.says}”</div>}
        {sc?.thinks && <div className="bp-bubble bp-thinks">💭 {sc.thinks}</div>}
      </div>
    );
  };
  const Right = (k: number) => {
    if (k > pageCount) return null;   // back cover has no right page
    return (
      <div className="bp-art">
        <img src={k === 0 ? `/api/stories/${storyId}/cover` : `/api/stories/${storyId}/page/${k}`}
          alt={k === 0 ? title : `Page ${k}`} draggable={false}
          onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
      </div>
    );
  };

  // Static base pages + the turning leaf's two faces, derived from the turn dir.
  const fwd = turn?.dir === 1;
  const baseLeft = turn ? (fwd ? Left(s) : Left(s - 1)) : Left(s);
  const baseRight = turn ? (fwd ? Right(s + 1) : Right(s)) : Right(s);
  const leafFront = turn ? (fwd ? Right(s) : Right(s - 1)) : null;
  const leafBack = turn ? (fwd ? Left(s + 1) : Left(s)) : null;

  // ── drag ──────────────────────────────────────────────────────────────────
  const onDown = (e: React.PointerEvent) => {
    if (turn?.settling) return;
    active.current = true;
    startX.current = e.clientX;
    pageW.current = (bookRef.current?.offsetWidth || 680) / 2;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!active.current) return;
    const dx = e.clientX - startX.current;
    const w = pageW.current;
    if (dx < 0 && s < total - 1) {
      setTurn({ dir: 1, rot: Math.max(-FOLD, (dx / w) * FOLD) });        // forward: 0 → -180
    } else if (dx > 0 && s > 0) {
      setTurn({ dir: -1, rot: Math.min(0, -FOLD + (dx / w) * FOLD) });   // back: -180 → 0
    } else {
      setTurn(null);
    }
  };
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUp = () => {
    active.current = false;
    setTurn((t) => {
      if (!t) return null;
      const progress = t.dir === 1 ? Math.abs(t.rot) / FOLD : (FOLD - Math.abs(t.rot)) / FOLD;
      const commit = progress > THRESHOLD;
      const target = t.dir === 1 ? (commit ? -FOLD : 0) : (commit ? 0 : -FOLD);
      // Fallback in case transitionend doesn't fire (e.g. no value change to animate).
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => finishSettle(commit, t.dir), 420);
      return { ...t, rot: target, settling: commit ? 'commit' : 'revert' };
    });
  };
  const finishSettle = (commit: boolean, dir: 1 | -1) => {
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    if (commit) setS((v) => Math.max(0, Math.min(total - 1, v + dir)));
    setTurn(null);
  };
  const onSettleEnd = () => { if (turn?.settling) finishSettle(turn.settling === 'commit', turn.dir); };
  const jump = (i: number) => { if (!turn) setS(i); };

  const frontShade = turn ? Math.min(0.55, Math.max(0, -turn.rot / FOLD) * 0.7) : 0;       // darkens as it lifts (0→-90)
  const backShade = turn ? Math.min(0.55, Math.max(0, (FOLD + turn.rot) / FOLD) * 0.0 + Math.max(0, (-turn.rot - 90) / 90) * 0.45) : 0;

  const closedFront = !turn && s === 0;               // unopened — only the cover (right) shows
  const closedBack = !turn && s === backSpread;       // finished — only the back cover (left) shows
  const leftEmpty = baseLeft == null;                 // cover spread has no left page
  const rightEmpty = baseRight == null;               // back spread has no right page

  return (
    <div className="bf-stage">
      <div className={`bp-book${closedFront ? ' bp-closed-front' : ''}${closedBack ? ' bp-closed-back' : ''}`} ref={bookRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className={`bp-page bp-left${leftEmpty ? ' bp-empty' : ''}`}>{baseLeft}{!leftEmpty && !closedBack && <span className="bp-gutter bp-gutter-r" />}</div>
        <div className={`bp-page bp-right${rightEmpty ? ' bp-empty' : ''}`}>{baseRight}{!rightEmpty && !closedFront && <span className="bp-gutter bp-gutter-l" />}</div>

        {turn && (
          <div className="bp-leaf" style={{ transform: `rotateY(${turn.rot}deg)`, transition: turn.settling ? 'transform .36s cubic-bezier(.4,0,.35,1)' : 'none' }} onTransitionEnd={onSettleEnd}>
            <div className="bp-leaf-face bp-leaf-front">{leafFront}<span className="bp-gutter bp-gutter-l" /><div className="bp-shade" style={{ opacity: frontShade }} /></div>
            <div className="bp-leaf-face bp-leaf-back">{leafBack}<span className="bp-gutter bp-gutter-r" /><div className="bp-shade" style={{ opacity: backShade }} /></div>
          </div>
        )}
      </div>

      <div className="bf-footer">
        <span className="bf-hint">← drag the right page to turn →</span>
        <div className="bf-dots">
          {Array.from({ length: total }).map((_, i) => (
            <button key={i} className={`bf-dot${i === s ? ' on' : ''}`} onClick={() => jump(i)} aria-label={`Go to spread ${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

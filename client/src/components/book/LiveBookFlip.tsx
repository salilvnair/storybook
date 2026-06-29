/**
 * LiveBookFlip — the LIVE animated book shown in StorybookCanvas during and after
 * generation. Data comes directly from the story-store (in-memory b64), not the
 * saved-story API that BookFlip uses.
 *
 * During generation: auto-advances to the latest arrived page spread.
 * After done: full interactive drag-to-turn (same 3D technique as BookFlip).
 *
 * Spreads: 0 = cover art only (right page), no left page
 *          k = scene k text (left) + scene k illustration (right)
 *        N+1 = "The End" back-cover
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStoryStore } from '../../store/story-store';
import { useCharactersStore } from '../../store/characters-store';
import type { GenStep } from '../../store/story-store';

type NarrStatus = 'idle' | 'loading' | 'ready' | 'error';
interface NarrState { status: NarrStatus; url?: string; error?: string }

function base64ToBlob(b64: string, mime: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

interface Turn { dir: 1 | -1; rot: number; settling?: 'commit' | 'revert' }

const FOLD = 180;
const THRESHOLD = 0.3;

function StepMeta({ gs }: { gs: GenStep }) {
  return (
    <div className="lbf-step-meta">
      <div className="lbf-step-header">
        <span>Step {gs.step}/{gs.total}</span>
        <div className="lbf-step-bar-wrap">
          <div className="lbf-step-bar-fill" style={{ width: `${Math.round(gs.pct * 100)}%` }} />
        </div>
        <span className="lbf-step-pct">{Math.round(gs.pct * 100)}%</span>
      </div>
      <div className="lbf-step-details">
        <span>{gs.elapsed_s.toFixed(1)}s</span>
        <span>{gs.it_s.toFixed(2)} it/s</span>
        {gs.config && <span>{gs.config}</span>}
        {gs.seed != null && <span>seed {gs.seed}</span>}
      </div>
      {gs.prompt && (
        <div className="lbf-step-prompt">{gs.prompt.slice(0, 90)}{gs.prompt.length > 90 ? '…' : ''}</div>
      )}
    </div>
  );
}

const RegenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.5 10A6.5 6.5 0 0 1 10 3.5a6.47 6.47 0 0 1 4.596 1.904L13 7h4V3l-1.536 1.536A8 8 0 1 0 18 10h-1.5A6.5 6.5 0 0 1 3.5 10Z" fill="#3a2e28"/>
  </svg>
);

export function LiveBookFlip() {
  const { story, cover, pages, phase, progress, genStep, regenerating, regeneratingCover, regeneratePage, regenerateCover } = useStoryStore();
  const heroSeed = useCharactersStore((s) => {
    const selected = s.characters.filter((c) => s.selectedIds.includes(c.id));
    const hero = selected.find((c) => c.role === 'hero') ?? selected[0];
    return hero?.lockedSeed ?? null;
  });
  const [s, setS] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [narr, setNarr] = useState<Record<number, NarrState>>({});
  const [playingPage, setPlayingPage] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const bookRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const startX = useRef(0);
  const pageW = useRef(340);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGenerating = phase === 'generating';
  const sceneCount = story?.scenes?.length ?? 0;
  const total = sceneCount + 2; // spread 0 = cover, 1..N = scenes, N+1 = back

  // ── auto-advance while generating ─────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating) return;
    const arrived = pages.filter((p) => p.image_b64).length;
    setS(arrived);
  }, [pages, isGenerating]);

  // Reset to cover spread when a fresh generation starts
  useEffect(() => {
    if (phase === 'generating' && !cover && pages.every((p) => !p.image_b64)) {
      setS(0);
    }
  }, [phase, cover, pages]);

  // ── page content ──────────────────────────────────────────────────────────
  // Spread 0 (cover) has no left page
  const Left = (k: number): React.ReactNode => {
    if (k <= 0) return null;
    if (k > sceneCount) {
      return (
        <div className="bp-backcover">
          <div className="bp-bc-end">The End</div>
          <div className="bp-bc-title">{story?.title}</div>
          <div className="bp-bc-mark">📖 iStorybook</div>
        </div>
      );
    }
    const sc = story?.scenes[k - 1];
    const narrText = [sc?.narration, sc?.says && `"${sc.says}"`, sc?.thinks].filter(Boolean).join(' ');
    const ns = narr[k] ?? { status: 'idle' as NarrStatus };
    const isDonePhase = phase === 'done';
    return (
      <div className="bp-text">
        <div className="bp-num">Page {k}</div>
        <div className="bp-stitle">{sc?.title}</div>
        <p className="bp-narr">{sc?.narration}</p>
        {sc?.says && <div className="bp-bubble bp-says">💬 &ldquo;{sc.says}&rdquo;</div>}
        {sc?.thinks && <div className="bp-bubble bp-thinks">💭 {sc.thinks}</div>}
        {isDonePhase && (
          <div className="lbf-narr-bar">
            {ns.status === 'idle' && (
              <button className="lbf-narr-btn" onClick={() => void narratePage(k, narrText)}>🔊 Read aloud</button>
            )}
            {ns.status === 'loading' && (
              <span className="lbf-narr-loading">
                <span className="story-progress-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                Synthesising…
              </span>
            )}
            {ns.status === 'ready' && (
              <div className="lbf-narr-player">
                <button className="lbf-narr-play" onClick={() => togglePlay(k)}>
                  {playingPage === k ? '⏸' : '▶'}
                </button>
                <span className="lbf-narr-label">Read aloud</span>
                <button className="lbf-narr-re" onClick={() => void narratePage(k, narrText)} title="Re-synthesise">↺</button>
              </div>
            )}
            {ns.status === 'error' && (
              <button className="lbf-narr-btn lbf-narr-err" onClick={() => void narratePage(k, narrText)}>⚠ Retry</button>
            )}
          </div>
        )}
      </div>
    );
  };

  const Right = (k: number): React.ReactNode => {
    if (k > sceneCount) return null;

    const isDone = phase === 'done';
    const isRegenThis = k === 0 ? !!regeneratingCover : regenerating === k - 1;

    const onRegen = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (k === 0) void regenerateCover();
      else void regeneratePage(k - 1);
    };
    const onRegenLocked = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (k === 0) void regenerateCover();
      else void regeneratePage(k - 1, undefined, heroSeed);
    };

    if (k === 0) {
      if (!cover) {
        return (
          <div className="bp-art lbf-loading-art">
            <div className="lbf-cover-text">Creating cover page</div>
            <span className="story-progress-spinner" />
            {genStep && <StepMeta gs={genStep} />}
          </div>
        );
      }
      return (
        <div className="bp-art">
          <img src={`data:image/png;base64,${cover}`} alt="Cover" draggable={false} />
          {(isDone || isRegenThis) && (
            <div className={`lbf-regen-overlay${isRegenThis ? ' lbf-regen-busy' : ''}`}>
              {isRegenThis
                ? <span className="story-progress-spinner" />
                : <button className="lbf-regen-btn" onClick={onRegen} title="Regenerate cover"><RegenIcon /></button>
              }
            </div>
          )}
        </div>
      );
    }

    const page = pages[k - 1];
    if (!page?.image_b64) {
      const isCurrentAndBusy = isGenerating && k === s;
      if (!isCurrentAndBusy) return <div className="bp-art" />;
      return (
        <div className="bp-art lbf-loading-art">
          <span className="story-progress-spinner" />
          <span className="lbf-art-label">{progress.label || 'Illustrating…'}</span>
          {genStep && <StepMeta gs={genStep} />}
        </div>
      );
    }
    return (
      <div className="bp-art">
        <img src={`data:image/png;base64,${page.image_b64}`} alt={page.title || `Page ${k}`} draggable={false} />
        {(isDone || isRegenThis) && (
          <div className={`lbf-regen-overlay${isRegenThis ? ' lbf-regen-busy' : ''}`}>
            {isRegenThis
              ? <span className="story-progress-spinner" />
              : (
                <>
                  <button className="lbf-regen-btn" onClick={onRegen} title={`Regenerate page ${k}`}><RegenIcon /></button>
                  {heroSeed != null && (
                    <button className="lbf-regen-btn lbf-regen-lock" onClick={onRegenLocked}
                      title={`Re-roll with character lock (seed ${heroSeed})`}
                      style={{ fontSize: 13, padding: '4px 6px' }}>🔒</button>
                  )}
                </>
              )
            }
          </div>
        )}
      </div>
    );
  };

  // Cover spread (s === 0, not mid-turn) — left page is invisible (bp-empty)
  const isClosedFront = s === 0 && !turn;

  // ── derived pages for the turning leaf ────────────────────────────────────
  const fwd = turn?.dir === 1;
  const baseLeft = turn ? (fwd ? Left(s) : Left(s - 1)) : Left(s);
  const baseRight = turn ? (fwd ? Right(s + 1) : Right(s)) : Right(s);
  const leafFront = turn ? (fwd ? Right(s) : Right(s - 1)) : null;
  const leafBack = turn ? (fwd ? Left(s + 1) : Left(s)) : null;

  const leftEmpty = baseLeft == null;
  const rightEmpty = (turn ? (fwd ? Right(s + 1) : Right(s)) : Right(s)) == null;

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
      setTurn({ dir: 1, rot: Math.max(-FOLD, (dx / w) * FOLD) });
    } else if (dx > 0 && s > 0) {
      setTurn({ dir: -1, rot: Math.min(0, -FOLD + (dx / w) * FOLD) });
    } else {
      setTurn(null);
    }
  };
  const onUp = () => {
    active.current = false;
    setTurn((t) => {
      if (!t) return null;
      const progress = t.dir === 1 ? Math.abs(t.rot) / FOLD : (FOLD - Math.abs(t.rot)) / FOLD;
      const commit = progress > THRESHOLD;
      const target = t.dir === 1 ? (commit ? -FOLD : 0) : (commit ? 0 : -FOLD);
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

  const narratePage = useCallback(async (pageIdx: number, text: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    setPlayingPage(null);
    setNarr((prev) => ({ ...prev, [pageIdx]: { status: 'loading' } }));
    try {
      const res = await fetch('/api/storybook/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      const fmt = data.format || 'wav';
      const blob = base64ToBlob(data.audio_b64, `audio/${fmt}`);
      const url = URL.createObjectURL(blob);
      setNarr((prev) => ({ ...prev, [pageIdx]: { status: 'ready', url } }));
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => setPlayingPage(null);
      void audioRef.current.play();
      setPlayingPage(pageIdx);
    } catch (err) {
      setNarr((prev) => ({ ...prev, [pageIdx]: { status: 'error', error: String(err) } }));
    }
  }, []);

  const togglePlay = useCallback((pageIdx: number) => {
    if (!audioRef.current) return;
    if (playingPage === pageIdx && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlayingPage(null);
    } else {
      void audioRef.current.play();
      setPlayingPage(pageIdx);
    }
  }, [playingPage]);

  const frontShade = turn ? Math.min(0.55, Math.max(0, -turn.rot / FOLD) * 0.7) : 0;
  const backShade = turn ? Math.min(0.55, Math.max(0, (-turn.rot - 90) / 90) * 0.45) : 0;

  if (!story) return null;

  return (
    <div className="lbf-root">
      {/* Live progress bar */}
      {isGenerating && (
        <div className="lbf-progress">
          <div className="lbf-progress-inner">
            <span className="story-progress-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
            <span className="lbf-progress-label">{progress.label || 'Working…'}</span>
            <span className="lbf-progress-pct">{progress.pct}%</span>
          </div>
          <div className="story-progress-track" style={{ marginTop: 6 }}>
            <div className="story-progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      <div className="bf-stage lbf-stage">
        <div
          className={`bp-book${isClosedFront ? ' bp-closed-front' : ''}`}
          ref={bookRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* Left page — always in DOM; transparent (bp-empty) on cover spread */}
          <div className={`bp-page bp-left${leftEmpty ? ' bp-empty' : ''}`}>
            {baseLeft}
            {!leftEmpty && <span className="bp-gutter bp-gutter-r" />}
          </div>

          <div className={`bp-page bp-right${rightEmpty ? ' bp-empty' : ''}`}>
            {baseRight}
            {!rightEmpty && !isClosedFront && <span className="bp-gutter bp-gutter-l" />}
          </div>

          {/* Turning leaf */}
          {turn && (
            <div
              className="bp-leaf"
              style={{ transform: `rotateY(${turn.rot}deg)`, transition: turn.settling ? 'transform .36s cubic-bezier(.4,0,.35,1)' : 'none' }}
              onTransitionEnd={onSettleEnd}
            >
              <div className="bp-leaf-face bp-leaf-front">
                {leafFront}
                <span className="bp-gutter bp-gutter-l" />
                <div className="bp-shade" style={{ opacity: frontShade }} />
              </div>
              <div className="bp-leaf-face bp-leaf-back">
                {leafBack}
                <span className="bp-gutter bp-gutter-r" />
                <div className="bp-shade" style={{ opacity: backShade }} />
              </div>
            </div>
          )}
        </div>

        <div className="bf-footer">
          <span className="bf-hint">
            {isGenerating ? '📖 Generating your storybook…' : '← drag the right page to turn →'}
          </span>
          <div className="bf-dots">
            {Array.from({ length: total }).map((_, i) => (
              <button key={i} className={`bf-dot${i === s ? ' on' : ''}`} onClick={() => jump(i)} aria-label={`Spread ${i}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

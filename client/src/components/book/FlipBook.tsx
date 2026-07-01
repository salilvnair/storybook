/**
 * FlipBook — the ONE physical-page-turn reader (react-pageflip) used everywhere:
 * the Library saved-story reader, the Real Preview PDF reader, and the My Story
 * live reader. The old custom CSS leaf-flip ("classic") is gone.
 *
 * Two reader MODES, both driven by react-pageflip — they differ only in how the
 * INTERIOR pages turn (cover & back are always rigid / hard):
 *   • 'pageflip' (Curl)  → interior pages curl softly (data-density="soft")
 *   • 'classic'  (3D)    → interior pages flip rigidly like the cover/back
 *                          (data-density="hard")
 *
 * Consumers build the page list (cover, then [text, image] per scene, then back)
 * as <FlipPage> children and pass the interior density via `interiorDensity()`.
 */
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { usePrefsStore, type Prefs } from '../../store/prefs-store';

/** Density of the INTERIOR pages for a reader mode. Cover/back are always hard. */
export function interiorDensity(mode: Prefs['readerMode']): 'hard' | 'soft' {
  return mode === 'classic' ? 'hard' : 'soft';
}

/** A single react-pageflip page. `density` → 'hard' (rigid) | 'soft' (curl). */
export const FlipPage = forwardRef<HTMLDivElement, { className?: string; density?: 'hard' | 'soft'; children: ReactNode }>(
  ({ className, density, children }, ref) => (
    <div className={`pfb-page ${className ?? ''}`} data-density={density} ref={ref}>{children}</div>
  ),
);
FlipPage.displayName = 'FlipPage';

export interface FlipBookHandle {
  /** Programmatically turn to a spread (0=cover … last=back). Used for auto-advance + dots. */
  flipToSpread: (spread: number) => void;
}

interface Props {
  /** Number of interior scene pages (illustrations). totalSpreads = pageCount + 2. */
  pageCount: number;
  /** FlipPage children in order: cover, then [text, image] per scene, then back. */
  children: ReactNode;
  /** Called whenever the visible spread changes (drag, dot, or programmatic flip). */
  onSpreadChange?: (spread: number) => void;
  width?: number;
  height?: number;
  hint?: string;
}

export const FlipBook = forwardRef<FlipBookHandle, Props>(function FlipBook(
  { pageCount, children, onSpreadChange, width = 380, height = 440, hint = '← drag the right page to turn →' },
  ref,
) {
  const [spread, setSpread] = useState(0);
  const bookRef = useRef<{ pageFlip: () => { flip: (p: number, c?: string) => void; getCurrentPageIndex: () => number } } | null>(null);
  const flipShadow = usePrefsStore((s) => s.prefs.flipShadow);
  const flipSpeed = usePrefsStore((s) => s.prefs.flipSpeed);

  const totalSpreads = pageCount + 2;
  const totalPages = 2 + 2 * pageCount;
  const pageToSpread = (p: number) => (p === 0 ? 0 : p >= totalPages - 1 ? totalSpreads - 1 : Math.ceil(p / 2));
  const spreadToPage = (d: number) => (d <= 0 ? 0 : d >= totalSpreads - 1 ? totalPages - 1 : 2 * d - 1);

  const flip = (d: number) => { try { bookRef.current?.pageFlip().flip(spreadToPage(d), 'bottom'); } catch { /* not ready */ } };
  useImperativeHandle(ref, () => ({ flipToSpread: flip }));

  const handleFlip = () => {
    const p = bookRef.current?.pageFlip().getCurrentPageIndex() ?? 0;
    const s = pageToSpread(p);
    setSpread(s);
    onSpreadChange?.(s);
  };

  const atCover = spread === 0;
  const atBack = spread === totalSpreads - 1;

  return (
    <>
      {/* @ts-expect-error react-pageflip loose types */}
      <HTMLFlipBook
        ref={bookRef}
        width={width}
        height={height}
        size="fixed"
        showCover
        drawShadow={flipShadow}
        flippingTime={flipSpeed}
        usePortrait={false}
        startZIndex={0}
        maxShadowOpacity={0.15}
        mobileScrollSupport
        onFlip={handleFlip}
        className={`pfb-book${atCover ? ' pfb-at-cover' : atBack ? ' pfb-at-back' : ''}`}
      >
        {children}
      </HTMLFlipBook>

      <div className="bf-footer">
        <span className="bf-hint">{hint}</span>
        <div className="bf-dots">
          {Array.from({ length: totalSpreads }).map((_, i) => (
            <button key={i} className={`bf-dot${spread === i ? ' on' : ''}`} onClick={() => flip(i)} aria-label={`Spread ${i}`} />
          ))}
        </div>
      </div>
    </>
  );
});

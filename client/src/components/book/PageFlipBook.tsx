/**
 * PageFlipBook — realistic page-curl reader using react-pageflip / StPageFlip.
 * Used in Library when Settings > Library Config > Reader mode = "Page Flip".
 *
 * Page order passed to HTMLFlipBook (each child = one page):
 *   [0] Front cover         — hard, full art
 *   [1] Scene 1 text        — left page
 *   [2] Scene 1 image       — right page
 *   ...
 *   [2N-1] Scene N text
 *   [2N]   Scene N image
 *   [2N+1] Back cover       — hard, "The End"
 *
 * showCover=true makes [0] and [last] display as single pages (hard covers).
 */
import React, { useEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { usePrefsStore } from '../../store/prefs-store';

interface Scene { title?: string; narration?: string; says?: string; thinks?: string }
interface Props { storyId: string; pageCount: number; title: string }

const TextPage = React.forwardRef<HTMLDivElement, { num: number; sc?: Scene }>(({ num, sc }, ref) => (
  <div className="pfb-page pfb-text-page" ref={ref}>
    <div className="pfb-inner">
      <div className="bp-num">Page {num}</div>
      <div className="bp-stitle">{sc?.title}</div>
      <p className="bp-narr">{sc?.narration}</p>
      {sc?.says && <div className="bp-bubble bp-says">💬 &ldquo;{sc.says}&rdquo;</div>}
      {sc?.thinks && <div className="bp-bubble bp-thinks">💭 {sc.thinks}</div>}
    </div>
    <div className="pfb-page-num">{num}</div>
  </div>
));
TextPage.displayName = 'TextPage';

const ImagePage = React.forwardRef<HTMLDivElement, { src: string; alt: string }>(({ src, alt }, ref) => (
  <div className="pfb-page pfb-image-page" ref={ref}>
    <img src={src} alt={alt} draggable={false}
      onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
  </div>
));
ImagePage.displayName = 'ImagePage';

const CoverPage = React.forwardRef<HTMLDivElement, { src: string; title: string }>(({ src, title }, ref) => (
  <div className="pfb-page pfb-cover-page" ref={ref}>
    <img src={src} alt={title} draggable={false}
      onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
    <div className="pfb-cover-title">{title}</div>
  </div>
));
CoverPage.displayName = 'CoverPage';

const BackPage = React.forwardRef<HTMLDivElement, { title: string }>(({ title }, ref) => (
  <div className="pfb-page pfb-back-page" ref={ref}>
    <div className="pfb-back-inner">
      <div className="bp-bc-end">The End</div>
      <div className="bp-bc-title">{title}</div>
      <div className="bp-bc-mark">📖 iStorybook</div>
    </div>
  </div>
));
BackPage.displayName = 'BackPage';

export function PageFlipBook({ storyId, pageCount, title }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [spread, setSpread] = useState(0);
  const bookRef = useRef<InstanceType<typeof HTMLFlipBook>>(null);
  const flipShadow = usePrefsStore((s) => s.prefs.flipShadow);
  const flipSpeed = usePrefsStore((s) => s.prefs.flipSpeed);
  const showCover = usePrefsStore((s) => s.prefs.showCover);

  const totalPages = 2 + 2 * pageCount;       // cover + N*(text+img) + back
  const totalSpreads = pageCount + 2;          // cover spread + N scene spreads + back spread

  const handleFlip = () => {
    const p = bookRef.current?.pageFlip().getCurrentPageIndex() ?? 0;
    const s = p === 0 ? 0 : p >= totalPages - 1 ? totalSpreads - 1 : Math.ceil(p / 2);
    setSpread(s);
  };

  const jumpToSpread = (d: number) => {
    const page = d === 0 ? 0 : d >= totalSpreads - 1 ? totalPages - 1 : 2 * d - 1;
    bookRef.current?.pageFlip().flip(page, 'bottom');
  };

  useEffect(() => {
    fetch(`/api/stories/${storyId}`)
      .then((r) => r.json())
      .then((d) => setScenes(d?.story?.scenes || []))
      .catch(() => {});
  }, [storyId]);

  // Match BookFlip dimensions: min(88vw,760px) wide × min(56vh,440px) tall → per-page 380×440
  const PAGE_W = 380;
  const PAGE_H = 440;

  return (
    <div className="pfb-root">
      {/* @ts-expect-error react-pageflip uses loose prop types */}
      <HTMLFlipBook
        ref={bookRef}
        width={PAGE_W}
        height={PAGE_H}
        size="fixed"
        showCover={showCover}
        drawShadow={flipShadow}
        flippingTime={flipSpeed}
        usePortrait={false}
        startZIndex={0}
        maxShadowOpacity={0.5}
        mobileScrollSupport
        onFlip={handleFlip}
        className="pfb-book"
      >
        {/* [0] Front cover */}
        <CoverPage src={`/api/stories/${storyId}/cover`} title={title} />

        {/* [1..2N] Scene pages (text, image alternating) */}
        {Array.from({ length: pageCount }).flatMap((_, i) => [
          <TextPage key={`text-${i}`} num={i + 1} sc={scenes[i]} />,
          <ImagePage
            key={`img-${i}`}
            src={`/api/stories/${storyId}/page/${i + 1}`}
            alt={scenes[i]?.title || `Page ${i + 1}`}
          />,
        ])}

        {/* [last] Back cover */}
        <BackPage title={title} />
      </HTMLFlipBook>

      <div className="bf-footer">
        <span className="bf-hint">← drag the right page to turn →</span>
        <div className="bf-dots">
          {Array.from({ length: totalSpreads }).map((_, d) => (
            <button key={d} className={`bf-dot${spread === d ? ' on' : ''}`} onClick={() => jumpToSpread(d)} aria-label={`Go to spread ${d}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * LivePageFlipBook — page-flip reader for the LIVE generated story in My Story tab.
 * Data comes from story-store (in-memory b64). Only shown after phase='done'.
 */
import React, { useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { useStoryStore } from '../../store/story-store';
import { usePrefsStore } from '../../store/prefs-store';

interface Scene { title?: string; narration?: string; says?: string; thinks?: string }

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

const B64Page = React.forwardRef<HTMLDivElement, { b64: string; alt: string }>(({ b64, alt }, ref) => (
  <div className="pfb-page pfb-image-page" ref={ref}>
    {b64
      ? <img src={`data:image/png;base64,${b64}`} alt={alt} draggable={false} />
      : <div className="pfb-img-placeholder">🎨</div>
    }
  </div>
));
B64Page.displayName = 'B64Page';

const CoverPage = React.forwardRef<HTMLDivElement, { b64: string; title: string }>(({ b64, title }, ref) => (
  <div className="pfb-page pfb-cover-page" ref={ref}>
    {b64
      ? <img src={`data:image/png;base64,${b64}`} alt={title} draggable={false} />
      : <div className="pfb-img-placeholder">📖</div>
    }
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

export function LivePageFlipBook() {
  const { story, cover, pages } = useStoryStore();
  const [spread, setSpread] = useState(0);
  const bookRef = useRef<InstanceType<typeof HTMLFlipBook>>(null);
  const flipShadow = usePrefsStore((s) => s.prefs.flipShadow);
  const flipSpeed = usePrefsStore((s) => s.prefs.flipSpeed);
  const showCover = usePrefsStore((s) => s.prefs.showCover);

  if (!story) return null;

  // Match BookFlip dimensions: min(88vw,760px) wide × min(56vh,440px) tall → per-page 380×440
  const PAGE_W = 380;
  const PAGE_H = 440;
  const pageCount = story.scenes.length;
  const totalPages = 2 + 2 * pageCount;
  const totalSpreads = pageCount + 2;

  const handleFlip = () => {
    const p = bookRef.current?.pageFlip().getCurrentPageIndex() ?? 0;
    const s = p === 0 ? 0 : p >= totalPages - 1 ? totalSpreads - 1 : Math.ceil(p / 2);
    setSpread(s);
  };

  const jumpToSpread = (d: number) => {
    const page = d === 0 ? 0 : d >= totalSpreads - 1 ? totalPages - 1 : 2 * d - 1;
    bookRef.current?.pageFlip().flip(page, 'bottom');
  };

  return (
    <div className="pfb-root">
      {/* @ts-expect-error react-pageflip loose types */}
      <HTMLFlipBook
        ref={bookRef}
        width={PAGE_W}
        height={PAGE_H}
        size="fixed"
        showCover={showCover}
        drawShadow={flipShadow}
        flippingTime={flipSpeed}
        usePortrait={false}
        maxShadowOpacity={0.5}
        mobileScrollSupport
        className="pfb-book"
      >
        <CoverPage b64={cover || ''} title={story.title} />
        {story.scenes.flatMap((sc, i) => [
          <TextPage key={`t${i}`} num={i + 1} sc={sc} />,
          <B64Page key={`p${i}`} b64={pages[i]?.image_b64 || ''} alt={sc.title || `Page ${i + 1}`} />,
        ])}
        <BackPage title={story.title} />
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

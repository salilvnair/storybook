/**
 * PdfPageViewer — Real Preview mode. Renders the ACTUAL generated PDF (via
 * pdfjs-dist) inside the shared FlipBook (react-pageflip) — same physical
 * page-turn as every other reader. Reader mode ('pageflip' curl | 'classic' 3D)
 * only changes interior page density.
 *
 * PDF layout from the server:
 *   page 1 : cover   — square (H×H)
 *   pages 2..N+1 : interior spreads — landscape (2H×H), left=text card, right=art
 * Each landscape page is split into left/right halves → two FlipPages. The back
 * cover is synthesised in JSX (the PDF has no back-cover page).
 */
import { useEffect, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { usePrefsStore } from '../../store/prefs-store';
import { FlipBook, FlipPage, interiorDensity } from './FlipBook';

const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString();

const SCALE = 2;

interface Props { storyId: string; pageCount: number; title: string }
interface Spread { left: string | null; right: string | null }

/**
 * Module-level cache of rendered spreads, keyed by storyId. Rendering the PDF
 * to canvases is expensive (pdfjs at SCALE 2), so once a book is rendered we keep
 * the data-URL spreads in memory — reopening Real Preview is then instant instead
 * of re-rendering every time. Cleared only on a hard reload.
 */
const spreadCache = new Map<string, Spread[]>();
/** Invalidate a story's cached preview (call after regenerate / PDF rebuild). */
export function invalidatePdfPreview(storyId: string) { spreadCache.delete(storyId); }

async function renderPdfPage(doc: pdfjs.PDFDocumentProxy, pageNum: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise;
  return canvas;
}

function splitCanvas(canvas: HTMLCanvasElement): [string, string] {
  const halfW = Math.floor(canvas.width / 2);
  const h = canvas.height;
  const left = document.createElement('canvas');
  left.width = halfW; left.height = h;
  left.getContext('2d')!.drawImage(canvas, 0, 0, halfW, h, 0, 0, halfW, h);
  const right = document.createElement('canvas');
  right.width = halfW; right.height = h;
  right.getContext('2d')!.drawImage(canvas, halfW, 0, halfW, h, 0, 0, halfW, h);
  return [left.toDataURL('image/png'), right.toDataURL('image/png')];
}

export function PdfPageViewer({ storyId, pageCount, title }: Props) {
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(false);
  const readerMode = usePrefsStore((s) => s.prefs.readerMode);
  const density = interiorDensity(readerMode);

  useEffect(() => {
    let cancelled = false;
    setError(false);

    const cached = spreadCache.get(storyId);
    if (cached) {
      setSpreads(cached);
      setLoading(false);
      setProgress({ done: cached.length, total: cached.length });
      return () => { cancelled = true; };
    }

    setLoading(true);
    setProgress({ done: 0, total: 0 });
    setSpreads([]);

    (async () => {
      try {
        const resp = await fetch(`/api/stories/${storyId}/pdf`);
        if (!resp.ok) throw new Error('PDF not found');
        const buffer = await resp.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setProgress({ done: 0, total: doc.numPages });

        const result: Spread[] = [];
        // Spread 0 — cover (PDF page 1, square)
        const coverCanvas = await renderPdfPage(doc, 1);
        result.push({ left: null, right: coverCanvas.toDataURL('image/png') });
        if (!cancelled) setProgress({ done: 1, total: doc.numPages });

        // Spreads 1..N — interior scenes (PDF pages 2..N+1, landscape 2:1)
        for (let p = 2; p <= doc.numPages; p++) {
          if (cancelled) return;
          const canvas = await renderPdfPage(doc, p);
          const [leftSrc, rightSrc] = splitCanvas(canvas);
          result.push({ left: leftSrc, right: rightSrc });
          if (!cancelled) setProgress({ done: p, total: doc.numPages });
        }

        if (!cancelled) {
          spreadCache.set(storyId, result);
          setSpreads(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [storyId]);

  if (loading) {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="bf-stage pdfv-status">
        <div className="pdfv-loader">
          <div className="sk-spinner pdfv-spinner" />
          <div className="pdfv-loader-label">Rendering PDF pages…</div>
          <div className="pdfv-progress-track">
            <div className="pdfv-progress-fill" style={{ width: `${Math.max(6, pct)}%` }} />
          </div>
          <div className="pdfv-loader-sub">
            {progress.total > 0 ? `Page ${progress.done} of ${progress.total} · ${pct}%` : 'Loading document…'}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bf-stage pdfv-status">
        <div className="pdfv-loader">
          <div className="pdfv-loader-label">PDF not available yet — generate the story first.</div>
        </div>
      </div>
    );
  }

  // spreads[0] = cover; spreads[1..N] = interior. Interior page count for FlipBook.
  const interior = spreads.slice(1);
  const fit = { width: '100%', height: '100%', objectFit: 'fill' as const };

  return (
    <div className="bf-stage">
      <FlipBook key={`pdf-${storyId}-${readerMode}`} pageCount={interior.length}>
        <FlipPage className="pfb-cover-page" density="hard">
          <div className="bp-art" style={{ padding: 0 }}>
            {spreads[0]?.right && <img src={spreads[0].right} alt={title} draggable={false} style={fit} />}
          </div>
        </FlipPage>

        {interior.flatMap((sp, i) => [
          <FlipPage key={`l-${i}`} className="pfb-text-page" density={density}>
            <div className="bp-art" style={{ padding: 0 }}>
              {sp.left && <img src={sp.left} alt={`Page ${i + 1} text`} draggable={false} style={fit} />}
            </div>
          </FlipPage>,
          <FlipPage key={`r-${i}`} className="pfb-image-page" density={density}>
            <div className="bp-art" style={{ padding: 0 }}>
              {sp.right && <img src={sp.right} alt={`Page ${i + 1}`} draggable={false} style={fit} />}
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
    </div>
  );
}

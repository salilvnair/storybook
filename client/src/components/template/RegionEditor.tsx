/**
 * RegionEditor — drag/resize the text card within the text page (S8.04). The card
 * position/size is stored as 0–1 fractions in spec.cardRect, honoured by the live
 * schematic and the PDF renderer. Drag the card body to move it; drag the corner
 * handle to resize.
 */
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { useTemplateStore, DEFAULT_CARD_RECT, type CardRect } from '../../store/template-store';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function RegionEditor() {
  const spec = useTemplateStore((s) => s.spec);
  const setSpec = useTemplateStore((s) => s.setSpec);
  const rect = spec.cardRect || DEFAULT_CARD_RECT;
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; orig: CardRect } | null>(null);

  const start = (mode: 'move' | 'resize') => (e: RPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: rect };
  };
  const move = (e: RPointerEvent) => {
    if (!drag.current || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.sx) / box.width;
    const dy = (e.clientY - drag.current.sy) / box.height;
    const o = drag.current.orig;
    const next: CardRect = drag.current.mode === 'move'
      ? { ...o, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) }
      : { ...o, w: clamp(o.w + dx, 0.2, 1 - o.x), h: clamp(o.h + dy, 0.15, 1 - o.y) };
    setSpec({ cardRect: next });
  };
  const end = (e: RPointerEvent) => {
    drag.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  };

  return (
    <div className="re-wrap">
      <div className="re-label">Drag the card to move it · drag the corner to resize</div>
      <div className="re-stage">
        {/* text page (square) */}
        <div
          ref={boxRef}
          className="re-page"
          style={{ background: spec.palette?.[0] || '#FCD653' }}
          onPointerMove={move}
          onPointerUp={end}
        >
          {spec.glow && <div className="re-glow" />}
          <div
            className="re-card"
            style={{
              left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
              background: spec.cardColor, borderColor: spec.frameColor,
            }}
            onPointerDown={start('move')}
          >
            <span className="re-line" style={{ background: spec.inkColor, width: '70%' }} />
            <span className="re-line" style={{ background: spec.inkColor, width: '54%' }} />
            <span className="re-line" style={{ background: spec.emphasisColor, width: '44%' }} />
            <div className="re-handle" onPointerDown={start('resize')} title="Resize" />
          </div>
        </div>
        {/* image page (visual only) */}
        <div className="re-image">🖼️</div>
      </div>
      <button className="tb-reset" onClick={() => setSpec({ cardRect: DEFAULT_CARD_RECT })}>↺ Reset card position</button>
    </div>
  );
}

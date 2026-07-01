/**
 * AIEditPanel (S-E4/E6/E9/E10) — Designer-style 3-panel AI image edit studio.
 *
 * Left  — brush tools (Paint / Protect / Erase), size slider, Auto-Protect, Undo
 * Center — zoomable canvas with paint + protect overlays
 * Right  — engine info, instruction input, seed, edit history, Apply
 *
 * Auto-Protect: one-click paints red over every pixel NOT already painted white —
 * so the user paints only what they want edited and clicks Auto-Protect to lock
 * everything else automatically.
 *
 * Brush modes
 *   Paint   — white strokes = edit here (sent to engine)
 *   Protect — red strokes  = never touch (subtracted from mask in exportMask)
 *   Erase   — removes both paint & protect strokes simultaneously
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ButtonView, TextInputView, SliderView, ChipView } from '@salilvnair/dui';
import { useEditEngineStore } from '../../store/edit-engine-store';
import {
  CloseIcon, PencilIcon, LockIcon, EraserIcon, TrashIcon,
  ExpandIcon, ShieldIcon, UndoIcon, EyeIcon, ZoomInIcon, ZoomOutIcon,
} from '../../icons';

type BrushMode = 'paint' | 'protect' | 'erase';
interface EditMsg { instruction: string; prompt?: string; stub?: boolean; seed?: number }
interface Props {
  imageSrc: string;
  currentPrompt?: string;
  onApply: (newImageB64: string) => void;
  onClose?: () => void;
  title?: string;
  maxW?: number;
  maxH?: number;
}

const MAX = 540; // fallback when no stage size provided
const ZOOM_STEP = 0.15;

export function AIEditPanel({ imageSrc, currentPrompt, onApply, onClose, title = 'AI Edit', maxW = MAX, maxH = MAX }: Props) {
  const imgRef     = useRef<HTMLCanvasElement>(null);
  const maskRef    = useRef<HTMLCanvasElement>(null);
  const protectRef = useRef<HTMLCanvasElement>(null);
  const origRef    = useRef<HTMLCanvasElement>(null);

  const [dim, setDim]           = useState({ w: maxW, h: maxH });
  const [zoom, setZoom]         = useState(1);
  const [brush, setBrush]       = useState(32);
  const [brushMode, setBrushMode] = useState<BrushMode>('paint');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy]         = useState(false);
  const [history, setHistory]   = useState<EditMsg[]>([]);
  const [hasMask, setHasMask]   = useState(false);
  const [hasProtect, setHasProtect] = useState(false);
  const [seed, setSeed]         = useState('');
  const [comparing, setComparing] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const drawing      = useRef(false);
  const [displaySrc, setDisplaySrc] = useState(imageSrc);
  const origCaptured = useRef(false);

  const engineMeta   = useEditEngineStore((s) => s.current());
  const isWholeImage = !!engineMeta?.wholeImageEdit;

  // Load image into canvases
  useEffect(() => {
    let cancelled = false;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      if (cancelled) return;
      const scale = Math.min(maxW / im.width, maxH / im.height, 1);
      const w = Math.round(im.width * scale), h = Math.round(im.height * scale);
      setDim({ w, h });
      const ic = imgRef.current, mc = maskRef.current, pc = protectRef.current, oc = origRef.current;
      if (ic) { ic.width = w; ic.height = h; ic.getContext('2d')!.drawImage(im, 0, 0, w, h); }
      if (mc) { mc.width = w; mc.height = h; mc.getContext('2d')!.clearRect(0, 0, w, h); }
      if (pc) { pc.width = w; pc.height = h; pc.getContext('2d')!.clearRect(0, 0, w, h); }
      if (oc && !origCaptured.current) { oc.width = w; oc.height = h; oc.getContext('2d')!.drawImage(im, 0, 0, w, h); origCaptured.current = true; }
      setHasMask(false); setHasProtect(false);
    };
    im.src = displaySrc;
    return () => { cancelled = true; };
  }, [displaySrc]);

  const paintAt = useCallback((x: number, y: number) => {
    if (brushMode === 'protect') {
      const pc = protectRef.current; if (!pc) return;
      const ctx = pc.getContext('2d')!;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(239,68,68,0.55)';
      ctx.beginPath(); ctx.arc(x, y, brush / 2, 0, Math.PI * 2); ctx.fill();
      setHasProtect(true);
    } else if (brushMode === 'erase') {
      [maskRef, protectRef].forEach((ref) => {
        const c = ref.current; if (!c) return;
        const ctx = c.getContext('2d')!;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath(); ctx.arc(x, y, brush / 2, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      const mc = maskRef.current; if (!mc) return;
      const ctx = mc.getContext('2d')!;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, brush / 2, 0, Math.PI * 2); ctx.fill();
      setHasMask(true);
    }
  }, [brush, brushMode]);

  const evtXY = (e: React.PointerEvent) => {
    const r = maskRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (dim.w / r.width), y: (e.clientY - r.top) * (dim.h / r.height) };
  };

  const clearMask = () => {
    [maskRef, protectRef].forEach((ref) => {
      const c = ref.current; if (c) c.getContext('2d')!.clearRect(0, 0, dim.w, dim.h);
    });
    setHasMask(false); setHasProtect(false);
  };

  const selectAll = () => {
    const mc = maskRef.current; if (!mc) return;
    const ctx = mc.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim.w, dim.h);
    setHasMask(true);
  };

  /** One-click: protect everything NOT already painted white. */
  const autoProtectRest = () => {
    const mc = maskRef.current, pc = protectRef.current;
    if (!mc || !pc) return;
    const mCtx = mc.getContext('2d')!;
    const pCtx = pc.getContext('2d')!;
    const mData = mCtx.getImageData(0, 0, dim.w, dim.h);
    pCtx.clearRect(0, 0, dim.w, dim.h);
    const pOut = pCtx.createImageData(dim.w, dim.h);
    for (let i = 0; i < mData.data.length; i += 4) {
      if (mData.data[i + 3] < 10) { // unpainted in edit mask → protect it
        pOut.data[i] = 239; pOut.data[i + 1] = 68; pOut.data[i + 2] = 68; pOut.data[i + 3] = 130;
      }
    }
    pCtx.putImageData(pOut, 0, 0);
    setHasProtect(true);
  };

  /** Merged mask: white = edit, protected areas forced black. */
  const exportMask = (): string => {
    const out = document.createElement('canvas'); out.width = dim.w; out.height = dim.h;
    const c = out.getContext('2d')!;
    c.fillStyle = '#000'; c.fillRect(0, 0, dim.w, dim.h);
    if (maskRef.current) c.drawImage(maskRef.current, 0, 0);
    if (protectRef.current && hasProtect) {
      const pCtx = protectRef.current.getContext('2d')!;
      const pData = pCtx.getImageData(0, 0, dim.w, dim.h);
      const outData = c.getImageData(0, 0, dim.w, dim.h);
      for (let i = 0; i < pData.data.length; i += 4) {
        if (pData.data[i + 3] > 10) {
          outData.data[i] = 0; outData.data[i + 1] = 0; outData.data[i + 2] = 0; outData.data[i + 3] = 255;
        }
      }
      c.putImageData(outData, 0, 0);
    }
    return out.toDataURL('image/png').split(',')[1];
  };
  const exportImage = (): string => imgRef.current!.toDataURL('image/png').split(',')[1];

  const apply = async () => {
    if (!instruction.trim()) return;
    setBusy(true);
    const before = exportImage();
    const seedNum = seed.trim() === '' ? undefined : Number(seed.trim());
    try {
      const res = await fetch('/api/storybook/edit-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_b64: before,
          mask_b64: (hasMask || hasProtect) ? exportMask() : null,
          instruction: instruction.trim(), currentPrompt,
          ...(seedNum != null && !Number.isNaN(seedNum) ? { override: { options: { seed: seedNum } } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setHistory((h) => [...h, { instruction: instruction.trim(), prompt: data.prompt, stub: data.stub, seed: data.seed }]);
      if (data.seed != null && seed.trim() === '') setSeed(String(data.seed));
      let resultB64: string = data.image_b64;
      if (data.stub && hasMask) {
        const cv = document.createElement('canvas'); cv.width = dim.w; cv.height = dim.h;
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(imgRef.current!, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.45; ctx.fillStyle = '#7c3aed';
        ctx.drawImage(maskRef.current!, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        resultB64 = cv.toDataURL('image/png').split(',')[1];
      }
      setUndoStack((s) => [...s, before]);
      setDisplaySrc(`data:image/png;base64,${resultB64}`);
      onApply(resultB64);
      setInstruction('');
      clearMask();
    } catch (err) {
      setHistory((h) => [...h, { instruction: `⚠ ${err instanceof Error ? err.message : String(err)}` }]);
    } finally { setBusy(false); }
  };

  const undo = () => {
    if (!undoStack.length || busy) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setDisplaySrc(`data:image/png;base64,${prev}`);
    onApply(prev);
    clearMask();
  };

  // Brush mode tool button
  const modeTool = (mode: BrushMode, Icon: React.ComponentType<{ size?: number }>, label: string) => {
    const active = brushMode === mode;
    const accent = mode === 'protect' ? '#ef4444' : mode === 'erase' ? '#6b7280' : 'var(--story-accent-3)';
    return (
      <button
        className={`aie-tool-btn${active ? ' active' : ''}`}
        style={active ? { borderColor: accent, color: accent, background: `color-mix(in srgb,${accent} 14%,transparent)` } : undefined}
        onClick={() => setBrushMode(mode)}
        title={label}
      >
        <Icon size={15} />
        <span>{label}</span>
      </button>
    );
  };

  // Zoom helpers
  const zoomIn  = () => setZoom((z) => Math.min(3, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(0.25, parseFloat((z - ZOOM_STEP).toFixed(2))));

  // canvas scroll area needs extra space for the zoomed stage
  const padH = Math.max(0, (dim.h * (zoom - 1)) / 2) + 24;
  const padW = Math.max(0, (dim.w * (zoom - 1)) / 2) + 24;

  return (
    <div className="aie-root">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="aie-header">
        <span className="aie-title">{title}</span>
        <div className="aie-header-right">
          {engineMeta && <ChipView size="xs" color={engineMeta.accent} label={engineMeta.label} />}
          {onClose && (
            <button className="aie-close" onClick={onClose} aria-label="Close">
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Whole-image warning ─────────────────────────────────── */}
      {isWholeImage && (
        <div className="aie-warn">
          <ShieldIcon size={13} />
          <span><b>{engineMeta?.label}</b> rewrites the whole image — mask ignored. Switch to <b>FLUX.1-Fill</b> or <b>GPT Image 1</b> for precise region edits.</span>
        </div>
      )}

      {/* ── Body: Left | Center | Right ─────────────────────────── */}
      <div className="aie-body">

        {/* LEFT PANEL — tools */}
        <div className="aie-left">
          <div className="aie-section-label">Brush Mode</div>
          <div className="aie-tools-col">
            {modeTool('paint',   PencilIcon, 'Paint')}
            {modeTool('protect', LockIcon,   'Protect')}
            {modeTool('erase',   EraserIcon, 'Erase')}
          </div>

          <div className="aie-divider" />

          <div className="aie-section-label">Size</div>
          <div className="aie-brush-size-row">
            <SliderView size="sm" min={4} max={120} step={1} value={brush} onChange={(v) => setBrush(Number(v))} />
            <span className="aie-size-val">{brush}px</span>
          </div>

          <div className="aie-divider" />

          <div className="aie-section-label">Selection</div>
          <div className="aie-tools-col">
            <button className="aie-tool-btn" onClick={selectAll} title="Paint entire image white (edit everywhere)">
              <ExpandIcon size={15} /><span>Whole image</span>
            </button>
            <button
              className="aie-tool-btn aie-tool-protect-btn"
              onClick={autoProtectRest}
              disabled={!hasMask}
              title="Auto-protect everything you haven't painted — one click locks the rest"
            >
              <ShieldIcon size={15} /><span>Auto-protect rest</span>
            </button>
            <button className="aie-tool-btn" onClick={clearMask} disabled={!hasMask && !hasProtect} title="Clear all paint and protect strokes">
              <TrashIcon size={15} /><span>Clear all</span>
            </button>
          </div>

          <div className="aie-divider" />

          <div className="aie-section-label">History</div>
          <div className="aie-tools-col">
            <button className="aie-tool-btn" onClick={undo} disabled={!undoStack.length || busy} title="Undo last edit">
              <UndoIcon size={15} />
              <span>Undo{undoStack.length ? ` (${undoStack.length})` : ''}</span>
            </button>
            <button
              className={`aie-tool-btn${comparing ? ' active' : ''}`}
              style={comparing ? { borderColor: 'var(--story-accent)', color: 'var(--story-accent)', background: 'color-mix(in srgb,var(--story-accent) 14%,transparent)' } : undefined}
              disabled={!undoStack.length}
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              title="Hold to compare with original"
            >
              <EyeIcon size={15} /><span>Before/After</span>
            </button>
          </div>

          {/* Mask status */}
          {(hasMask || hasProtect) && (
            <div className="aie-mask-status">
              {hasMask   && <span className="aie-ms-paint">Paint</span>}
              {hasProtect && <span className="aie-ms-protect">Protected</span>}
            </div>
          )}
        </div>

        {/* CENTER PANEL — canvas */}
        <div className="aie-center">
          <div className="aie-canvas-scroll">
            <div className="aie-canvas-pad" style={{ paddingTop: padH, paddingBottom: padH, paddingLeft: padW, paddingRight: padW }}>
              <div
                className="aie-stage"
                style={{ width: dim.w, height: dim.h, transform: `scale(${zoom})`, transformOrigin: 'center center', borderRadius: 10, overflow: 'hidden' }}
              >
                <canvas ref={imgRef}     className="aie-cv"         style={{ visibility: comparing ? 'hidden' : 'visible' }} />
                <canvas ref={origRef}    className="aie-cv aie-orig" style={{ visibility: comparing ? 'visible' : 'hidden' }} />
                {comparing && <div className="aie-compare-badge">Original</div>}
                <canvas ref={protectRef} className="aie-cv aie-protect" />
                <canvas
                  ref={maskRef}
                  className={`aie-cv aie-mask${brushMode === 'protect' ? ' is-protect' : brushMode === 'erase' ? ' is-erase' : ''}`}
                  style={{ visibility: comparing ? 'hidden' : 'visible' }}
                  onPointerDown={(e) => { drawing.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = evtXY(e); paintAt(p.x, p.y); }}
                  onPointerMove={(e) => { if (drawing.current) { const p = evtXY(e); paintAt(p.x, p.y); } }}
                  onPointerUp={() => { drawing.current = false; }}
                />
              </div>
            </div>
          </div>

          {/* Zoom bar */}
          <div className="aie-zoombar">
            <button className="aie-zoom-btn" onClick={zoomOut} title="Zoom out"><ZoomOutIcon size={14} /></button>
            <SliderView size="sm" min={0.25} max={3} step={0.05} value={zoom} onChange={(v) => setZoom(Number(v))} />
            <span className="aie-zoom-pct">{Math.round(zoom * 100)}%</span>
            <button className="aie-zoom-btn" onClick={zoomIn} title="Zoom in"><ZoomInIcon size={14} /></button>
            <button className="aie-zoom-btn" onClick={() => setZoom(1)} title="Reset zoom" style={{ fontSize: 10, padding: '0 6px', minWidth: 32 }}>1:1</button>
          </div>
        </div>

        {/* RIGHT PANEL — instruction & history */}
        <div className="aie-right">
          {isWholeImage ? null : (
            <div className="aie-right-hint">
              {hasMask && hasProtect  && <><span className="aie-dot-paint" />Paint · <span className="aie-dot-protect" />Protected</>}
              {hasMask && !hasProtect && <><span className="aie-dot-paint" />Painted region will be edited</>}
              {!hasMask && hasProtect && <><span className="aie-dot-protect" />Protected regions locked</>}
              {!hasMask && !hasProtect && <span style={{ opacity: 0.4 }}>Paint a region or use Whole Image</span>}
            </div>
          )}

          <div className="aie-section-label">Instruction</div>
          <TextInputView
            size="md"
            width="fw"
            value={instruction}
            placeholder={hasMask ? 'Describe the edit for painted area…' : 'Describe what to change…'}
            onChange={(e) => setInstruction((e.target as HTMLInputElement).value)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && !busy) void apply(); }}
          />
          <ButtonView
            size="md"
            accentColor="var(--story-accent-3)"
            disabled={!instruction.trim() || busy}
            loading={busy}
            onClick={() => void apply()}
          >Apply edit</ButtonView>

          <div className="aie-divider" />

          <div className="aie-section-label">Seed</div>
          <div className="aie-seed-row">
            <TextInputView
              size="sm"
              value={seed}
              placeholder="random"
              style={{ width: 96 }}
              onChange={(e) => setSeed((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))}
            />
            {seed && (
              <ButtonView size="sm" variant="secondary" onClick={() => setSeed('')}>Clear</ButtonView>
            )}
          </div>

          {history.length > 0 && (
            <>
              <div className="aie-divider" />
              <div className="aie-section-label">History</div>
              <div className="aie-log">
                {[...history].reverse().map((m, i) => (
                  <div key={i} className="aie-log-row">
                    <span className="aie-log-instruction">{m.instruction}</span>
                    {m.prompt && <span className="aie-log-prompt">{m.prompt}</span>}
                    <div className="aie-log-meta">
                      {m.stub && <span className="aie-log-chip aie-log-stub">stub</span>}
                      {m.seed != null && <span className="aie-log-chip">seed {m.seed}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

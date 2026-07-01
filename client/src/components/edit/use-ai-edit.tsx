/**
 * useAIEdit — AI image edit state + three panel JSX slots for the Designer inline mode.
 *
 * Returns leftPanel / centerPanel / rightPanel that slot directly into the Designer's
 * SplitPanelView using the same CSS containers (set-sidebar / ds-canvas-wrap / ds-right)
 * and the same section/group UI patterns (set-group-btn chevron badge, set-nav items).
 *
 * Canvas refs are callback-based so the draw effect fires correctly even when panels
 * mount after imageSrc is first set (Designer lazy-mounts panels on AI-mode entry).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ButtonView, TextInputView, SliderView, ChipView, SearchInputView } from '@salilvnair/dui';
import { useEditEngineStore } from '../../store/edit-engine-store';
import {
  PencilIcon, LockIcon, EraserIcon, TrashIcon,
  ExpandIcon, ShieldIcon, UndoIcon, EyeIcon, SearchIcon, ChevronRightIcon,
} from '../../icons';

type BrushMode = 'paint' | 'protect' | 'erase';
interface EditMsg { instruction: string; prompt?: string; stub?: boolean; seed?: number }
interface UseAIEditOpts {
  onApply: (b64: string) => void;
  currentPrompt?: string;
  stageW?: number;
  stageH?: number;
}

export function useAIEdit(imageSrc: string, opts: UseAIEditOpts) {
  const { onApply, currentPrompt, stageW = 700, stageH = 700 } = opts;

  // Canvas DOM refs — set via callback refs so we detect mount timing
  const imgRef     = useRef<HTMLCanvasElement | null>(null);
  const maskRef    = useRef<HTMLCanvasElement | null>(null);
  const protectRef = useRef<HTMLCanvasElement | null>(null);
  const origRef    = useRef<HTMLCanvasElement | null>(null);

  // canvasKey bumps whenever the img canvas mounts, re-triggering the draw effect
  const [canvasKey, setCanvasKey] = useState(0);
  const setImgCanvas = useCallback((node: HTMLCanvasElement | null) => {
    imgRef.current = node;
    if (node) setCanvasKey((k) => k + 1);
  }, []);

  const [dim,         setDim]         = useState({ w: stageW, h: stageH });
  const [aiZoom,      setAiZoom]      = useState(1);
  const [brush,       setBrush]       = useState(32);
  const [brushMode,   setBrushMode]   = useState<BrushMode>('paint');
  const [instruction, setInstruction] = useState('');
  const [busy,        setBusy]        = useState(false);
  const [history,     setHistory]     = useState<EditMsg[]>([]);
  const [hasMask,     setHasMask]     = useState(false);
  const [hasProtect,  setHasProtect]  = useState(false);
  const [seed,        setSeed]        = useState('');
  const [comparing,   setComparing]   = useState(false);
  const [undoStack,   setUndoStack]   = useState<string[]>([]);
  const [displaySrc,  setDisplaySrc]  = useState(imageSrc);
  const drawing      = useRef(false);
  const origCaptured = useRef(false);

  // Left panel collapsible sections state
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [aiSearch,  setAiSearch]  = useState('');
  const toggleSection = (id: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const engineMeta   = useEditEngineStore((s) => s.current());
  const isWholeImage = !!engineMeta?.wholeImageEdit;

  // Sync displaySrc when imageSrc changes
  useEffect(() => {
    setDisplaySrc(imageSrc);
    origCaptured.current = false;
  }, [imageSrc]);

  // Draw image onto canvases. Re-runs when displaySrc changes OR when canvas mounts (canvasKey).
  useEffect(() => {
    if (!displaySrc || !imgRef.current) return;
    let cancelled = false;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      if (cancelled) return;
      const scale = Math.min(stageW / im.width, stageH / im.height, 1);
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
  }, [displaySrc, canvasKey]);

  // ── Brush ────────────────────────────────────────────────────────────────────

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

  const autoProtectRest = () => {
    const mc = maskRef.current, pc = protectRef.current; if (!mc || !pc) return;
    const mCtx = mc.getContext('2d')!, pCtx = pc.getContext('2d')!;
    const mData = mCtx.getImageData(0, 0, dim.w, dim.h);
    pCtx.clearRect(0, 0, dim.w, dim.h);
    const pOut = pCtx.createImageData(dim.w, dim.h);
    for (let i = 0; i < mData.data.length; i += 4) {
      if (mData.data[i + 3] < 10) {
        pOut.data[i] = 239; pOut.data[i + 1] = 68; pOut.data[i + 2] = 68; pOut.data[i + 3] = 130;
      }
    }
    pCtx.putImageData(pOut, 0, 0); setHasProtect(true);
  };

  const exportMask = (): string => {
    const out = document.createElement('canvas'); out.width = dim.w; out.height = dim.h;
    const c = out.getContext('2d')!;
    c.fillStyle = '#000'; c.fillRect(0, 0, dim.w, dim.h);
    if (maskRef.current) c.drawImage(maskRef.current, 0, 0);
    if (protectRef.current && hasProtect) {
      const pData = protectRef.current.getContext('2d')!.getImageData(0, 0, dim.w, dim.h);
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
      setHistory((h) => [...h, { instruction: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
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

  const padH = Math.max(0, (dim.h * (aiZoom - 1)) / 2);
  const padW = Math.max(0, (dim.w * (aiZoom - 1)) / 2);

  // ── Palette section data ─────────────────────────────────────────────────────
  // Each section mirrors the Manual palette's set-group-btn + set-nav structure.

  const BRUSH_ACCENT: Record<BrushMode, string> = {
    paint:   'var(--story-accent-3)',
    protect: '#ef4444',
    erase:   'var(--color-text-muted)',
  };

  interface PaletteItem {
    key: string;
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    onPointerDown?: () => void;
    onPointerUp?: () => void;
    onPointerLeave?: () => void;
    active?: boolean;
    disabled?: boolean;
    accent?: string;
  }

  interface PaletteSection {
    id: string;
    label: string;
    items: PaletteItem[];
    extra?: React.ReactNode; // rendered below items (e.g. slider)
  }

  const sections: PaletteSection[] = [
    {
      id: 'brush',
      label: 'Brush Mode',
      items: [
        { key: 'paint',   icon: <PencilIcon size={14} />, label: 'Paint',   onClick: () => setBrushMode('paint'),   active: brushMode === 'paint',   accent: BRUSH_ACCENT.paint },
        { key: 'protect', icon: <LockIcon   size={14} />, label: 'Protect', onClick: () => setBrushMode('protect'), active: brushMode === 'protect', accent: BRUSH_ACCENT.protect },
        { key: 'erase',   icon: <EraserIcon size={14} />, label: 'Erase',   onClick: () => setBrushMode('erase'),   active: brushMode === 'erase',   accent: BRUSH_ACCENT.erase },
      ],
      extra: (
        <div style={{ padding: '4px 12px 8px 22px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SliderView size="sm" min={4} max={120} step={1} value={brush} onChange={(v) => setBrush(Number(v))} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 34, flexShrink: 0 }}>{brush}px</span>
        </div>
      ),
    },
    {
      id: 'selection',
      label: 'Selection',
      items: [
        { key: 'whole',   icon: <ExpandIcon size={14} />, label: 'Whole image',       onClick: selectAll },
        { key: 'protect', icon: <ShieldIcon size={14} />, label: 'Auto-protect rest', onClick: autoProtectRest, disabled: !hasMask },
        { key: 'clear',   icon: <TrashIcon  size={14} />, label: 'Clear all',         onClick: clearMask, disabled: !hasMask && !hasProtect },
      ],
    },
    {
      id: 'history',
      label: 'History',
      items: [
        { key: 'undo',    icon: <UndoIcon size={14} />, label: `Undo${undoStack.length ? ` (${undoStack.length})` : ''}`, onClick: undo, disabled: !undoStack.length || busy },
        {
          key: 'compare', icon: <EyeIcon size={14} />, label: 'Before/After',
          onPointerDown: () => setComparing(true),
          onPointerUp:   () => setComparing(false),
          onPointerLeave:() => setComparing(false),
          active: comparing, disabled: !undoStack.length,
          accent: 'var(--story-accent)',
        },
      ],
    },
  ];

  // Filter sections by search
  const q = aiSearch.toLowerCase();
  const filteredSections = q
    ? sections
        .map((s) => ({ ...s, items: s.items.filter((it) => it.label.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)) }))
        .filter((s) => s.items.length > 0)
    : sections;

  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);

  // ── LEFT panel ───────────────────────────────────────────────────────────────
  const leftPanel = (
    <aside className="set-sidebar ds-palette-v2">
      {/* Search box — identical to Manual mode */}
      <div className="set-search-wrap">
        <SearchInputView
          value={aiSearch}
          onChange={setAiSearch}
          placeholder="Search tools…"
          size="md"
          prefix={<SearchIcon size={13} />}
          suffix={!aiSearch && totalItems > 0
            ? <span className="set-search-count">{totalItems}</span>
            : undefined}
        />
      </div>

      {/* Engine chip */}
      {!aiSearch && engineMeta && (
        <div style={{ padding: '8px 12px 4px' }}>
          <ChipView size="xs" color={engineMeta.accent} label={engineMeta.label} />
        </div>
      )}

      {/* Sections — same pattern as Manual palette */}
      <div className="set-nav-list">
        {filteredSections.length === 0 && (
          <div className="set-nav-empty">No tools match "{aiSearch}"</div>
        )}
        {filteredSections.map((sec) => {
          const isCollapsed = collapsed.has(sec.id);
          return (
            <div key={sec.id}>
              <button type="button" className="set-group-btn" onClick={() => toggleSection(sec.id)}>
                <ChevronRightIcon
                  size={9}
                  style={{ flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.5,
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 140ms ease' }}
                />
                <span className="set-group-label">{sec.label}</span>
                <span className="set-group-count">{sec.items.length}</span>
              </button>
              {!isCollapsed && (
                <>
                  {sec.items.map((it) => (
                    <div key={it.key} className="ds-nav-row">
                      <button
                        type="button"
                        className={`set-nav ds-nav-add${it.active ? ' is-active' : ''}`}
                        style={it.active && it.accent ? { '--set-accent': it.accent } as React.CSSProperties : undefined}
                        disabled={it.disabled}
                        onClick={it.onClick}
                        onPointerDown={it.onPointerDown}
                        onPointerUp={it.onPointerUp}
                        onPointerLeave={it.onPointerLeave}
                      >
                        <span className="set-nav-icon">{it.icon}</span>
                        {it.label}
                      </button>
                    </div>
                  ))}
                  {sec.extra}
                </>
              )}
            </div>
          );
        })}

        {/* Mask status chips */}
        {(hasMask || hasProtect) && !aiSearch && (
          <div style={{ padding: '6px 12px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {hasMask    && <span className="aie-ms-paint">Paint</span>}
            {hasProtect && <span className="aie-ms-protect">Protected</span>}
          </div>
        )}
      </div>
    </aside>
  );

  // ── CENTER panel ─────────────────────────────────────────────────────────────
  const centerPanel = (
    <div className="ds-canvas-wrap">
      {/* Photoshop-style icon toolbar */}
      <div className="aie-top-toolbar">
        <button type="button" className={`aie-tbar-btn${brushMode === 'paint' ? ' is-active' : ''}`} title="Paint" onClick={() => setBrushMode('paint')}><PencilIcon size={15} /></button>
        <button type="button" className={`aie-tbar-btn${brushMode === 'protect' ? ' is-protect' : ''}`} title="Protect" onClick={() => setBrushMode('protect')}><LockIcon size={15} /></button>
        <button type="button" className={`aie-tbar-btn${brushMode === 'erase' ? ' is-erase' : ''}`} title="Erase" onClick={() => setBrushMode('erase')}><EraserIcon size={15} /></button>
        <div className="aie-tbar-div" />
        <button type="button" className="aie-tbar-btn" title="Whole image" onClick={selectAll}><ExpandIcon size={15} /></button>
        <button type="button" className="aie-tbar-btn" title="Auto-protect rest" onClick={autoProtectRest} disabled={!hasMask}><ShieldIcon size={15} /></button>
        <button type="button" className="aie-tbar-btn" title="Clear all" onClick={clearMask} disabled={!hasMask && !hasProtect}><TrashIcon size={15} /></button>
        <div className="aie-tbar-div" />
        <button type="button" className="aie-tbar-btn" title={`Undo${undoStack.length ? ` (${undoStack.length})` : ''}`} onClick={undo} disabled={!undoStack.length || busy}><UndoIcon size={15} /></button>
        <button
          type="button"
          className={`aie-tbar-btn${comparing ? ' is-active' : ''}`}
          title="Before/After (hold)"
          disabled={!undoStack.length}
          onPointerDown={() => setComparing(true)}
          onPointerUp={() => setComparing(false)}
          onPointerLeave={() => setComparing(false)}
        ><EyeIcon size={15} /></button>
      </div>
      <div className="ds-canvas-scroll">
        <div style={{ paddingTop: padH, paddingBottom: padH, paddingLeft: padW, paddingRight: padW }}>
          <div style={{ width: dim.w, height: dim.h, position: 'relative', transform: `scale(${aiZoom})`, transformOrigin: 'center center', borderRadius: 10, overflow: 'hidden' }}>
            <canvas ref={setImgCanvas} className="aie-cv" style={{ visibility: comparing ? 'hidden' : 'visible' }} />
            <canvas ref={(n) => { origRef.current = n; }} className="aie-cv aie-orig" style={{ visibility: comparing ? 'visible' : 'hidden' }} />
            {comparing && <div className="aie-compare-badge">Original</div>}
            <canvas ref={(n) => { protectRef.current = n; }} className="aie-cv aie-protect" />
            <canvas
              ref={(n) => { maskRef.current = n; }}
              className={`aie-cv aie-mask${brushMode === 'protect' ? ' is-protect' : brushMode === 'erase' ? ' is-erase' : ''}`}
              style={{ visibility: comparing ? 'hidden' : 'visible' }}
              onPointerDown={(e) => { drawing.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = evtXY(e); paintAt(p.x, p.y); }}
              onPointerMove={(e) => { if (drawing.current) { const p = evtXY(e); paintAt(p.x, p.y); } }}
              onPointerUp={() => { drawing.current = false; }}
            />
          </div>
        </div>
      </div>
      {/* Zoom bar — same structure and classes as Manual mode */}
      <div className="ds-zoombar">
        <span className="ds-canvas-status">
          {brushMode === 'paint' && 'Paint mode — brush to select edit region'}
          {brushMode === 'protect' && 'Protect mode — brush to lock region'}
          {brushMode === 'erase' && 'Erase mode — brush to remove strokes'}
        </span>
        <div className="ds-zoom-ctl">
          <button type="button" className="ds-zoom-btn" title="Zoom out" onClick={() => setAiZoom((z) => Math.max(0.25, +(z - 0.15).toFixed(2)))}>−</button>
          <div style={{ width: 130 }}>
            <SliderView size="sm" min={0.25} max={3} step={0.05} value={aiZoom} onChange={(v) => setAiZoom(Number(v))} />
          </div>
          <button type="button" className="ds-zoom-btn" title="Zoom in" onClick={() => setAiZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}>+</button>
          <button type="button" className="ds-zoom-pct" title="Reset to fit (100%)" onClick={() => setAiZoom(0.9)}>{Math.round(aiZoom / 0.9 * 100)}%</button>
        </div>
      </div>
    </div>
  );

  // ── RIGHT panel ──────────────────────────────────────────────────────────────
  const rightPanel = (
    <aside className="ds-right">
      <div className="ds-right-tabs">
        <div className="ds-right-tab ds-right-tab-active" style={{ cursor: 'default' }}>AI Edit</div>
      </div>
      <div className="ds-right-content">

        {!isWholeImage && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
            {hasMask && hasProtect   && 'Paint (edit) · Protected (locked)'}
            {hasMask && !hasProtect  && 'Painted region will be edited'}
            {!hasMask && hasProtect  && 'Protected locked — paint area to edit'}
            {!hasMask && !hasProtect && 'Paint a region or use Whole Image'}
          </div>
        )}

        <div className="ds-bg-label" style={{ marginBottom: 6 }}>Instruction</div>
        <TextInputView
          size="md" width="fw"
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
          style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
        >Apply edit</ButtonView>

        <div style={{ height: 14 }} />

        <div className="ds-bg-label" style={{ marginBottom: 6 }}>Seed</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <TextInputView
            size="sm" value={seed} placeholder="random"
            style={{ width: 88 }}
            onChange={(e) => setSeed((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))}
          />
          {seed && (
            <ButtonView size="sm" variant="ghost" onClick={() => setSeed('')}>Clear</ButtonView>
          )}
        </div>

        {history.length > 0 && (
          <>
            <div style={{ height: 14 }} />
            <div className="ds-bg-label" style={{ marginBottom: 6 }}>History</div>
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
    </aside>
  );

  return { leftPanel, centerPanel, rightPanel, isWholeImage, engineLabel: engineMeta?.label ?? null };
}

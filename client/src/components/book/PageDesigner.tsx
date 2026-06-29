/**
 * S25 — Free-form page designer.
 * Renders elements (text, bubble, sticker, shape) over the page image.
 * Drag to move · corner-handle to resize · inspector panel for style edits.
 * Undo/redo via local history stack.
 */
import React, { useRef, useState, useCallback, useEffect, type PointerEvent as RPE } from 'react';
import { usePageDesignStore, type PageElement, type ElementType, type BubbleTail } from '../../store/page-design-store';
import { useBrandKitStore, FONT_OPTIONS } from '../../store/brandkit-store';

const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props {
  storyId: string;
  pageIdx: number;
  imageSrc: string;   // base64 page image
  onClose: () => void;
}

interface DragState {
  mode: 'move' | 'resize';
  id: string;
  sx: number; sy: number;
  ox: number; oy: number; ow: number; oh: number;
}

const BUBBLE_TAILS: BubbleTail[] = ['none', 'bottom-left', 'bottom-right', 'top-left', 'top-right'];

const STICKER_LIST = ['⭐', '🌟', '💫', '🎉', '🎈', '🌈', '🦋', '🐾', '❤️', '🍀', '🌸', '🔥', '💎', '🌙', '☀️', '🏆'];

export function PageDesigner({ storyId, pageIdx, imageSrc, onClose }: Props) {
  const store = usePageDesignStore();
  const { kit } = useBrandKitStore();

  const design = store.getDesign(storyId, pageIdx);
  const elements = design.elements;

  // Local undo/redo history
  const [history, setHistory] = useState<PageElement[][]>([elements]);
  const [histIdx, setHistIdx] = useState(0);

  // Push a checkpoint to history
  const checkpoint = useCallback((els: PageElement[]) => {
    setHistory((h) => {
      const trimmed = h.slice(0, histIdx + 1);
      return [...trimmed, els];
    });
    setHistIdx((i) => i + 1);
    store.setDesign(storyId, pageIdx, { elements: els });
  }, [histIdx, store, storyId, pageIdx]);

  const undo = () => {
    if (histIdx <= 0) return;
    const ni = histIdx - 1;
    setHistIdx(ni);
    store.setDesign(storyId, pageIdx, { elements: history[ni] });
  };

  const redo = () => {
    if (histIdx >= history.length - 1) return;
    const ni = histIdx + 1;
    setHistIdx(ni);
    store.setDesign(storyId, pageIdx, { elements: history[ni] });
  };

  // Keep local history in sync when elements change externally
  const prevEls = useRef(elements);
  useEffect(() => {
    if (prevEls.current !== elements) prevEls.current = elements;
  }, [elements]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const selectedEl = elements.find((e) => e.id === selectedId) ?? null;

  const addElement = (type: ElementType, extra?: Partial<PageElement>) => {
    const nextZ = (elements[elements.length - 1]?.z ?? 0) + 1;
    const el: PageElement = {
      id: uid(),
      type,
      x: 0.2, y: 0.2, w: 0.4, h: 0.15,
      z: nextZ,
      rotation: 0,
      content: type === 'text' ? 'Add text here' : type === 'bubble' ? 'Said something!' : type === 'sticker' ? '⭐' : '',
      style: {
        fontFamily: kit.bodyFont,
        fontSize: 1.4,
        color: type === 'bubble' ? '#2E2426' : kit.textColor,
        background: type === 'shape' ? kit.accentColor : type === 'bubble' ? '#FFFDED' : 'transparent',
        opacity: kit.defaultOpacity,
        borderRadius: type === 'bubble' || type === 'shape' ? kit.borderRadius : 0,
        bubbleTail: type === 'bubble' ? 'bottom-left' : 'none',
        fontWeight: 'normal',
        emojiSize: 3,
      },
      ...extra,
    };
    const next = [...elements, el];
    checkpoint(next);
    setSelectedId(el.id);
  };

  const updateSelected = (patch: Partial<PageElement>) => {
    if (!selectedId) return;
    const next = elements.map((e) => (e.id === selectedId ? { ...e, ...patch } : e));
    checkpoint(next);
  };

  const updateSelectedStyle = (patch: Partial<PageElement['style']>) => {
    if (!selectedEl) return;
    updateSelected({ style: { ...selectedEl.style, ...patch } });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const next = elements.filter((e) => e.id !== selectedId);
    checkpoint(next);
    setSelectedId(null);
  };

  const bringForward = () => {
    if (!selectedEl) return;
    updateSelected({ z: selectedEl.z + 1 });
  };
  const sendBackward = () => {
    if (!selectedEl) return;
    updateSelected({ z: Math.max(0, selectedEl.z - 1) });
  };

  // ── Drag / resize ────────────────────────────────────────────────────────────

  const startDrag = useCallback((e: RPE, id: string, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find((x) => x.id === id);
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
    setSelectedId(id);
  }, [elements]);

  const onPointerMove = useCallback((e: RPE) => {
    if (!drag.current || !canvasRef.current) return;
    const box = canvasRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.sx) / box.width;
    const dy = (e.clientY - drag.current.sy) / box.height;
    const { mode, id, ox, oy, ow, oh } = drag.current;

    const next = elements.map((el) => {
      if (el.id !== id) return el;
      if (mode === 'move') {
        return { ...el, x: clamp(ox + dx, 0, 1 - ow), y: clamp(oy + dy, 0, 1 - oh) };
      } else {
        return { ...el, w: clamp(ow + dx, 0.05, 1 - ox), h: clamp(oh + dy, 0.05, 1 - oy) };
      }
    });
    store.setDesign(storyId, pageIdx, { elements: next });
  }, [elements, store, storyId, pageIdx]);

  const onPointerUp = useCallback((e: RPE) => {
    if (!drag.current) return;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
    // Commit to history on pointer up
    const current = store.getDesign(storyId, pageIdx);
    setHistory((h) => {
      const trimmed = h.slice(0, histIdx + 1);
      return [...trimmed, current.elements];
    });
    setHistIdx((i) => i + 1);
    drag.current = null;
  }, [store, storyId, pageIdx, histIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') deleteSelected();
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === 'y' && (e.metaKey || e.ctrlKey)) || (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, histIdx, history]);

  // ── Bubble tail SVG clip ──────────────────────────────────────────────────────

  const renderBubbleTail = (tail: BubbleTail, w: number, h: number) => {
    const tw = 20, th = 14;
    if (tail === 'none') return null;
    const [left, bottom] = tail === 'bottom-left' ? [true, true] : tail === 'bottom-right' ? [false, true] : tail === 'top-left' ? [true, false] : [false, false];
    const bx = left ? 20 : w * 100 - 40, by = bottom ? h * 100 : 0;
    const tip = `${bx + (left ? -tw : tw)},${by + (bottom ? th : -th)}`;
    return (
      <svg className="pd-bubble-tail" viewBox={`0 0 ${w * 100} ${h * 100 + th}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        <polygon points={`${bx},${by} ${bx + (left ? tw : -tw)},${by} ${tip}`} fill={selectedEl?.style?.background || '#FFFDED'} />
      </svg>
    );
  };

  // ── Element renderer ──────────────────────────────────────────────────────────

  const renderElement = (el: PageElement) => {
    const isSelected = el.id === selectedId;
    const s = el.style || {};
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x * 100}%`,
      top: `${el.y * 100}%`,
      width: `${el.w * 100}%`,
      height: `${el.h * 100}%`,
      zIndex: el.z + 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      opacity: s.opacity ?? 1,
      cursor: 'grab',
      outline: isSelected ? '2px solid #7c3aed' : 'none',
      outlineOffset: '1px',
      userSelect: 'none',
    };

    let inner: React.ReactNode = null;

    if (el.type === 'text') {
      inner = (
        <div
          style={{
            width: '100%', height: '100%',
            fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle,
            fontSize: `${s.fontSize ?? 1.4}em`,
            color: s.color, background: s.background,
            borderRadius: s.borderRadius, padding: '4px 6px',
            overflow: 'hidden', display: 'flex', alignItems: 'center',
          }}
        >
          {el.content}
        </div>
      );
    } else if (el.type === 'bubble') {
      inner = (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div
            style={{
              width: '100%', height: '100%',
              background: s.background || '#FFFDED',
              borderRadius: `${s.borderRadius ?? 12}px`,
              border: '2px solid #73523A',
              fontFamily: s.fontFamily, fontWeight: s.fontWeight,
              fontSize: `${s.fontSize ?? 1.4}em`,
              color: s.color || '#2E2426',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '4px 8px', boxSizing: 'border-box', textAlign: 'center',
            }}
          >
            {el.content}
          </div>
          {renderBubbleTail(s.bubbleTail || 'none', el.w, el.h)}
        </div>
      );
    } else if (el.type === 'sticker') {
      inner = (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${s.emojiSize ?? 3}em`, lineHeight: 1 }}>
          {el.content}
        </div>
      );
    } else if (el.type === 'shape') {
      inner = (
        <div style={{ width: '100%', height: '100%', background: s.background || kit.accentColor, borderRadius: `${s.borderRadius ?? 0}px`, opacity: s.opacity ?? 0.8 }} />
      );
    }

    return (
      <div
        key={el.id}
        style={baseStyle}
        onPointerDown={(e) => startDrag(e, el.id, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
      >
        {inner}
        {isSelected && (
          <div
            className="pd-resize-handle"
            onPointerDown={(e) => { e.stopPropagation(); startDrag(e, el.id, 'resize'); }}
          />
        )}
      </div>
    );
  };

  // ── Inspector panel ──────────────────────────────────────────────────────────

  const renderInspector = () => {
    if (!selectedEl) return (
      <div className="pd-inspector-empty">Select an element to edit its style</div>
    );
    const s = selectedEl.style || {};
    const update = updateSelectedStyle;
    return (
      <div className="pd-inspector">
        <div className="pd-insp-label">Content</div>
        {(selectedEl.type === 'text' || selectedEl.type === 'bubble') && (
          <textarea
            className="pd-insp-textarea"
            value={selectedEl.content || ''}
            onChange={(e) => updateSelected({ content: e.target.value })}
          />
        )}
        {selectedEl.type === 'sticker' && (
          <div className="pd-sticker-display">{selectedEl.content}</div>
        )}

        {(selectedEl.type === 'text' || selectedEl.type === 'bubble') && (
          <>
            <div className="pd-insp-label">Font</div>
            <select className="pd-insp-select" value={s.fontFamily || ''} onChange={(e) => update({ fontFamily: e.target.value })}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <div className="pd-insp-row">
              <label className="pd-insp-label">Size</label>
              <input type="range" min="0.6" max="4" step="0.1" value={s.fontSize ?? 1.4} onChange={(e) => update({ fontSize: Number(e.target.value) })} style={{ flex: 1 }} />
              <span className="pd-insp-val">{(s.fontSize ?? 1.4).toFixed(1)}</span>
            </div>
            <div className="pd-insp-row">
              <button className={`pd-insp-btn${s.fontWeight === 'bold' ? ' active' : ''}`} onClick={() => update({ fontWeight: s.fontWeight === 'bold' ? 'normal' : 'bold' })}>B</button>
              <button className={`pd-insp-btn${s.fontStyle === 'italic' ? ' active' : ''}`} onClick={() => update({ fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
            </div>
            <div className="pd-insp-label">Text color</div>
            <input type="color" value={s.color || '#2E2426'} onChange={(e) => update({ color: e.target.value })} />
          </>
        )}

        {(selectedEl.type === 'bubble' || selectedEl.type === 'shape') && (
          <>
            <div className="pd-insp-label">Fill color</div>
            <input type="color" value={(s.background || '#FFFDED').replace(/rgba?\([^)]+\)/, '#FFFDED')} onChange={(e) => update({ background: e.target.value })} />
          </>
        )}

        {selectedEl.type === 'bubble' && (
          <>
            <div className="pd-insp-label">Bubble tail</div>
            <select className="pd-insp-select" value={s.bubbleTail || 'none'} onChange={(e) => update({ bubbleTail: e.target.value as BubbleTail })}>
              {BUBBLE_TAILS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}

        {selectedEl.type === 'sticker' && (
          <>
            <div className="pd-insp-label">Emoji size</div>
            <input type="range" min="1" max="8" step="0.5" value={s.emojiSize ?? 3} onChange={(e) => update({ emojiSize: Number(e.target.value) })} />
          </>
        )}

        <div className="pd-insp-label">Opacity</div>
        <div className="pd-insp-row">
          <input type="range" min="0.1" max="1" step="0.05" value={s.opacity ?? 1} onChange={(e) => update({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
          <span className="pd-insp-val">{Math.round((s.opacity ?? 1) * 100)}%</span>
        </div>

        <div className="pd-insp-label">Rotation</div>
        <div className="pd-insp-row">
          <input type="range" min="-180" max="180" step="1" value={selectedEl.rotation} onChange={(e) => updateSelected({ rotation: Number(e.target.value) })} style={{ flex: 1 }} />
          <span className="pd-insp-val">{selectedEl.rotation}°</span>
        </div>

        <div className="pd-insp-row" style={{ marginTop: 8, gap: 6 }}>
          <button className="pd-insp-action" onClick={bringForward}>↑ Forward</button>
          <button className="pd-insp-action" onClick={sendBackward}>↓ Back</button>
          <button className="pd-insp-action pd-insp-delete" onClick={deleteSelected}>🗑 Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div className="pd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pd-modal">
        {/* Header */}
        <div className="pd-header">
          <div className="pd-title">✏️ Page Designer — Page {pageIdx === 0 ? 'Cover' : pageIdx}</div>
          <div className="pd-header-actions">
            <button className="pd-hdr-btn" onClick={undo} disabled={histIdx <= 0} title="Undo (⌘Z)">↩ Undo</button>
            <button className="pd-hdr-btn" onClick={redo} disabled={histIdx >= history.length - 1} title="Redo (⌘Y)">↪ Redo</button>
            <button className="pd-hdr-btn pd-hdr-clear" onClick={() => { store.clearPage(storyId, pageIdx); setHistory([[]]); setHistIdx(0); setSelectedId(null); }}>Clear</button>
            <button className="pd-hdr-close" onClick={onClose}>✕ Done</button>
          </div>
        </div>

        <div className="pd-body">
          {/* Left: element palette */}
          <div className="pd-palette">
            <div className="pd-palette-title">Add element</div>
            <button className="pd-add-btn" onClick={() => addElement('text')}>T Text box</button>
            <button className="pd-add-btn" onClick={() => addElement('bubble')}>💬 Speech bubble</button>
            <button className="pd-add-btn" onClick={() => addElement('bubble', { content: 'Thinking…', style: { bubbleTail: 'top-right', background: '#f0f0ff' } })}>💭 Thought bubble</button>
            <button className="pd-add-btn" onClick={() => addElement('shape')}>▪ Shape</button>
            <button className="pd-add-btn" onClick={() => setShowStickerPicker((v) => !v)}>⭐ Sticker</button>

            {showStickerPicker && (
              <div className="pd-sticker-grid">
                {STICKER_LIST.map((s) => (
                  <button key={s} className="pd-sticker-pick" onClick={() => { addElement('sticker', { content: s, w: 0.15, h: 0.15 }); setShowStickerPicker(false); }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <hr className="pd-palette-sep" />
            <div className="pd-palette-title">Inspector</div>
            {renderInspector()}
          </div>

          {/* Center: canvas */}
          <div
            ref={canvasRef}
            className="pd-canvas"
            onClick={() => setSelectedId(null)}
          >
            {imageSrc && (
              <img src={imageSrc} className="pd-canvas-img" alt="page" draggable={false} />
            )}
            {[...elements].sort((a, b) => a.z - b.z).map(renderElement)}
          </div>
        </div>
      </div>
    </div>
  );
}

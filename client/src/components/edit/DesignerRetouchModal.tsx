/**
 * DesignerRetouchModal — S-D9.02/03
 * Brush-based mask editor for Magic Eraser (S-D9.02) and Generative Fill (S-D9.03).
 * User paints over the image to mark the region to edit; sends mask + prompt to
 * /api/storybook/designer-retouch which calls the GPT Image edit API.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ButtonView, TextInputView, SliderView, SelectInputView, type SelectOption } from '@salilvnair/dui';

const GPT_EDIT_MODELS: SelectOption[] = [
  { value: 'gpt-image-2',           label: 'gpt-image-2 (recommended)' },
  { value: 'chatgpt-image-latest',  label: 'chatgpt-image-latest' },
  { value: 'gpt-image-1',          label: 'gpt-image-1' },
  { value: 'gpt-image-1-mini',      label: 'gpt-image-1-mini' },
  { value: 'gpt-image-1.5',         label: 'gpt-image-1.5' },
  { value: 'gpt-image-2-2026-04-21', label: 'gpt-image-2-2026-04-21' },
];

interface Props {
  imageUrl: string;
  mode: 'erase' | 'fill';
  onClose: () => void;
  onApply: (resultB64: string) => void;
}

export function DesignerRetouchModal({ imageUrl, mode: initialMode, onClose, onApply }: Props) {
  const [mode, setMode] = useState(initialMode);
  const [prompt, setPrompt] = useState('');
  const [brushSize, setBrushSize] = useState(36);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState('gpt-image-2');

  const imgRef   = useRef<HTMLImageElement>(null);
  // overlayCanvas shows the user's painted mask (red highlight)
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // maskCanvas builds the actual RGBA mask for the API (transparent = edit)
  const maskRef  = useRef<HTMLCanvasElement>(null);
  const isPainting = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // After image loads, size canvases to match
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgNatW, setImgNatW]   = useState(0);
  const [imgNatH, setImgNatH]   = useState(0);

  const initCanvases = useCallback(() => {
    const img = imgRef.current;
    const oc  = overlayRef.current;
    const mc  = maskRef.current;
    if (!img || !oc || !mc) return;

    const w = img.naturalWidth  || img.width;
    const h = img.naturalHeight || img.height;
    setImgNatW(w); setImgNatH(h);

    // Overlay canvas (visual, shown to user)
    oc.width = w; oc.height = h;
    const octx = oc.getContext('2d')!;
    octx.clearRect(0, 0, w, h);

    // Mask canvas (API): start fully opaque white = "keep everything"
    mc.width = w; mc.height = h;
    const mctx = mc.getContext('2d')!;
    mctx.fillStyle = 'white';
    mctx.fillRect(0, 0, w, h);
  }, []);

  useEffect(() => {
    if (imgLoaded) initCanvases();
  }, [imgLoaded, initCanvases]);

  // Convert pointer position (in display coords) → canvas coords
  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    const scaleX = imgNatW / rect.width;
    const scaleY = imgNatH / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPainting.current) return;
    const oc   = overlayRef.current!;
    const mc   = maskRef.current!;
    const octx = oc.getContext('2d')!;
    const mctx = mc.getContext('2d')!;
    const { x, y } = toCanvasCoords(e);
    const r = brushSize / 2;

    // Overlay: paint red semi-transparent circle so user can see their selection
    octx.globalCompositeOperation = 'source-over';
    octx.fillStyle = 'rgba(255, 0, 50, 0.45)';
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();

    // Mask: erase (make transparent) where user painted → OpenAI reads alpha=0 as "edit here"
    mctx.globalCompositeOperation = 'destination-out';
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fill();
    mctx.globalCompositeOperation = 'source-over';
  };

  const clearMask = () => {
    const oc  = overlayRef.current;
    const mc  = maskRef.current;
    if (!oc || !mc) return;
    const octx = oc.getContext('2d')!;
    const mctx = mc.getContext('2d')!;
    octx.clearRect(0, 0, oc.width, oc.height);
    mctx.fillStyle = 'white';
    mctx.fillRect(0, 0, mc.width, mc.height);
  };

  // Fetch image as b64
  const getImageB64 = async (): Promise<string> => {
    if (imageUrl.startsWith('data:')) return imageUrl.split(',')[1];
    const r = await fetch(imageUrl);
    const blob = await r.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const apply = async () => {
    const mc = maskRef.current;
    if (!mc) return;

    // Check user actually painted something
    const mctx = mc.getContext('2d')!;
    const data  = mctx.getImageData(0, 0, mc.width, mc.height).data;
    const hasMask = data.some((_, i) => i % 4 === 3 && data[i] === 0);
    if (!hasMask) { setError('Paint the area you want to change first.'); return; }

    setLoading(true);
    setError('');
    try {
      const [imagB64, maskB64] = await Promise.all([
        getImageB64(),
        new Promise<string>((resolve) => mc.toBlob((blob) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob!);
        }, 'image/png')),
      ]);

      const effectivePrompt = mode === 'erase'
        ? 'Remove this selected area and fill naturally with the surrounding background.'
        : (prompt.trim() || 'Fill this area with something that matches the scene.');

      const res = await fetch('/api/storybook/designer-retouch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_b64: imagB64, mask_b64: maskB64, prompt: effectivePrompt, model }),
      });
      const result = await res.json() as { ok?: boolean; image_b64?: string; error?: string; stub?: boolean };
      if (!result.ok) { setError(result.error || 'Failed'); return; }
      if (result.stub) { setError('No OpenAI API key configured.'); return; }
      onApply(result.image_b64!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ds-retouch-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ds-retouch-modal" ref={containerRef}>
        {/* Header */}
        <div className="ds-retouch-header">
          <span className="ds-retouch-title">AI Retouch</span>
          <div className="lib-view-toggle">
            <button type="button" className={`lib-vt-btn${mode === 'erase' ? ' is-active' : ''}`} onClick={() => setMode('erase')}>✂️ Magic Eraser</button>
            <button type="button" className={`lib-vt-btn${mode === 'fill' ? ' is-active' : ''}`} onClick={() => setMode('fill')}>✨ Generative Fill</button>
          </div>
          <button className="ds-retouch-close" onClick={onClose}>✕</button>
        </div>

        {/* Canvas area */}
        <div className="ds-retouch-canvas-wrap">
          <img
            ref={imgRef}
            src={imageUrl}
            className="ds-retouch-img"
            crossOrigin="anonymous"
            onLoad={() => setImgLoaded(true)}
            draggable={false}
            alt=""
          />
          {/* Overlay canvas captures pointer events */}
          <canvas
            ref={overlayRef}
            className="ds-retouch-overlay-canvas"
            onPointerDown={(e) => { isPainting.current = true; (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); paint(e); }}
            onPointerMove={paint}
            onPointerUp={() => { isPainting.current = false; }}
            onPointerCancel={() => { isPainting.current = false; }}
          />
          {/* Hidden mask canvas for API */}
          <canvas ref={maskRef} style={{ display: 'none' }} />
        </div>

        {/* Controls */}
        <div className="ds-retouch-controls">
          <div className="ds-retouch-ctrl-row">
            <label className="ds-retouch-ctrl-label">Brush size</label>
            <div style={{ flex: 1 }}>
              <SliderView size="sm" min={10} max={120} step={2} value={brushSize} onChange={setBrushSize} />
            </div>
            <span className="ds-retouch-brush-px">{brushSize}px</span>
            <ButtonView size="sm" variant="secondary" onClick={clearMask}>Clear</ButtonView>
          </div>

          <div className="ds-retouch-ctrl-row">
            <label className="ds-retouch-ctrl-label">Model</label>
            <div style={{ flex: 1 }}>
              <SelectInputView options={GPT_EDIT_MODELS} value={model} onChange={setModel} size="sm" />
            </div>
          </div>

          {mode === 'fill' && (
            <div className="ds-retouch-ctrl-row">
              <label className="ds-retouch-ctrl-label">Prompt</label>
              <div style={{ flex: 1 }}>
                <TextInputView size="sm" value={prompt}
                  onChange={(e) => setPrompt((e.target as HTMLInputElement).value)}
                  placeholder="Describe what to generate here…" />
              </div>
            </div>
          )}

          {error && <div className="ds-retouch-error">{error}</div>}

          <div className="ds-retouch-actions">
            <ButtonView size="sm" variant="secondary" onClick={onClose} disabled={loading}>Cancel</ButtonView>
            <ButtonView size="sm" variant="primary" onClick={apply} disabled={loading}>
              {loading ? '✨ Retouching…' : mode === 'erase' ? '✂️ Erase Area' : '✨ Generate Fill'}
            </ButtonView>
          </div>
        </div>
      </div>
    </div>
  );
}

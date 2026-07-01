/**
 * Designer Studio (S-D1–S-D9)
 *
 * Full-screen design IDE: palette | Konva canvas | layers + inspector
 * Features: undo/redo · layers panel · z-order controls · align toolbar
 *           precise X/Y/W/H inputs · DUI inspector · localStorage persistence
 *           image/ellipse/sticker elements · 6 bubble kinds
 *           rich text (bold/italic/underline/outline/shadow) · toggle controls (S-D5)
 *           element presets · page templates (S-D6)
 *           community blocks (S-D7) · JSON import · arrow nudge (S-D8)
 *           multi-select + marquee + snap (S-D9.11)
 *           layer opacity + blend modes + inline rename (S-D9.12)
 *           auto-layout distribute + tidy grid (S-D9.15)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Group, Rect, Line, Image as KImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { ButtonView, IconButtonView, TextInputView, SelectInputView, SliderView, ContextMenuView, SplitPanelView, SearchInputView, SegmentedView, type SelectOption, type ContextMenuItem } from '@salilvnair/dui';
import { SidebarLeftIcon, SidebarRightIcon, SearchIcon, ChevronRightIcon, EyeIcon, EyeOffIcon, ArrowUpIcon, ArrowDownIcon, MoreHorizontalIcon, TrashIcon, CopyIcon, PasteIcon, DuplicateIcon, LockIcon, AgentIcon, UndoIcon, RotateCWIcon, FlipHIcon, FlipVIcon, ResetIcon, ShieldIcon } from '../icons';
import { registry, newElement, type DesignerElement } from '../designer/registry';
import { useAIEdit } from '../components/edit/use-ai-edit';
import { DesignerRetouchModal } from '../components/edit/DesignerRetouchModal';
import { loadCommunityBlocks } from '../designer/community-blocks';
import '../designer/elements/builtins';

const STAGE_W = 700;
const STAGE_H = 700;
const LS_KEY = 'istorybook_designer_studio';
const LS_PRESETS = 'istorybook_designer_presets';
const LS_BG = 'istorybook_designer_bg';
const SNAP_THRESHOLD = 8;

type StoryMeta = { id: string; title: string; pageCount: number; archived?: boolean };
type Preset = { name: string; el: DesignerElement };
type SnapGuide = { x?: number; y?: number };
type Marquee = { x1: number; y1: number; x2: number; y2: number };

// S-D9.16 — AI Design Assistant operation types
type DesignOp =
  | { op: 'add'; type: string; x?: number; y?: number; w?: number; h?: number; props?: Record<string, unknown> }
  | { op: 'patch'; id: string; patch: Partial<DesignerElement> }
  | { op: 'patchProps'; id: string; props: Record<string, unknown> }
  | { op: 'delete'; id: string }
  | { op: 'clearAll' }
  | { op: 'duplicate'; id: string }
  | { op: 'alignH'; id: string; align: 'left' | 'center' | 'right' }
  | { op: 'alignV'; id: string; align: 'top' | 'middle' | 'bottom' };

// ── S-D9.12 blend mode options ─────────────────────────────────────────────────
const BLEND_MODE_OPTIONS: SelectOption[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply',    label: 'Multiply' },
  { value: 'screen',      label: 'Screen' },
  { value: 'overlay',     label: 'Overlay' },
  { value: 'darken',      label: 'Darken' },
  { value: 'lighten',     label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn',  label: 'Color Burn' },
  { value: 'hard-light',  label: 'Hard Light' },
  { value: 'soft-light',  label: 'Soft Light' },
  { value: 'difference',  label: 'Difference' },
  { value: 'exclusion',   label: 'Exclusion' },
];

// ── S-D9.13 — Built-in emoji library ─────────────────────────────────────────
const EMOJI_LIBRARY = [
  { cat: 'Faces',   items: ['😀','😍','🤔','😎','🥳','😢','😡','🤩','🥰','😜','🙏','👋','😇','🤗','😴'] },
  { cat: 'Animals', items: ['🦊','🐢','🦁','🐧','🦋','🐬','🦄','🐉','🐸','🐨','🦒','🐼','🐸','🦅','🐙'] },
  { cat: 'Nature',  items: ['🌸','🌙','⭐','🌈','🌊','🔥','❄️','🌺','🍀','🌵','🌴','⚡','🌞','🌙','🍁'] },
  { cat: 'Objects', items: ['🏠','🎨','📚','🎭','🎵','🎁','🔮','⚔️','🛸','🏆','💎','🎪','🎠','🪄','🎩'] },
  { cat: 'Food',    items: ['🍎','🍕','🍦','🎂','🍭','🍓','🍩','🌮','🍜','🍿','🧁','🍇','🫐','🥑','🍫'] },
];
const LS_EMOJI_FAVS = 'istorybook_ds_emoji_favs';

// ── S-D9.06 — Canvas size presets ────────────────────────────────────────────
const CANVAS_SIZES: SelectOption[] = [
  { value: '700x700',  label: '■ Square (700×700)' },
  { value: '700x990',  label: '▯ Portrait (700×990)' },
  { value: '990x700',  label: '▭ Landscape (990×700)' },
  { value: '700x1050', label: '▮ Tall (700×1050)' },
];

// ── S-D9.07 — Story color palettes ───────────────────────────────────────────
const STORY_PALETTES = [
  '#7c3aed','#ec4899','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#ef4444','#84cc16','#f59e0b',
  '#10b981','#8b5cf6','#e11d48','#fef3c7','#dbeafe',
  '#ffffff','#1e293b','#374151','#6b7280','#d1d5db',
];

// ── Page templates (S-D6) ─────────────────────────────────────────────────────
const PAGE_TEMPLATES: { name: string; elements: DesignerElement[] }[] = [
  { name: 'Blank', elements: [] },
  {
    name: 'Title Card',
    elements: [
      { id: 'tpl-bg',    type: 'shape.rect', x: 0,  y: 0,   w: 700, h: 700, rotation: 0, props: { fill: '#fef3c7', cornerRadius: 0,  strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-title', type: 'text',       x: 50, y: 250, w: 600, h: 90,  rotation: 0, props: { text: 'Story Title', fontSize: 56, fill: '#7c3aed', fontFamily: 'Baloo 2, system-ui', bold: true,  italic: false, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
      { id: 'tpl-sub',   type: 'text',       x: 80, y: 370, w: 540, h: 50,  rotation: 0, props: { text: 'A tale for young readers', fontSize: 26, fill: '#78716c', fontFamily: 'Baloo 2, system-ui', bold: false, italic: true,  underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
    ],
  },
  {
    name: 'Story Spread',
    elements: [
      { id: 'tpl-left',  type: 'shape.rect', x: 0,   y: 0,   w: 340, h: 700, rotation: 0, props: { fill: '#fef9ee', cornerRadius: 0,  strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-img',   type: 'shape.rect', x: 360, y: 30,  w: 310, h: 350, rotation: 0, props: { fill: '#e0e7ef', cornerRadius: 16, strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-story', type: 'text',       x: 20,  y: 120, w: 300, h: 200, rotation: 0, props: { text: 'Once upon a time…', fontSize: 24, fill: '#2e2426', fontFamily: 'Baloo 2, system-ui', bold: false, italic: false, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
    ],
  },
  // S-D9.14 — expanded template gallery
  {
    name: 'Night Sky',
    elements: [
      { id: 'tpl-sky',    type: 'shape.rect', x: 0,   y: 0,   w: 700, h: 700, rotation: 0, props: { fill: '#0f0c29', cornerRadius: 0, strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-moon',   type: 'shape.ellipse', x: 520, y: 60, w: 110, h: 110, rotation: 0, props: { fill: '#fde68a', strokeWidth: 0, opacity: 0.9, shadowBlur: 30, shadowColor: '#fde68a', shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.6 } },
      { id: 'tpl-text',   type: 'text', x: 60, y: 520, w: 580, h: 100, rotation: 0, props: { text: 'Once, under a blanket of stars…', fontSize: 32, fill: '#e0e7ff', fontFamily: 'Baloo 2, system-ui', bold: false, italic: true, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
    ],
  },
  {
    name: 'Character Spotlight',
    elements: [
      { id: 'tpl-bg2',    type: 'shape.rect',    x: 0,   y: 0,   w: 700, h: 700, rotation: 0, props: { fill: '#ecfdf5', cornerRadius: 0, strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-circle', type: 'shape.ellipse', x: 175, y: 120, w: 350, h: 350, rotation: 0, props: { fill: '#bbf7d0', strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-name',   type: 'text', x: 60,  y: 530, w: 580, h: 70,  rotation: 0, props: { text: 'Character Name', fontSize: 42, fill: '#065f46', fontFamily: 'Baloo 2, system-ui', bold: true, italic: false, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
      { id: 'tpl-role',   type: 'text', x: 80,  y: 615, w: 540, h: 40,  rotation: 0, props: { text: 'the brave little fox', fontSize: 22, fill: '#059669', fontFamily: 'Baloo 2, system-ui', bold: false, italic: true, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
    ],
  },
  {
    name: 'Adventure Panel',
    elements: [
      { id: 'tpl-top',    type: 'shape.rect', x: 0,  y: 0,   w: 700, h: 360, rotation: 0, props: { fill: '#fbbf24', cornerRadius: 0, strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-bot',    type: 'shape.rect', x: 0,  y: 360, w: 700, h: 340, rotation: 0, props: { fill: '#1e3a5f', cornerRadius: 0, strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-head',   type: 'text', x: 40, y: 140, w: 620, h: 90,  rotation: 0, props: { text: 'THE GREAT ADVENTURE', fontSize: 46, fill: '#1e3a5f', fontFamily: 'Baloo 2, system-ui', bold: true, italic: false, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 4, shadowColor: '#000', shadowOffsetX: 2, shadowOffsetY: 2, shadowOpacity: 0.2 } },
      { id: 'tpl-body',   type: 'text', x: 60, y: 410, w: 580, h: 160, rotation: 0, props: { text: 'The hero set out on a journey that would change everything forever…', fontSize: 26, fill: '#e0e7ff', fontFamily: 'Baloo 2, system-ui', bold: false, italic: false, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
    ],
  },
  {
    name: 'Cozy Reading',
    elements: [
      { id: 'tpl-bg3',    type: 'shape.rect', x: 0,   y: 0,   w: 700, h: 700, rotation: 0, props: { fill: '#fdf4e3', cornerRadius: 0, strokeWidth: 0, opacity: 1, shadowBlur: 0 } },
      { id: 'tpl-card',   type: 'shape.rect', x: 50,  y: 80,  w: 600, h: 540, rotation: 0, props: { fill: '#ffffff', cornerRadius: 24, strokeWidth: 0, opacity: 1, shadowBlur: 20, shadowColor: '#c4a882', shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 0.25 } },
      { id: 'tpl-top2',   type: 'text', x: 80, y: 140, w: 540, h: 60,  rotation: 0, props: { text: 'Chapter One', fontSize: 20, fill: '#a78a5f', fontFamily: 'Baloo 2, system-ui', bold: false, italic: true, underline: false, align: 'center', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
      { id: 'tpl-body2',  type: 'text', x: 80, y: 220, w: 540, h: 300, rotation: 0, props: { text: 'The afternoon light fell soft through the window as the story began to unfold…', fontSize: 28, fill: '#3d2f1a', fontFamily: 'Baloo 2, system-ui', bold: false, italic: false, underline: false, align: 'left', stroke: '#000000', strokeWidth: 0, shadowBlur: 0 } },
    ],
  },
];

function exportDesign(elements: DesignerElement[]) {
  const blob = new Blob([JSON.stringify({ version: 1, elements }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `designer-${Date.now()}.design.json`;
  a.click();
}

// ── Inspector ─────────────────────────────────────────────────────────────────

function Inspector({
  selected, spec,
  onPatch, onPatchProps, onDelete, onDuplicate,
  onBringForward, onSendBack, onBringToFront, onSendToBack,
  onAlignH, onAlignV, onSavePreset,
  onRemoveBg, onOpenRetouch,
}: {
  selected: DesignerElement | null;
  spec: ReturnType<typeof registry.get>;
  onPatch: (p: Partial<DesignerElement>) => void;
  onPatchProps: (p: Record<string, unknown>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBack: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onAlignH: (a: 'left' | 'center' | 'right') => void;
  onAlignV: (a: 'top' | 'middle' | 'bottom') => void;
  onSavePreset: () => void;
  onRemoveBg?: () => void;
  onOpenRetouch?: (mode: 'erase' | 'fill') => void;
}) {
  // S-D9.01 — Remove BG local loading state
  const [removeBgLoading, setRemoveBgLoading] = useState(false);
  // S-D9.05 — Magic Write local state
  const [mwInstruction, setMwInstruction] = useState('');
  const [mwTone, setMwTone] = useState('fun');
  const [mwLoading, setMwLoading] = useState(false);

  const applyMagicWrite = async () => {
    if (mwLoading || !selected) return;
    setMwLoading(true);
    try {
      const res = await fetch('/api/storybook/magic-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: String(selected.props.text || ''), instruction: mwInstruction, tone: mwTone }),
      });
      const data = await res.json() as { text?: string };
      if (data.text) onPatchProps({ text: data.text });
    } catch { /* ignore */ }
    setMwLoading(false);
  };

  const isMagicWritable = selected?.type === 'text' || (selected?.type ?? '').startsWith('bubble');
  const hasFillProp = selected?.props && 'fill' in selected.props;

  if (!selected || !spec) {
    return (
      <div className="ds-inspector-empty">
        <p>Select an element on the canvas to edit its properties.</p>
      </div>
    );
  }

  return (
    <div className="ds-inspector-fields">
      {/* ── Position & size ── */}
      <div className="ds-field-section-label">Position &amp; Size</div>
      <div className="ds-xywh-grid">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} className="ds-xywh-label">
            <span>{k.toUpperCase()}</span>
            <TextInputView
              type="number"
              size="sm"
              value={String(Math.round(selected[k]))}
              onChange={(e) => {
                const v = parseInt((e.target as HTMLInputElement).value, 10);
                if (!isNaN(v)) onPatch({ [k]: Math.max(k === 'w' || k === 'h' ? 10 : -2000, v) });
              }}
            />
          </label>
        ))}
      </div>

      {/* ── Layer properties (S-D9.12) ── */}
      <div className="ds-field-section-label">Layer</div>
      <label className="ds-field ds-field-col">
        <span>Name</span>
        <TextInputView
          size="sm"
          value={selected.name || ''}
          onChange={(e) => onPatch({ name: (e.target as HTMLInputElement).value || undefined })}
          placeholder={spec.palette.label}
        />
      </label>
      <label className="ds-field ds-field-slider">
        <span>Opacity</span>
        <SliderView size="sm" min={0} max={1} step={0.05}
          value={selected.opacity ?? 1} onChange={(val) => onPatch({ opacity: val })} />
      </label>
      <label className="ds-field">
        <span>Blend mode</span>
        <SelectInputView
          options={BLEND_MODE_OPTIONS}
          value={selected.blendMode ?? 'source-over'}
          onChange={(val) => onPatch({ blendMode: val })}
          size="sm"
        />
      </label>

      {/* ── Z-order ── */}
      <div className="ds-field-section-label">Layer Order</div>
      <div className="ds-z-btns">
        <ButtonView size="sm" variant="secondary" onClick={onBringToFront} title="Bring to front">⊤</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={onBringForward} title="Bring forward">↑</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={onSendBack} title="Send backward">↓</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={onSendToBack} title="Send to back">⊥</ButtonView>
      </div>

      {/* ── Align ── */}
      <div className="ds-field-section-label">Align to canvas</div>
      <div className="ds-align-btns">
        <ButtonView size="sm" variant="secondary" onClick={() => onAlignH('left')} title="Align left">⇤</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={() => onAlignH('center')} title="Center H">↔</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={() => onAlignH('right')} title="Align right">⇥</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={() => onAlignV('top')} title="Align top">⇡</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={() => onAlignV('middle')} title="Center V">↕</ButtonView>
        <ButtonView size="sm" variant="secondary" onClick={() => onAlignV('bottom')} title="Align bottom">⇣</ButtonView>
      </div>

      {/* ── Element props ── */}
      <div className="ds-field-section-label">Style</div>
      {spec.inspector.map((f) => {
        const v = selected.props[f.key];
        const set = (val: unknown) => onPatchProps({ [f.key]: val });

        if (f.control === 'color') {
          return (
            <label key={f.key} className="ds-field">
              <span>{f.label}</span>
              <input type="color" value={String(v || '#000000').slice(0, 7)} onChange={(e) => set(e.target.value)} />
            </label>
          );
        }
        if (f.control === 'slider') {
          return (
            <label key={f.key} className="ds-field ds-field-slider">
              <span>{f.label}</span>
              <SliderView size="sm" min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1}
                value={Number(v ?? f.min ?? 0)} onChange={(val) => set(val)} />
            </label>
          );
        }
        if (f.control === 'select') {
          const selectOpts: SelectOption[] = (f.options ?? []).map((o) => ({ value: o.value, label: o.label }));
          return (
            <label key={f.key} className="ds-field">
              <span>{f.label}</span>
              <SelectInputView
                options={selectOpts}
                value={String(v ?? '')}
                onChange={(val) => set(val)}
                size="sm"
              />
            </label>
          );
        }
        if (f.control === 'textarea') {
          return (
            <label key={f.key} className="ds-field ds-field-col">
              <span>{f.label}</span>
              <textarea
                className="ds-textarea"
                rows={3}
                value={String(v ?? '')}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          );
        }
        if (f.control === 'toggle') {
          return (
            <label key={f.key} className="ds-field ds-field-toggle">
              <span>{f.label}</span>
              <input type="checkbox" className="ds-toggle" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} />
            </label>
          );
        }
        return (
          <label key={f.key} className="ds-field ds-field-col">
            <span>{f.label}</span>
            <TextInputView
              size="sm"
              value={String(v ?? '')}
              onChange={(e) => set((e.target as HTMLInputElement).value)}
            />
          </label>
        );
      })}

      {/* ── S-D9.01/02/03 — AI Image Tools (image elements only) ── */}
      {selected?.type === 'image' && (onRemoveBg || onOpenRetouch) && (
        <>
          <div className="ds-field-section-label">AI Image Tools</div>
          <div className="ds-ai-img-tools">
            {onRemoveBg && (
              <ButtonView size="sm" variant="secondary" disabled={removeBgLoading} onClick={onRemoveBg}
                title="Remove background using GPT Image AI">
                {removeBgLoading ? '✂️ Removing…' : '✂️ Remove BG'}
              </ButtonView>
            )}
            {onOpenRetouch && (
              <ButtonView size="sm" variant="secondary" onClick={() => onOpenRetouch('erase')}
                title="Paint over an area to magically erase it">
                🧹 Magic Eraser
              </ButtonView>
            )}
            {onOpenRetouch && (
              <ButtonView size="sm" variant="secondary" onClick={() => onOpenRetouch('fill')}
                title="Paint an area and describe what to fill it with">
                ✨ Gen Fill
              </ButtonView>
            )}
          </div>
        </>
      )}

      {/* ── S-D9.07 — Quick Recolor (only when element has a fill prop) ── */}
      {hasFillProp && (
        <>
          <div className="ds-field-section-label">Quick Recolor</div>
          <div className="ds-recolor-grid">
            {STORY_PALETTES.map((color) => (
              <button
                key={color}
                className="ds-recolor-swatch"
                style={{ background: color, border: color === '#ffffff' ? '1.5px solid var(--color-border)' : 'none' }}
                title={color}
                onClick={() => onPatchProps({ fill: color })}
              />
            ))}
          </div>
        </>
      )}

      {/* ── S-D9.05 — Magic Write (only for text / bubble elements) ── */}
      {isMagicWritable && (
        <>
          <div className="ds-field-section-label">✨ Magic Write</div>
          <label className="ds-field">
            <span>Tone</span>
            <SelectInputView
              options={[
                { value: 'fun',      label: 'Fun' },
                { value: 'dramatic', label: 'Dramatic' },
                { value: 'poetic',   label: 'Poetic' },
                { value: 'simple',   label: 'Simple' },
                { value: 'rhyming',  label: 'Rhyming' },
                { value: 'spooky',   label: 'Spooky' },
              ]}
              value={mwTone}
              onChange={setMwTone}
              size="sm"
            />
          </label>
          <label className="ds-field ds-field-col">
            <span>Instruction <span style={{ opacity: 0.55, fontWeight: 400 }}>(optional)</span></span>
            <TextInputView
              size="sm"
              value={mwInstruction}
              onChange={(e) => setMwInstruction((e.target as HTMLInputElement).value)}
              placeholder="e.g. make it more exciting"
            />
          </label>
          <div className="ds-action-btns">
            <ButtonView size="sm" variant="primary" disabled={mwLoading} onClick={applyMagicWrite}>
              {mwLoading ? '✍️ Writing…' : '✨ Rewrite'}
            </ButtonView>
          </div>
        </>
      )}

      {/* ── Actions ── */}
      <div className="ds-action-btns">
        <ButtonView size="sm" variant="secondary" onClick={onDuplicate}>Duplicate</ButtonView>
        <ButtonView size="sm" accentColor="#f87171" variant="secondary" onClick={onDelete}>Delete</ButtonView>
      </div>
      <div className="ds-action-btns" style={{ marginTop: 4 }}>
        <ButtonView size="sm" variant="secondary" onClick={onSavePreset} title="Save this element as a reusable preset">💾 Save as Preset</ButtonView>
      </div>
    </div>
  );
}

// ── Layers panel (S-D9.11 multi-select, S-D9.12 inline rename) ────────────────

function LayersPanel({
  elements, selectedIds,
  onSelect, onRename, onMoveUp, onMoveDown, onToggleHidden, onDelete, onOpenMenu,
}: {
  elements: DesignerElement[];
  selectedIds: string[];
  onSelect: (id: string, shift: boolean) => void;
  onRename: (id: string, name: string) => void;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenMenu: (id: string, anchor: HTMLElement) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const renameWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (renamingId && renameWrapRef.current) {
      const input = renameWrapRef.current.querySelector('input');
      if (input) { input.focus(); input.select(); }
    }
  }, [renamingId]);

  if (!elements.length) {
    return <div className="ds-layers-empty">No elements yet — add from the palette.</div>;
  }
  return (
    <div className="ds-layers-list">
      {[...elements].map((_, i) => elements.length - 1 - i).map((realIdx) => {
        const el = elements[realIdx];
        const spec = registry.get(el.type);
        const isSelected = selectedIds.includes(el.id);
        const isRenaming = renamingId === el.id;
        return (
          <div
            key={el.id}
            className={`ds-layer-row${isSelected ? ' ds-layer-selected' : ''}`}
            onClick={(e) => onSelect(el.id, e.shiftKey)}
            onContextMenu={(e) => { e.preventDefault(); onOpenMenu(el.id, e.currentTarget as HTMLElement); }}
          >
            <button className="ds-layer-eye" title={el.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); onToggleHidden(el.id); }}>{el.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}</button>
            <span className="ds-layer-icon">{spec?.palette.icon ?? '?'}</span>
            {isRenaming ? (
              <div ref={renameWrapRef} style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                <TextInputView
                  size="sm"
                  value={renameVal}
                  onChange={(e) => setRenameVal((e.target as HTMLInputElement).value)}
                  onBlur={() => { onRename(el.id, renameVal); setRenamingId(null); }}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') { onRename(el.id, renameVal); setRenamingId(null); }
                    if (e.key === 'Escape') setRenamingId(null);
                    e.stopPropagation();
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            ) : (
              <span
                className="ds-layer-label"
                style={el.hidden ? { opacity: 0.45 } : undefined}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(el.id);
                  setRenameVal(el.name || spec?.palette.label || el.type);
                }}
                title="Double-click to rename"
              >
                {el.name || spec?.palette.label || el.type}
              </span>
            )}
            {el.opacity !== undefined && el.opacity < 1 && !isRenaming && (
              <span className="ds-layer-opacity" title={`Opacity: ${Math.round(el.opacity * 100)}%`}>{Math.round(el.opacity * 100)}%</span>
            )}
            <div className="ds-layer-btns">
              <button className="ds-layer-btn" title="Bring forward" disabled={realIdx === elements.length - 1} onClick={(e) => { e.stopPropagation(); onMoveUp(realIdx); }}><ArrowUpIcon size={13} /></button>
              <button className="ds-layer-btn" title="Send back" disabled={realIdx === 0} onClick={(e) => { e.stopPropagation(); onMoveDown(realIdx); }}><ArrowDownIcon size={13} /></button>
              <button className="ds-layer-btn" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(el.id); }}><TrashIcon size={13} /></button>
              <button className="ds-layer-btn ds-layer-more" title="More options" onClick={(e) => { e.stopPropagation(); onOpenMenu(el.id, e.currentTarget as HTMLElement); }}><MoreHorizontalIcon size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function DesignerStudioTab() {
  const [elements, setElements] = useState<DesignerElement[]>([]);
  // S-D9.11 — multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<DesignerElement[][]>([]);
  const [redoStack, setRedoStack] = useState<DesignerElement[][]>([]);
  const [rightTab, setRightTab] = useState<'layers' | 'inspector'>('inspector');
  const [editSrc, setEditSrc] = useState<string | null>(null);
  const [dsMode, setDsMode] = useState<'manual' | 'ai'>('manual');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [stories, setStories] = useState<StoryMeta[]>([]);
  const [bgStoryId, setBgStoryId] = useState('');
  const [bgSlot, setBgSlot] = useState('');
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(0.9);
  const [clipboard, setClipboard] = useState<DesignerElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuElId, setMenuElId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [paletteCollapsed, setPaletteCollapsed] = useState<Set<string>>(new Set());
  // S-D9.11 — marquee + snap guides
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  // S-D9.06 — dynamic canvas size
  const [stageW, setStageW] = useState(STAGE_W);
  const [stageH, setStageH] = useState(STAGE_H);
  // S-D9.04 — AI image generation
  const [aiGenPrompt, setAiGenPrompt] = useState('');
  const [aiGenLoading, setAiGenLoading] = useState(false);
  // S-D9.16 — AI Design Assistant
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiAssistCmd, setAiAssistCmd] = useState('');
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  // S-D9.01/02/03 — retouch modal
  const [retouchEl, setRetouchEl] = useState<{ el: DesignerElement; mode: 'erase' | 'fill' } | null>(null);

  // ── History (defined early so useCallback deps below can reference commit) ──
  const commit = useCallback((newEls: DesignerElement[], prevEls: DesignerElement[]) => {
    setUndoStack((s) => [...s.slice(-49), prevEls]);
    setRedoStack([]);
    setElements(newEls);
  }, []);
  // S-D9.13 — emoji library
  const [emojiCollapsed, setEmojiCollapsed] = useState<Set<string>>(
    new Set(['Animals', 'Nature', 'Objects', 'Food'])
  );
  const [emojiFavs, setEmojiFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_EMOJI_FAVS) || '[]'); } catch { return []; }
  });

  const togglePaletteCat = (id: string) => setPaletteCollapsed((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // S-D9.13 — emoji helpers
  const toggleEmojiCat = (cat: string) => setEmojiCollapsed((prev) => {
    const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next;
  });
  const addEmojiToFavs = (em: string) => setEmojiFavs((prev) => {
    const next = prev.includes(em) ? prev : [...prev, em];
    try { localStorage.setItem(LS_EMOJI_FAVS, JSON.stringify(next)); } catch { /**/ }
    return next;
  });
  const removeEmojiFromFavs = (em: string) => setEmojiFavs((prev) => {
    const next = prev.filter((x) => x !== em);
    try { localStorage.setItem(LS_EMOJI_FAVS, JSON.stringify(next)); } catch { /**/ }
    return next;
  });
  const addSticker = (emoji: string) => {
    const el = newElement('sticker');
    if (!el) return;
    el.x = 60 + (elements.length % 5) * 20;
    el.y = 60 + (elements.length % 5) * 20;
    el.props = { ...el.props, emoji };
    commit([...elements, el], elements);
    selectOne(el.id);
  };

  // S-D9.04 — AI image generation helper
  const generateAIImage = async () => {
    if (!aiGenPrompt.trim() || aiGenLoading) return;
    setAiGenLoading(true);
    try {
      const res = await fetch('/api/storybook/text-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiGenPrompt }),
      });
      const data = await res.json() as { image_b64?: string };
      if (data.image_b64) {
        const url = `data:image/png;base64,${data.image_b64}`;
        const el = newElement('image');
        if (el) {
          el.props = { ...el.props, url };
          el.x = 60; el.y = 60; el.w = 300; el.h = 300;
          commit([...elements, el], elements);
          selectOne(el.id);
        }
      }
    } catch { /* ignore */ }
    setAiGenLoading(false);
  };

  // S-D9.16 — AI Design Assistant: apply LLM-generated operations
  const applyDesignOps = useCallback((ops: DesignOp[]) => {
    let newEls = [...elements];
    for (const op of ops) {
      if (op.op === 'add') {
        const el = newElement(op.type);
        if (!el) continue;
        if (op.x !== undefined) el.x = op.x;
        if (op.y !== undefined) el.y = op.y;
        if (op.w !== undefined) el.w = op.w;
        if (op.h !== undefined) el.h = op.h;
        el.props = { ...el.props, ...(op.props ?? {}) };
        newEls.push(el);
      } else if (op.op === 'patch') {
        newEls = newEls.map((e) => e.id === op.id ? { ...e, ...op.patch } : e);
      } else if (op.op === 'patchProps') {
        newEls = newEls.map((e) => e.id === op.id ? { ...e, props: { ...e.props, ...op.props } } : e);
      } else if (op.op === 'delete') {
        newEls = newEls.filter((e) => e.id !== op.id);
      } else if (op.op === 'clearAll') {
        newEls = [];
      } else if (op.op === 'duplicate') {
        const el = newEls.find((e) => e.id === op.id);
        if (el) newEls.push({ ...el, id: `el-${Date.now()}-${Math.random().toString(36).slice(2)}`, x: el.x + 20, y: el.y + 20, props: { ...el.props } });
      } else if (op.op === 'alignH') {
        newEls = newEls.map((e) => {
          if (e.id !== op.id) return e;
          const x = op.align === 'left' ? 0 : op.align === 'center' ? (stageW - e.w) / 2 : stageW - e.w;
          return { ...e, x: Math.round(x) };
        });
      } else if (op.op === 'alignV') {
        newEls = newEls.map((e) => {
          if (e.id !== op.id) return e;
          const y = op.align === 'top' ? 0 : op.align === 'middle' ? (stageH - e.h) / 2 : stageH - e.h;
          return { ...e, y: Math.round(y) };
        });
      }
    }
    commit(newEls, elements);
  }, [elements, stageW, stageH, commit]);

  const sendDesignCommand = async () => {
    if (!aiAssistCmd.trim() || aiAssistLoading) return;
    setAiAssistLoading(true);
    try {
      const res = await fetch('/api/storybook/design-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: aiAssistCmd, elements, stageW, stageH }),
      });
      const data = await res.json() as { ops?: DesignOp[]; stub?: boolean };
      if (Array.isArray(data.ops) && data.ops.length) {
        applyDesignOps(data.ops);
        setAiAssistCmd('');
      }
    } catch { /* ignore */ }
    setAiAssistLoading(false);
  };

  // S-D9.01 — AI Background Remover
  const handleRemoveBg = async () => {
    if (!selected || selected.type !== 'image') return;
    const imageUrl = String(selected.props.src || selected.props.url || '');
    if (!imageUrl) return;

    // Convert URL to b64
    let image_b64: string;
    try {
      if (imageUrl.startsWith('data:')) {
        image_b64 = imageUrl.split(',')[1];
      } else {
        const r = await fetch(imageUrl);
        const blob = await r.blob();
        image_b64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string).split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      }
    } catch { return; }

    const response = await fetch('/api/storybook/remove-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64 }),
    });
    const data = await response.json() as { ok?: boolean; image_b64?: string; error?: string; stub?: boolean };
    if (data.ok && data.image_b64 && !data.stub) {
      patchProps(selected.id, { src: `data:image/png;base64,${data.image_b64}` });
    }
  };

  // S-D9.02/03 — apply retouch result back to the element
  const handleRetouchApply = (resultB64: string) => {
    if (!retouchEl) return;
    patchProps(retouchEl.el.id, { src: `data:image/png;base64,${resultB64}` });
    setRetouchEl(null);
  };

  // S-D9.06 — canvas resize (scales all elements proportionally)
  const changeCanvasSize = (v: string) => {
    const parts = v.split('x');
    if (parts.length !== 2) return;
    const [w, h] = parts.map(Number);
    if (!w || !h) return;
    const scaleX = w / stageW;
    const scaleY = h / stageH;
    setStageW(w);
    setStageH(h);
    if (elements.length) {
      commit(elements.map((el) => ({
        ...el,
        x: Math.round(el.x * scaleX),
        y: Math.round(el.y * scaleY),
        w: Math.round(el.w * scaleX),
        h: Math.round(el.h * scaleY),
      })), elements);
    }
  };

  const bgSrc = bgStoryId && bgSlot
    ? (bgSlot === 'cover' ? `/api/stories/${bgStoryId}/cover` : `/api/stories/${bgStoryId}/page/${bgSlot}`)
    : '';

  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvasMenuPos, setCanvasMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Derived: first selected element (for Inspector)
  const selectedId = selectedIds[0] ?? null;
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const selectedSpec = selected ? registry.get(selected.type) : undefined;

  // ── Selection helpers (S-D9.11) ──────────────────────────────────────────
  const selectOne = useCallback((id: string) => setSelectedIds([id]), []);
  const toggleSelect = useCallback((id: string) => setSelectedIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]), []);
  const clearSelect = useCallback(() => setSelectedIds([]), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DesignerElement[];
        if (Array.isArray(parsed)) setElements(parsed);
      }
    } catch { /* ignore */ }
    try {
      const savedPresets = localStorage.getItem(LS_PRESETS);
      if (savedPresets) {
        const parsed = JSON.parse(savedPresets) as Preset[];
        if (Array.isArray(parsed)) setPresets(parsed);
      }
    } catch { /* ignore */ }
    void loadCommunityBlocks();
    fetch('/api/stories').then((r) => r.json()).then((list: StoryMeta[]) => {
      if (Array.isArray(list)) setStories(list);
    }).catch(() => {});
    try {
      const savedBg = JSON.parse(localStorage.getItem(LS_BG) || 'null');
      if (savedBg && savedBg.storyId) { setBgStoryId(savedBg.storyId); setBgSlot(savedBg.slot || 'cover'); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_BG, JSON.stringify(bgStoryId ? { storyId: bgStoryId, slot: bgSlot } : null)); } catch { /* */ }
    if (!bgSrc) { setBgImg(null); return; }
    let cancelled = false;
    const im = new window.Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { if (!cancelled) setBgImg(im); };
    im.onerror = () => { if (!cancelled) setBgImg(null); };
    im.src = bgSrc;
    return () => { cancelled = true; };
  }, [bgSrc, bgStoryId, bgSlot]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(elements)); } catch { /* */ }
  }, [elements]);

  useEffect(() => {
    try { localStorage.setItem(LS_PRESETS, JSON.stringify(presets)); } catch { /* */ }
  }, [presets]);

  // S-D9.11 — attach Transformer to ALL selected nodes
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, elements]);

  // ── History ───────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((s) => [...s, elements]);
    setUndoStack((s) => s.slice(0, -1));
    setElements(prev);
    clearSelect();
  }, [undoStack, elements, clearSelect]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, elements]);
    setRedoStack((s) => s.slice(0, -1));
    setElements(next);
    clearSelect();
  }, [redoStack, elements, clearSelect]);

  // ── Element operations ────────────────────────────────────────────────────

  const add = (type: string) => {
    const el = newElement(type);
    if (!el) return;
    el.x = 60 + (elements.length % 5) * 20;
    el.y = 60 + (elements.length % 5) * 20;
    commit([...elements, el], elements);
    selectOne(el.id);
  };

  const patch = (id: string, p: Partial<DesignerElement>) => {
    const newEls = elements.map((e) => (e.id === id ? { ...e, ...p } : e));
    commit(newEls, elements);
  };

  const patchProps = (id: string, p: Record<string, unknown>) => {
    const newEls = elements.map((e) => (e.id === id ? { ...e, props: { ...e.props, ...p } } : e));
    commit(newEls, elements);
  };

  // ── Flip & Rotate ─────────────────────────────────────────────────────────
  // scaleX=-1 stored as right-edge: x is stored at el.x+el.w so the Group
  // renders leftward and the bounding box stays in place at rotation=0.
  const flipHorizontal = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const curX = el.scaleX ?? 1;
    const newX = curX < 0 ? 1 : -1;
    patch(id, { scaleX: newX, x: curX < 0 ? el.x - el.w : el.x + el.w });
  };

  const flipVertical = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const curY = el.scaleY ?? 1;
    const newY = curY < 0 ? 1 : -1;
    patch(id, { scaleY: newY, y: curY < 0 ? el.y - el.h : el.y + el.h });
  };

  const rotate90CW  = (id: string) => { const el = elements.find((e) => e.id === id); if (!el) return; patch(id, { rotation: ((el.rotation ?? 0) + 90) % 360 }); };
  const rotate90CCW = (id: string) => { const el = elements.find((e) => e.id === id); if (!el) return; patch(id, { rotation: ((el.rotation ?? 0) - 90 + 360) % 360 }); };
  const rotate180   = (id: string) => { const el = elements.find((e) => e.id === id); if (!el) return; patch(id, { rotation: ((el.rotation ?? 0) + 180) % 360 }); };
  const resetTransforms = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    // Restore el.x to true left-edge when currently flipped
    const trueX = (el.scaleX ?? 1) < 0 ? el.x - el.w : el.x;
    const trueY = (el.scaleY ?? 1) < 0 ? el.y - el.h : el.y;
    patch(id, { rotation: 0, scaleX: 1, scaleY: 1, x: trueX, y: trueY });
  };

  // ── Text-only flip (toggles props.textFlipH / textFlipV, countered in element renderers) ──
  const flipTextH = (id: string) => { const el = elements.find((e) => e.id === id); if (!el) return; patchProps(id, { textFlipH: !el.props.textFlipH }); };
  const flipTextV = (id: string) => { const el = elements.find((e) => e.id === id); if (!el) return; patchProps(id, { textFlipV: !el.props.textFlipV }); };
  const resetTextFlips = (id: string) => patchProps(id, { textFlipH: false, textFlipV: false });

  // S-D9.11 — delete all selected
  const removeSel = () => {
    if (!selectedIds.length) return;
    commit(elements.filter((e) => !selectedIds.includes(e.id)), elements);
    clearSelect();
  };

  // S-D9.11 — duplicate all selected
  const duplicate = () => {
    const targets = selectedIds.length
      ? elements.filter((e) => selectedIds.includes(e.id))
      : (selected ? [selected] : []);
    if (!targets.length) return;
    const copies = targets.map((t) => ({ ...t, id: `el-${Date.now()}-${Math.random().toString(36).slice(2)}`, x: t.x + 20, y: t.y + 20, props: { ...t.props } }));
    commit([...elements, ...copies], elements);
    setSelectedIds(copies.map((c) => c.id));
  };

  const clearAll = () => { commit([], elements); clearSelect(); };

  // ── Layer ops + clipboard + context menu ──────────────────────────────────
  const toggleHidden = (id: string) => patch(id, { hidden: !elements.find((e) => e.id === id)?.hidden });
  const toggleLocked = (id: string) => patch(id, { locked: !elements.find((e) => e.id === id)?.locked });
  const deleteById = (id: string) => { commit(elements.filter((e) => e.id !== id), elements); setSelectedIds((s) => s.filter((x) => x !== id)); };
  const duplicateById = (id: string) => {
    const el = elements.find((e) => e.id === id); if (!el) return;
    const copy = { ...el, id: `el-${Date.now()}`, x: el.x + 20, y: el.y + 20, props: { ...el.props } };
    commit([...elements, copy], elements); selectOne(copy.id);
  };
  const renameById = (id: string, name: string) => patch(id, { name: name || undefined });
  const copyById = (id: string) => { const el = elements.find((e) => e.id === id); if (el) setClipboard({ ...el, props: { ...el.props } }); };
  const paste = () => {
    if (!clipboard) return;
    const copy = { ...clipboard, id: `el-${Date.now()}`, x: clipboard.x + 24, y: clipboard.y + 24, props: { ...clipboard.props } };
    commit([...elements, copy], elements); selectOne(copy.id);
  };
  const closeMenu = () => { setMenuAnchor(null); setMenuElId(null); setCanvasMenuPos(null); };

  const [saving, setSaving] = useState(false);
  const saveDesignToStory = useCallback(async () => {
    if (!bgStoryId || !bgSlot) {
      window.alert('Select a story and page in the Page Background section first, then Save.');
      return;
    }
    setSaving(true);
    try {
      let b64: string;
      if (dsMode === 'ai' && editSrc) {
        b64 = editSrc.replace(/^data:image\/[^;]+;base64,/, '');
      } else {
        const stage = stageRef.current;
        if (!stage) return;
        const dataUrl = stage.toDataURL({ pixelRatio: 2 });
        b64 = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
      }
      await fetch(`/api/stories/${bgStoryId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: bgSlot, image_b64: b64 }),
      });
    } finally {
      setSaving(false);
    }
  }, [bgStoryId, bgSlot, dsMode, editSrc]);

  const menuEl = elements.find((e) => e.id === menuElId) || null;
  const shapeFlipChildren: ContextMenuItem[] = menuEl ? [
    { id: 'srot90ccw', label: 'Rotate 90° Left',  icon: <UndoIcon size={14} />,    iconColor: '#f59e0b', onClick: () => { rotate90CCW(menuEl.id); closeMenu(); } },
    { id: 'srot90cw',  label: 'Rotate 90° Right', icon: <RotateCWIcon size={14} />, iconColor: '#f59e0b', onClick: () => { rotate90CW(menuEl.id);  closeMenu(); } },
    { id: 'srot180',   label: 'Rotate 180°',       icon: <RotateCWIcon size={14} style={{ opacity: 0.6 }} />, iconColor: '#f59e0b', onClick: () => { rotate180(menuEl.id); closeMenu(); } },
    { id: 'sfsep1',    label: '', separator: true },
    { id: 'sfliph',    label: 'Flip Horizontal',   icon: <FlipHIcon size={14} />,   iconColor: '#0ea5e9', onClick: () => { flipHorizontal(menuEl.id); closeMenu(); } },
    { id: 'sflipv',    label: 'Flip Vertical',     icon: <FlipVIcon size={14} />,   iconColor: '#0ea5e9', onClick: () => { flipVertical(menuEl.id);   closeMenu(); } },
    { id: 'sfsep2',    label: '', separator: true },
    { id: 'sresettr',  label: 'Reset Transforms',  icon: <ResetIcon size={14} />,   iconColor: '#94a3b8', onClick: () => { resetTransforms(menuEl.id); closeMenu(); } },
  ] : [];

  const textFlipChildren: ContextMenuItem[] = menuEl ? [
    { id: 'trot90ccw', label: 'Rotate 90° Left',  icon: <UndoIcon size={14} />,    iconColor: '#f59e0b', onClick: () => { rotate90CCW(menuEl.id); closeMenu(); } },
    { id: 'trot90cw',  label: 'Rotate 90° Right', icon: <RotateCWIcon size={14} />, iconColor: '#f59e0b', onClick: () => { rotate90CW(menuEl.id);  closeMenu(); } },
    { id: 'trot180',   label: 'Rotate 180°',       icon: <RotateCWIcon size={14} style={{ opacity: 0.6 }} />, iconColor: '#f59e0b', onClick: () => { rotate180(menuEl.id); closeMenu(); } },
    { id: 'tfsep1',    label: '', separator: true },
    { id: 'tfliph',    label: 'Flip Horizontal',   icon: <FlipHIcon size={14} />,   iconColor: '#a78bfa', onClick: () => { flipTextH(menuEl.id); closeMenu(); } },
    { id: 'tflipv',    label: 'Flip Vertical',     icon: <FlipVIcon size={14} />,   iconColor: '#a78bfa', onClick: () => { flipTextV(menuEl.id);  closeMenu(); } },
    { id: 'tfsep2',    label: '', separator: true },
    { id: 'tresettr',  label: 'Reset Text',        icon: <ResetIcon size={14} />,   iconColor: '#94a3b8', onClick: () => { resetTextFlips(menuEl.id); closeMenu(); } },
  ] : [];

  const layerMenuItems: ContextMenuItem[] = menuEl ? [
    { id: 'dup',  label: 'Duplicate', icon: <DuplicateIcon size={14} />, iconColor: '#6366f1', shortcut: '⌘D', onClick: () => duplicateById(menuEl.id) },
    { id: 'copy', label: 'Copy',      icon: <CopyIcon size={14} />,      iconColor: '#8b5cf6', shortcut: '⌘C', onClick: () => copyById(menuEl.id) },
    { id: 'paste',label: 'Paste',     icon: <PasteIcon size={14} />,     iconColor: '#64748b', shortcut: '⌘V', disabled: !clipboard, onClick: () => paste() },
    { id: 'sep1', label: '', separator: true },
    {
      id: 'flip', label: 'Flip & Rotate', icon: <FlipHIcon size={14} />, iconColor: '#0ea5e9',
      children: [
        { id: 'flip-shape', label: 'Shape', icon: <FlipVIcon size={14} />, iconColor: '#0ea5e9', children: shapeFlipChildren },
        { id: 'flip-text',  label: 'Text',  icon: <FlipHIcon size={14} />, iconColor: '#a78bfa', children: textFlipChildren  },
      ],
    },
    { id: 'sep2', label: '', separator: true },
    { id: 'vis',  label: menuEl.hidden ? 'Show' : 'Hide', icon: menuEl.hidden ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />, iconColor: '#f59e0b', onClick: () => toggleHidden(menuEl.id) },
    { id: 'lock', label: menuEl.locked ? 'Unlock' : 'Lock', icon: <LockIcon size={14} />, iconColor: '#eab308', onClick: () => toggleLocked(menuEl.id) },
    { id: 'sep3', label: '', separator: true },
    { id: 'front', label: 'Bring to front', icon: <ArrowUpIcon size={14} />, iconColor: '#10b981', onClick: () => { const i = elements.findIndex((e) => e.id === menuEl.id); reorder(i, elements.length - 1); closeMenu(); } },
    { id: 'back',  label: 'Send to back',   icon: <ArrowDownIcon size={14} />, iconColor: '#14b8a6', onClick: () => { const i = elements.findIndex((e) => e.id === menuEl.id); reorder(i, 0); closeMenu(); } },
    { id: 'sep4', label: '', separator: true },
    { id: 'del',  label: 'Delete', icon: <TrashIcon size={14} />, danger: true, shortcut: 'Del', onClick: () => deleteById(menuEl.id) },
  ] : [];

  // ── Presets (S-D6) ───────────────────────────────────────────────────────
  const savePreset = () => {
    if (!selected) return;
    const label = selectedSpec?.palette.label ?? selected.type;
    const name = window.prompt('Save as preset — name:', label);
    if (!name) return;
    setPresets((ps) => [...ps, { name, el: { ...selected, props: { ...selected.props } } }]);
  };

  const applyPreset = (p: Preset) => {
    const el: DesignerElement = {
      ...p.el,
      id: `el-${Date.now()}`,
      x: 60 + (elements.length % 5) * 20,
      y: 60 + (elements.length % 5) * 20,
      props: { ...p.el.props },
    };
    commit([...elements, el], elements);
    selectOne(el.id);
  };

  const deletePreset = (idx: number) => setPresets((ps) => ps.filter((_, i) => i !== idx));

  // ── Page templates (S-D6) ────────────────────────────────────────────────
  const applyTemplate = (tpl: { name: string; elements: DesignerElement[] }) => {
    const stamp = tpl.elements.map((e) => ({
      ...e,
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    commit(stamp, elements);
    clearSelect();
  };

  // ── Transient patch (no undo — used for drag/resize) ─────────────────────
  const patchNoHistory = (id: string, p: Partial<DesignerElement>) => {
    setElements((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)));
  };

  // ── Z-order ───────────────────────────────────────────────────────────────
  const reorder = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= elements.length) return;
    const newEls = [...elements];
    const [item] = newEls.splice(fromIdx, 1);
    newEls.splice(toIdx, 0, item);
    commit(newEls, elements);
  };

  const bringForward = () => { const idx = elements.findIndex((e) => e.id === selectedId); if (idx < 0) return; reorder(idx, idx + 1); };
  const sendBack    = () => { const idx = elements.findIndex((e) => e.id === selectedId); if (idx < 0) return; reorder(idx, idx - 1); };
  const bringToFront = () => { const idx = elements.findIndex((e) => e.id === selectedId); if (idx < 0) return; reorder(idx, elements.length - 1); };
  const sendToBack   = () => { const idx = elements.findIndex((e) => e.id === selectedId); if (idx < 0) return; reorder(idx, 0); };

  // ── Align ─────────────────────────────────────────────────────────────────
  const alignH = (a: 'left' | 'center' | 'right') => {
    if (!selected) return;
    const x = a === 'left' ? 0 : a === 'center' ? (stageW - selected.w) / 2 : stageW - selected.w;
    patch(selected.id, { x: Math.round(x) });
  };

  const alignV = (a: 'top' | 'middle' | 'bottom') => {
    if (!selected) return;
    const y = a === 'top' ? 0 : a === 'middle' ? (stageH - selected.h) / 2 : stageH - selected.h;
    patch(selected.id, { y: Math.round(y) });
  };

  // ── S-D9.15 — Auto-layout ─────────────────────────────────────────────────
  const distributeH = () => {
    const els = (selectedIds.length >= 2 ? selectedIds : elements.map((e) => e.id))
      .map((id) => elements.find((e) => e.id === id)).filter(Boolean) as DesignerElement[];
    if (els.length < 2) return;
    const sorted = [...els].sort((a, b) => a.x - b.x);
    const leftEdge = sorted[0].x;
    const rightEdge = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w;
    const totalW = sorted.reduce((s, e) => s + e.w, 0);
    const gap = (rightEdge - leftEdge - totalW) / Math.max(1, sorted.length - 1);
    const positions: Record<string, number> = {};
    let cur = leftEdge;
    for (const el of sorted) { positions[el.id] = cur; cur += el.w + gap; }
    commit(elements.map((e) => positions[e.id] !== undefined ? { ...e, x: Math.round(positions[e.id]) } : e), elements);
  };

  const distributeV = () => {
    const els = (selectedIds.length >= 2 ? selectedIds : elements.map((e) => e.id))
      .map((id) => elements.find((e) => e.id === id)).filter(Boolean) as DesignerElement[];
    if (els.length < 2) return;
    const sorted = [...els].sort((a, b) => a.y - b.y);
    const topEdge = sorted[0].y;
    const bottomEdge = sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
    const totalH = sorted.reduce((s, e) => s + e.h, 0);
    const gap = (bottomEdge - topEdge - totalH) / Math.max(1, sorted.length - 1);
    const positions: Record<string, number> = {};
    let cur = topEdge;
    for (const el of sorted) { positions[el.id] = cur; cur += el.h + gap; }
    commit(elements.map((e) => positions[e.id] !== undefined ? { ...e, y: Math.round(positions[e.id]) } : e), elements);
  };

  const tidyGrid = () => {
    const els = (selectedIds.length >= 2 ? selectedIds : elements.map((e) => e.id))
      .map((id) => elements.find((e) => e.id === id)).filter(Boolean) as DesignerElement[];
    if (els.length < 2) return;
    const cols = Math.ceil(Math.sqrt(els.length));
    const GAP = 20;
    const maxW = Math.max(...els.map((e) => e.w));
    const maxH = Math.max(...els.map((e) => e.h));
    const positions: Record<string, { x: number; y: number }> = {};
    els.forEach((el, i) => {
      positions[el.id] = { x: 40 + (i % cols) * (maxW + GAP), y: 40 + Math.floor(i / cols) * (maxH + GAP) };
    });
    commit(elements.map((e) => positions[e.id] ? { ...e, ...positions[e.id] } : e), elements);
  };

  // ── S-D9.11 — Snap guide calculation during drag ──────────────────────────
  const handleDragMove = useCallback((el: DesignerElement, node: Konva.Node) => {
    if (el.locked) return;
    let nx = node.x();
    let ny = node.y();
    const cx = nx + el.w / 2;
    const cy = ny + el.h / 2;
    const guides: SnapGuide[] = [];

    // Canvas center snaps
    if (Math.abs(cx - stageW / 2) < SNAP_THRESHOLD) { nx = stageW / 2 - el.w / 2; guides.push({ x: stageW / 2 }); }
    if (Math.abs(cy - stageH / 2) < SNAP_THRESHOLD) { ny = stageH / 2 - el.h / 2; guides.push({ y: stageH / 2 }); }
    // Canvas edges
    if (Math.abs(nx) < SNAP_THRESHOLD)              { nx = 0; guides.push({ x: 0 }); }
    if (Math.abs(nx + el.w - stageW) < SNAP_THRESHOLD) { nx = stageW - el.w; guides.push({ x: stageW }); }
    if (Math.abs(ny) < SNAP_THRESHOLD)              { ny = 0; guides.push({ y: 0 }); }
    if (Math.abs(ny + el.h - stageH) < SNAP_THRESHOLD) { ny = stageH - el.h; guides.push({ y: stageH }); }

    // Snap to other elements
    for (const other of elements) {
      if (other.id === el.id || other.hidden) continue;
      const snapXs = [other.x, other.x + other.w, other.x + other.w / 2];
      const snapYs = [other.y, other.y + other.h, other.y + other.h / 2];
      for (const sx of snapXs) {
        if (Math.abs(nx - sx) < SNAP_THRESHOLD)             { nx = sx;          guides.push({ x: sx }); }
        if (Math.abs(nx + el.w - sx) < SNAP_THRESHOLD)      { nx = sx - el.w;   guides.push({ x: sx }); }
        if (Math.abs(nx + el.w / 2 - sx) < SNAP_THRESHOLD)  { nx = sx - el.w/2; guides.push({ x: sx }); }
      }
      for (const sy of snapYs) {
        if (Math.abs(ny - sy) < SNAP_THRESHOLD)             { ny = sy;          guides.push({ y: sy }); }
        if (Math.abs(ny + el.h - sy) < SNAP_THRESHOLD)      { ny = sy - el.h;   guides.push({ y: sy }); }
        if (Math.abs(ny + el.h / 2 - sy) < SNAP_THRESHOLD)  { ny = sy - el.h/2; guides.push({ y: sy }); }
      }
    }
    node.x(nx); node.y(ny);
    setSnapGuides(guides);
  }, [elements, stageW, stageH]);

  // ── S-D9.11 — Marquee (drag-select on empty canvas) ──────────────────────
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) return;
    const pos = e.target.getStage()!.getPointerPosition()!;
    marqueeStart.current = { x: pos.x / zoom, y: pos.y / zoom };
    if (!e.evt.shiftKey) clearSelect();
  }, [zoom, clearSelect]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!marqueeStart.current) return;
    const pos = e.target.getStage()!.getPointerPosition()!;
    const mx = pos.x / zoom; const my = pos.y / zoom;
    setMarquee({
      x1: Math.min(marqueeStart.current.x, mx),
      y1: Math.min(marqueeStart.current.y, my),
      x2: Math.max(marqueeStart.current.x, mx),
      y2: Math.max(marqueeStart.current.y, my),
    });
  }, [zoom]);

  const handleStageMouseUp = useCallback(() => {
    if (marqueeStart.current && marquee) {
      const hit = elements
        .filter((el) => !el.hidden && !el.locked)
        .filter((el) => el.x < marquee.x2 && el.x + el.w > marquee.x1 && el.y < marquee.y2 && el.y + el.h > marquee.y1)
        .map((el) => el.id);
      if (hit.length) setSelectedIds((prev) => [...new Set([...prev, ...hit])]);
    }
    marqueeStart.current = null;
    setMarquee(null);
  }, [marquee, elements]);

  // ── AI Edit ───────────────────────────────────────────────────────────────
  const startEdit = async () => {
    if (bgSrc) { setEditSrc(bgSrc); return; }
    try {
      const list = await fetch('/api/stories').then((r) => r.json());
      const first = Array.isArray(list) ? list.find((s: { archived?: boolean }) => !s.archived) || list[0] : null;
      setEditSrc(first ? `/api/stories/${first.id}/cover` : '');
    } catch { setEditSrc(''); }
  };

  // ── JSON import (S-D8) ───────────────────────────────────────────────────
  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const els: DesignerElement[] = Array.isArray(data) ? data : (data?.elements ?? []);
        if (!els.length) return;
        commit(els, elements);
        clearSelect();
      } catch { /* ignore bad JSON */ }
    };
    reader.readAsText(file);
  };

  // ── Keyboard shortcuts + arrow nudge (S-D8) ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicate(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedIds.length) { e.preventDefault(); removeSel(); } }
      if (e.key === 'Escape') clearSelect();
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSelectedIds(elements.filter((el) => !el.locked && !el.hidden).map((el) => el.id)); }
      if (selectedId && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setElements((es) => es.map((el) => selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedId, selectedIds, elements]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Palette categories ────────────────────────────────────────────────────
  type PaletteItem = { key: string; icon: string; label: string; onClick: () => void; onDelete?: () => void };
  const q = paletteSearch.trim().toLowerCase();
  const allCats: { id: string; label: string; items: PaletteItem[] }[] = [
    { id: 'Page Templates', label: 'Page Templates', items: PAGE_TEMPLATES.map((tpl) => ({ key: `tpl-${tpl.name}`, icon: '📄', label: tpl.name, onClick: () => applyTemplate(tpl) })) },
    ...registry.groups().map((g) => ({ id: g.group, label: g.group, items: g.specs.map((s) => ({ key: s.type, icon: String(s.palette.icon), label: s.palette.label, onClick: () => add(s.type) })) })),
    ...(presets.length ? [{ id: 'My Presets', label: 'My Presets', items: presets.map((p, i) => ({ key: `preset-${i}`, icon: String(registry.get(p.el.type)?.palette.icon ?? '★'), label: p.name, onClick: () => applyPreset(p), onDelete: () => deletePreset(i) })) }] : []),
  ];
  const paletteCats = allCats
    .map((c) => ({ ...c, items: q ? c.items.filter((it) => it.label.toLowerCase().includes(q)) : c.items }))
    .filter((c) => c.items.length > 0);
  const paletteTotal = paletteCats.reduce((s, c) => s + c.items.length, 0);
  const SPLIT_ACCENT = 'var(--story-accent-3)';

  const leftPaletteEl = (
    <aside className="set-sidebar ds-palette-v2">
      <SplitPanelView
        direction="vertical"
        defaultSplit={52}
        minFirstPct={18}
        minSecondPct={18}
        accentColor={SPLIT_ACCENT}
        style={{ flex: 1, minHeight: 0, width: '100%' }}
        first={
          <div className="ds-palette-top">
            <div className="set-search-wrap">
              <SearchInputView value={paletteSearch} onChange={setPaletteSearch} placeholder="Search elements…" size="md"
                prefix={<SearchIcon size={13} />}
                suffix={!paletteSearch && paletteTotal > 0 ? <span className="set-search-count">{paletteTotal}</span> : undefined} />
            </div>
            {!paletteSearch && (
              <div className="ds-bg-section">
                <div className="ds-bg-label">Page Background</div>
                <label className="ds-bg-field"><span>Story</span>
                  <SelectInputView options={[{ value: '', label: stories.length ? '— pick a story —' : 'No saved stories yet' }, ...stories.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.title }))]}
                    value={bgStoryId} onChange={(v) => { setBgStoryId(v); setBgSlot(v ? 'cover' : ''); }} size="sm" width="fw" />
                </label>
                <label className="ds-bg-field"><span>Page</span>
                  <SelectInputView options={[{ value: 'cover', label: 'Cover' }, ...Array.from({ length: stories.find((s) => s.id === bgStoryId)?.pageCount ?? 0 }, (_, i) => ({ value: String(i + 1), label: `Page ${i + 1}` }))]}
                    value={bgSlot} onChange={(v) => setBgSlot(v)} size="sm" width="fw" disabled={!bgStoryId} />
                </label>
                <ButtonView size="sm" variant="secondary" accentColor="#f87171" iconLeft={<TrashIcon size={13} />}
                  disabled={!bgStoryId} onClick={() => { setBgStoryId(''); setBgSlot(''); }} style={{ width: '100%', justifyContent: 'center' }}>
                  Remove background
                </ButtonView>
              </div>
            )}
            {/* ── S-D9.04 — AI Image Generation ─────────────────────────── */}
            {!paletteSearch && (
              <div className="ds-bg-section">
                <div className="ds-bg-label">✨ AI Generate Image</div>
                <div className="ds-ai-gen-field">
                  <TextInputView
                    size="sm"
                    value={aiGenPrompt}
                    onChange={(e) => setAiGenPrompt((e.target as HTMLInputElement).value)}
                    placeholder="Describe an image…"
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void generateAIImage(); }}
                  />
                  <ButtonView
                    size="sm"
                    variant="primary"
                    disabled={!aiGenPrompt.trim() || aiGenLoading}
                    onClick={() => void generateAIImage()}
                    title="Generate AI image and add to canvas"
                  >
                    {aiGenLoading ? '…' : '↗'}
                  </ButtonView>
                </div>
              </div>
            )}
            {/* ── S-D9.13 — Emoji Library ────────────────────────────────── */}
            {!paletteSearch && (
              <div className="ds-emoji-section">
                <div className="ds-bg-label">Emoji Library</div>
                {emojiFavs.length > 0 && (
                  <div className="ds-emoji-cat">
                    <span className="ds-emoji-cat-label">⭐ Favourites</span>
                    <div className="ds-emoji-grid">
                      {emojiFavs.map((em) => (
                        <button
                          key={em}
                          className="ds-emoji-btn"
                          title={`${em} · right-click to unfavourite`}
                          onClick={() => addSticker(em)}
                          onContextMenu={(e) => { e.preventDefault(); removeEmojiFromFavs(em); }}
                        >{em}</button>
                      ))}
                    </div>
                  </div>
                )}
                {EMOJI_LIBRARY.map((cat) => {
                  const isCatCollapsed = emojiCollapsed.has(cat.cat);
                  return (
                    <div key={cat.cat} className="ds-emoji-cat">
                      <button type="button" className="ds-emoji-cat-toggle" onClick={() => toggleEmojiCat(cat.cat)}>
                        <ChevronRightIcon size={9} style={{ flexShrink: 0, opacity: 0.5, transform: isCatCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 140ms' }} />
                        {cat.cat}
                      </button>
                      {!isCatCollapsed && (
                        <div className="ds-emoji-grid">
                          {cat.items.map((em) => (
                            <button
                              key={em}
                              className="ds-emoji-btn"
                              title={`${em} · right-click to favourite`}
                              onClick={() => addSticker(em)}
                              onContextMenu={(e) => { e.preventDefault(); addEmojiToFavs(em); }}
                            >{em}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        }
        second={
          <div className="ds-palette-bottom">
            <div className="set-nav-list">
              {paletteCats.length === 0 && <div className="set-nav-empty">No elements match "{paletteSearch}"</div>}
              {paletteCats.map((cat) => {
                const isCollapsed = paletteCollapsed.has(cat.id);
                return (
                  <div key={cat.id}>
                    <button type="button" className="set-group-btn" onClick={() => togglePaletteCat(cat.id)}>
                      <ChevronRightIcon size={9} style={{ flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.5, transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 140ms ease' }} />
                      <span className="set-group-label">{cat.label}</span>
                      <span className="set-group-count">{cat.items.length}</span>
                    </button>
                    {!isCollapsed && cat.items.map((it) => (
                      <div key={it.key} className="ds-nav-row">
                        <button className="set-nav ds-nav-add" onClick={it.onClick} title={it.label}>
                          <span className="set-nav-icon">{it.icon}</span>{it.label}
                        </button>
                        {it.onDelete && <button className="ds-preset-del" title="Delete preset" onClick={it.onDelete}>✕</button>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        }
      />
    </aside>
  );

  const canvasEl = (
    <div className="ds-canvas-wrap">
      <div className="ds-canvas-scroll">
        <Stage
          ref={stageRef}
          width={stageW * zoom} height={stageH * zoom} scaleX={zoom} scaleY={zoom} className="ds-stage"
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
          <Layer>
            {bgImg
              ? <KImage image={bgImg} x={0} y={0} width={stageW} height={stageH} cornerRadius={10} shadowBlur={18} shadowOpacity={0.25} listening={false} />
              : <Rect x={0} y={0} width={stageW} height={stageH} fill="#fffdf3" cornerRadius={10} shadowBlur={18} shadowOpacity={0.25} />}
            {elements.map((el) => {
              const spec = registry.get(el.type);
              if (!spec || el.hidden) return null;
              return (
                <Group
                  key={el.id}
                  x={el.x} y={el.y} rotation={el.rotation}
                  scaleX={el.scaleX ?? 1} scaleY={el.scaleY ?? 1}
                  draggable={!el.locked}
                  opacity={el.opacity ?? 1}
                  globalCompositeOperation={(el.blendMode ?? 'source-over') as GlobalCompositeOperation}
                  ref={(n) => { if (n) nodeRefs.current.set(el.id, n); else nodeRefs.current.delete(el.id); }}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    if (!el.locked) selectOne(el.id);
                    setMenuElId(el.id);
                    setCanvasMenuPos({ x: e.evt.clientX, y: e.evt.clientY });
                  }}
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                    if (el.locked) return;
                    if (e.evt.shiftKey) toggleSelect(el.id);
                    else selectOne(el.id);
                  }}
                  onTap={() => { if (!el.locked) selectOne(el.id); }}
                  onDragMove={(e) => handleDragMove(el, e.target as Konva.Node)}
                  onDragEnd={(e) => {
                    patchNoHistory(el.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
                    setSnapGuides([]);
                  }}
                  onTransformEnd={(e) => {
                    const n = e.target;
                    const sx = n.scaleX(); const sy = n.scaleY();
                    const flipX = sx < 0 ? -1 : 1;
                    const flipY = sy < 0 ? -1 : 1;
                    n.scaleX(flipX); n.scaleY(flipY);
                    patchNoHistory(el.id, {
                      x: Math.round(n.x()), y: Math.round(n.y()),
                      rotation: Math.round(n.rotation()),
                      w: Math.max(10, Math.round(el.w * Math.abs(sx))),
                      h: Math.max(10, Math.round(el.h * Math.abs(sy))),
                      scaleX: flipX, scaleY: flipY,
                    });
                  }}
                >
                  {spec.render(el)}
                </Group>
              );
            })}
            <Transformer ref={trRef} rotateEnabled keepRatio={false} anchorSize={9} borderStroke="#7c3aed" anchorStroke="#7c3aed" />
            {/* S-D9.11 — Snap guide lines */}
            {snapGuides.filter((g) => g.x !== undefined).map((g, i) => (
              <Line key={`sg-x-${i}`} points={[g.x!, 0, g.x!, stageH]} stroke="#7c3aed" strokeWidth={1} dash={[4, 4]} listening={false} />
            ))}
            {snapGuides.filter((g) => g.y !== undefined).map((g, i) => (
              <Line key={`sg-y-${i}`} points={[0, g.y!, stageW, g.y!]} stroke="#7c3aed" strokeWidth={1} dash={[4, 4]} listening={false} />
            ))}
            {/* S-D9.11 — Marquee selection rect */}
            {marquee && (
              <Rect
                x={marquee.x1} y={marquee.y1}
                width={marquee.x2 - marquee.x1} height={marquee.y2 - marquee.y1}
                stroke="#7c3aed" strokeWidth={1.5} fill="rgba(124,58,237,0.07)"
                dash={[5, 4]} listening={false}
              />
            )}
          </Layer>
        </Stage>
      </div>
      {/* S-D9.16 — AI Design Assistant input strip */}
      {aiAssistOpen && (
        <div className="ds-ai-assist-strip">
          <span className="ds-ai-assist-label"><AgentIcon size={16} /></span>
          <TextInputView
            size="sm"
            value={aiAssistCmd}
            onChange={(e) => setAiAssistCmd((e.target as HTMLInputElement).value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') void sendDesignCommand();
              if (e.key === 'Escape') setAiAssistOpen(false);
              e.stopPropagation();
            }}
            placeholder='Describe a change… e.g. "Add a big purple title at the top"'
            style={{ flex: 1 }}
          />
          <ButtonView size="sm" variant="primary" disabled={!aiAssistCmd.trim() || aiAssistLoading} onClick={() => void sendDesignCommand()}>
            {aiAssistLoading ? '…' : 'Apply'}
          </ButtonView>
          <ButtonView size="sm" variant="secondary" onClick={() => setAiAssistOpen(false)}>✕</ButtonView>
        </div>
      )}
      <div className="ds-zoombar">
        <span className="ds-canvas-status">
          {selectedIds.length > 1
            ? `${selectedIds.length} elements selected`
            : selected
            ? `${selectedSpec?.palette.label ?? selected.type} — x:${Math.round(selected.x)} y:${Math.round(selected.y)} w:${Math.round(selected.w)} h:${Math.round(selected.h)} °${Math.round(selected.rotation)}`
            : `${elements.length} element${elements.length !== 1 ? 's' : ''} · click to select · shift+click multi-select · drag empty to marquee`}
        </span>
        <div className="ds-zoom-ctl">
          <button className="ds-zoom-btn" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}>−</button>
          <div style={{ width: 130 }}>
            <SliderView size="sm" min={0.25} max={2} step={0.05} value={zoom} onChange={(v) => setZoom(v)} />
          </div>
          <button className="ds-zoom-btn" title="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>+</button>
          <button className="ds-zoom-pct" title="Reset to fit (100%)" onClick={() => setZoom(0.9)}>{Math.round(zoom / 0.9 * 100)}%</button>
        </div>
      </div>
    </div>
  );

  const rightPanelEl = (
    <aside className="ds-right">
      <div className="ds-right-tabs">
        <button className={`ds-right-tab${rightTab === 'layers' ? ' ds-right-tab-active' : ''}`} onClick={() => setRightTab('layers')}>Layers</button>
        <button className={`ds-right-tab${rightTab === 'inspector' ? ' ds-right-tab-active' : ''}`} onClick={() => setRightTab('inspector')}>Inspector</button>
      </div>
      <div className="ds-right-content">
        {rightTab === 'layers' ? (
          <LayersPanel
            elements={elements}
            selectedIds={selectedIds}
            onSelect={(id, shift) => shift ? toggleSelect(id) : selectOne(id)}
            onRename={renameById}
            onMoveUp={(idx) => reorder(idx, idx + 1)}
            onMoveDown={(idx) => reorder(idx, idx - 1)}
            onToggleHidden={toggleHidden}
            onDelete={deleteById}
            onOpenMenu={(id, anchor) => { setMenuElId(id); setMenuAnchor(anchor); }}
          />
        ) : (
          <Inspector
            selected={selected}
            spec={selectedSpec}
            onPatch={(p) => { if (selected) patch(selected.id, p); }}
            onPatchProps={(p) => { if (selected) patchProps(selected.id, p); }}
            onDelete={removeSel}
            onDuplicate={duplicate}
            onBringForward={bringForward}
            onSendBack={sendBack}
            onBringToFront={bringToFront}
            onSendToBack={sendToBack}
            onAlignH={alignH}
            onAlignV={alignV}
            onSavePreset={savePreset}
            onRemoveBg={selected?.type === 'image' ? handleRemoveBg : undefined}
            onOpenRetouch={selected?.type === 'image' ? (mode) => { if (selected) setRetouchEl({ el: selected, mode }); } : undefined}
          />
        )}
      </div>
    </aside>
  );

  // ── AI Edit panels (hook always mounted) ──────────────────────────────────
  const { leftPanel: aiLeft, centerPanel: aiCenter, rightPanel: aiRight, toolbarSlot: aiToolbarSlot, isWholeImage: aiIsWholeImage, engineLabel: aiEngineLabel } = useAIEdit(
    editSrc ?? '',
    { onApply: (b64) => setEditSrc(`data:image/png;base64,${b64}`), stageW, stageH },
  );
  const activeLeft   = dsMode === 'ai' ? aiLeft   : leftPaletteEl;
  const activeCenter = dsMode === 'ai' ? aiCenter : canvasEl;
  const activeRight  = dsMode === 'ai' ? aiRight  : rightPanelEl;

  const bodyEl = leftOpen ? (
    <SplitPanelView key={`split-dual-${dsMode}`} direction="horizontal" defaultSplit={22} minFirstPct={15} minSecondPct={70} accentColor={SPLIT_ACCENT} style={{ height: '100%', width: '100%' }}
      first={activeLeft}
      second={rightOpen
        ? <SplitPanelView key={`split-inner-${dsMode}`} direction="horizontal" defaultSplit={67} minFirstPct={62} minSecondPct={15} accentColor={SPLIT_ACCENT} style={{ height: '100%', width: '100%' }} first={activeCenter} second={activeRight} />
        : activeCenter} />
  ) : rightOpen ? (
    <SplitPanelView key={`split-right-only-${dsMode}`} direction="horizontal" defaultSplit={72} minFirstPct={70} minSecondPct={15} accentColor={SPLIT_ACCENT} style={{ height: '100%', width: '100%' }} first={activeCenter} second={activeRight} />
  ) : (
    activeCenter
  );

  const hasMultiSel = selectedIds.length >= 2;

  return (
    <div className="ds-studio-v2">

      {/* ── Toolbar ── */}
      <div className="ds-toolbar">
        <div className="ds-toolbar-group">
          <IconButtonView size="sm" icon={<SidebarLeftIcon size={15} />} tooltip={leftOpen ? 'Hide left panel' : 'Show left panel'}
            accentColor={leftOpen ? 'var(--story-accent-3)' : 'var(--color-text-muted)'} onClick={() => setLeftOpen((v) => !v)} />
        </div>
        {dsMode === 'ai' && aiToolbarSlot}
        {dsMode === 'manual' && <>
          <div className="ds-toolbar-sep" />
          <div className="ds-toolbar-group">
            <ButtonView size="sm" variant="secondary" onClick={undo} disabled={!undoStack.length} title="Undo (⌘Z)">⟲ Undo</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={redo} disabled={!redoStack.length} title="Redo (⌘Y)">⟳ Redo</ButtonView>
          </div>
          <div className="ds-toolbar-sep" />
          <div className="ds-toolbar-group">
            <ButtonView size="sm" variant="secondary" onClick={duplicate} disabled={!selectedIds.length} title="Duplicate (⌘D)">Duplicate</ButtonView>
            <ButtonView size="sm" accentColor="#f87171" variant="secondary" onClick={removeSel} disabled={!selectedIds.length} title="Delete (Del)">Delete</ButtonView>
          </div>
          <div className="ds-toolbar-sep" />
          <div className="ds-toolbar-group ds-toolbar-label">Z-order:</div>
          <div className="ds-toolbar-group">
            <ButtonView size="sm" variant="secondary" onClick={bringToFront} disabled={!selected} title="Bring to front">⊤</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={bringForward} disabled={!selected} title="Bring forward">↑</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={sendBack} disabled={!selected} title="Send backward">↓</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={sendToBack} disabled={!selected} title="Send to back">⊥</ButtonView>
          </div>
          <div className="ds-toolbar-sep" />
          <div className="ds-toolbar-group ds-toolbar-label">Align:</div>
          <div className="ds-toolbar-group">
            <ButtonView size="sm" variant="secondary" onClick={() => alignH('left')} disabled={!selected} title="Left">⇤</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => alignH('center')} disabled={!selected} title="Center H">↔</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => alignH('right')} disabled={!selected} title="Right">⇥</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => alignV('top')} disabled={!selected} title="Top">⇡</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => alignV('middle')} disabled={!selected} title="Middle V">↕</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => alignV('bottom')} disabled={!selected} title="Bottom">⇣</ButtonView>
          </div>
          <div className="ds-toolbar-sep" />
          {/* S-D9.15 — Auto-layout distribute */}
          <div className="ds-toolbar-group ds-toolbar-label">Layout:</div>
          <div className="ds-toolbar-group">
            <ButtonView size="sm" variant="secondary" onClick={distributeH} disabled={!hasMultiSel} title="Distribute elements horizontally (equal spacing)">⇔ H</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={distributeV} disabled={!hasMultiSel} title="Distribute elements vertically (equal spacing)">⇕ V</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={tidyGrid} disabled={elements.length < 2} title="Tidy into grid">⊞ Grid</ButtonView>
          </div>
          <div className="ds-toolbar-sep" />
        </>}
        {/* S-D9.06 — Canvas size picker (Manual only) */}
        {dsMode === 'manual' && <>
          <div className="ds-toolbar-group ds-toolbar-label">Canvas:</div>
          <div className="ds-toolbar-group">
            <SelectInputView options={CANVAS_SIZES} value={`${stageW}x${stageH}`} onChange={changeCanvasSize} size="sm" />
          </div>
        </>}
        <div className="ds-toolbar-spacer" />
        {/* AI Edit mode warning in the toolbar — replaces the hidden manual controls */}
        {dsMode === 'ai' && aiIsWholeImage && (
          <div className="ds-toolbar-aiwarn">
            <ShieldIcon size={12} />
            <span><b>{aiEngineLabel}</b> rewrites the whole image — mask ignored. Switch to <b>FLUX.1-Fill</b> or <b>GPT Image 1</b> for precise edits.</span>
          </div>
        )}
        <div className="ds-toolbar-group">
          {dsMode === 'manual' && <>
            <ButtonView size="sm" variant="secondary" onClick={clearAll} disabled={!elements.length}>Clear</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => exportDesign(elements)} disabled={!elements.length}>Export JSON</ButtonView>
            <ButtonView size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} title="Import a .design.json file">Import JSON</ButtonView>
            {/* S-D9.16 — AI Design Assistant toggle */}
            <ButtonView
              size="sm"
              variant={aiAssistOpen ? 'primary' : 'secondary'}
              onClick={() => setAiAssistOpen((v) => !v)}
              title="AI Design Assistant — describe changes in plain English"
            ><AgentIcon size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />AI</ButtonView>
          </>}
          <ButtonView size="sm" variant="primary" onClick={() => void saveDesignToStory()} disabled={saving || !bgStoryId} title={bgStoryId ? `Save canvas to story page (${bgSlot || 'cover'})` : 'Select a story in Page Background first'}>{saving ? 'Saving…' : 'Save'}</ButtonView>
          <SegmentedView
            size="sm"
            accentColor="var(--story-accent-3)"
            options={[{ id: 'manual', label: 'Manual' }, { id: 'ai', label: 'AI Edit' }]}
            value={dsMode}
            onChange={async (id) => {
              if (id === 'ai' && editSrc === null) await startEdit();
              setDsMode(id as 'manual' | 'ai');
            }}
            style={{ marginLeft: 15 }}
          />
        </div>
        <div className="ds-toolbar-sep" />
        <div className="ds-toolbar-group">
          <IconButtonView size="sm" icon={<SidebarRightIcon size={15} />} tooltip={rightOpen ? 'Hide right panel' : 'Show right panel'}
            accentColor={rightOpen ? 'var(--story-accent-3)' : 'var(--color-text-muted)'} onClick={() => setRightOpen((v) => !v)} />
        </div>
      </div>

      {/* Hidden file input for JSON import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.design.json"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }}
      />

      {/* ── Body: left | canvas | right ── */}
      <div className="ds-studio-body">
        <div className="ds-split-host">{bodyEl}</div>
      </div>

      {/* Layer / element context menu (DUI) — triggered from layer panel or canvas right-click */}
      <ContextMenuView
        items={layerMenuItems}
        anchorEl={canvasMenuPos ? null : menuAnchor}
        open={!!menuAnchor || !!canvasMenuPos}
        onClose={closeMenu}
        position={canvasMenuPos ?? undefined}
        width={200}
        rounded
      />

      {/* S-D9.01/02/03 — AI Retouch Modal */}
      {retouchEl && (
        <DesignerRetouchModal
          imageUrl={String(retouchEl.el.props.src || retouchEl.el.props.url || '')}
          mode={retouchEl.mode}
          onClose={() => setRetouchEl(null)}
          onApply={handleRetouchApply}
        />
      )}
    </div>
  );
}

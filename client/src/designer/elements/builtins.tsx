/**
 * Built-in element packs (S-D1/S-D2/S-D5/S-D9).
 * S-D9.08 — image filters (brightness/contrast/saturation/blur via Konva.Filters)
 * S-D9.09 — clip-to-shape (rect/ellipse/rounded)
 * S-D9.10 — letter spacing for text
 */
import { useState, useEffect, useRef } from 'react';
import Konva from 'konva';
import { Rect, Text, Ellipse, Image as KImage } from 'react-konva';
import { registry, type DesignerElement, type InspectorField } from '../registry';
import './bubbles'; // S-D3 — registers the full bubbles pack

const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const bool = (v: unknown) => v === true;

// ── Shared effect fields (S-D5) ───────────────────────────────────────────────
export const SHADOW_FIELDS: InspectorField[] = [
  { key: 'shadowColor', label: 'Shadow color', control: 'color' },
  { key: 'shadowBlur', label: 'Shadow blur', control: 'slider', min: 0, max: 40, step: 1 },
  { key: 'shadowOffsetX', label: 'Shadow X', control: 'slider', min: -30, max: 30, step: 1 },
  { key: 'shadowOffsetY', label: 'Shadow Y', control: 'slider', min: -30, max: 30, step: 1 },
  { key: 'shadowOpacity', label: 'Shadow opacity', control: 'slider', min: 0, max: 1, step: 0.05 },
];

export function shadowProps(el: DesignerElement) {
  const blur = num(el.props.shadowBlur, 0);
  if (blur === 0) return {};
  return {
    shadowColor: str(el.props.shadowColor, '#000000'),
    shadowBlur: blur,
    shadowOffsetX: num(el.props.shadowOffsetX, 3),
    shadowOffsetY: num(el.props.shadowOffsetY, 3),
    shadowOpacity: num(el.props.shadowOpacity, 0.6),
  };
}

const FONT_OPTIONS = [
  { value: 'Baloo 2, system-ui', label: 'Baloo 2 (default)' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Garamond, serif', label: 'Garamond' },
  { value: 'Palatino, serif', label: 'Palatino' },
  { value: '"Comic Sans MS", cursive', label: 'Comic Sans' },
  { value: '"Fredoka One", cursive', label: 'Fredoka One' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Courier New", monospace', label: 'Courier' },
];

// ── Text (S-D5 + S-D9.10 letter spacing) ─────────────────────────────────────
registry.register({
  type: 'text',
  palette: { icon: 'T', label: 'Text box', group: 'Text' },
  defaults: () => ({
    w: 240, h: 60,
    props: {
      text: 'Add text', fill: '#2e2426', fontSize: 28, align: 'center',
      fontFamily: 'Baloo 2, system-ui', bold: true, italic: false, underline: false,
      stroke: '#000000', strokeWidth: 0, letterSpacing: 0,
      shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 3, shadowOffsetY: 3, shadowOpacity: 0.6,
    },
  }),
  inspector: [
    { key: 'text', label: 'Text', control: 'textarea' },
    { key: 'fontSize', label: 'Size', control: 'slider', min: 8, max: 120, step: 1 },
    { key: 'fill', label: 'Color', control: 'color' },
    { key: 'fontFamily', label: 'Font', control: 'select', options: FONT_OPTIONS },
    { key: 'align', label: 'Align', control: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
    { key: 'bold', label: 'Bold', control: 'toggle' },
    { key: 'italic', label: 'Italic', control: 'toggle' },
    { key: 'underline', label: 'Underline', control: 'toggle' },
    { key: 'stroke', label: 'Outline color', control: 'color' },
    { key: 'strokeWidth', label: 'Outline width', control: 'slider', min: 0, max: 8, step: 0.5 },
    { key: 'letterSpacing', label: 'Letter spacing', control: 'slider', min: -10, max: 30, step: 0.5 },
    ...SHADOW_FIELDS,
  ],
  render: (el: DesignerElement) => {
    const bold = bool(el.props.bold);
    const italic = bool(el.props.italic);
    const fontStyle = `${bold ? 'bold' : ''}${bold && italic ? ' ' : ''}${italic ? 'italic' : ''}` || 'normal';
    const underline = bool(el.props.underline);
    const strokeW = num(el.props.strokeWidth, 0);
    return (
      <Text
        width={el.w} height={el.h}
        text={str(el.props.text, '')}
        fontSize={num(el.props.fontSize, 28)}
        fontStyle={fontStyle}
        textDecoration={underline ? 'underline' : ''}
        fontFamily={str(el.props.fontFamily, 'Baloo 2, system-ui')}
        fill={str(el.props.fill, '#2e2426')}
        stroke={strokeW > 0 ? str(el.props.stroke, '#000') : undefined}
        strokeWidth={strokeW > 0 ? strokeW : undefined}
        align={str(el.props.align, 'center') as 'left' | 'center' | 'right'}
        verticalAlign="middle"
        letterSpacing={num(el.props.letterSpacing, 0)}
        {...shadowProps(el)}
      />
    );
  },
});

// ── Rectangle / rounded shape ──────────────────────────────────────────────────
registry.register({
  type: 'shape.rect',
  palette: { icon: '▭', label: 'Rectangle', group: 'Shapes' },
  defaults: () => ({
    w: 160, h: 110,
    props: {
      fill: '#f59e0b', stroke: '#00000000', strokeWidth: 0, cornerRadius: 14, opacity: 1,
      shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 4, shadowOffsetY: 4, shadowOpacity: 0.5,
    },
  }),
  inspector: [
    { key: 'fill', label: 'Fill', control: 'color' },
    { key: 'stroke', label: 'Stroke', control: 'color' },
    { key: 'strokeWidth', label: 'Stroke width', control: 'slider', min: 0, max: 20, step: 1 },
    { key: 'cornerRadius', label: 'Corners', control: 'slider', min: 0, max: 80, step: 1 },
    { key: 'opacity', label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.05 },
    ...SHADOW_FIELDS,
  ],
  render: (el: DesignerElement) => (
    <Rect
      width={el.w} height={el.h}
      fill={str(el.props.fill, '#888')}
      stroke={str(el.props.stroke, '#0000')}
      strokeWidth={num(el.props.strokeWidth, 0)}
      cornerRadius={num(el.props.cornerRadius, 0)}
      opacity={num(el.props.opacity, 1)}
      {...shadowProps(el)}
    />
  ),
});

// ── Ellipse ───────────────────────────────────────────────────────────────────
registry.register({
  type: 'shape.ellipse',
  palette: { icon: '⬭', label: 'Ellipse', group: 'Shapes' },
  defaults: () => ({
    w: 160, h: 110,
    props: {
      fill: '#86efac', stroke: '#00000000', strokeWidth: 0, opacity: 1,
      shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 4, shadowOffsetY: 4, shadowOpacity: 0.5,
    },
  }),
  inspector: [
    { key: 'fill', label: 'Fill', control: 'color' },
    { key: 'stroke', label: 'Stroke', control: 'color' },
    { key: 'strokeWidth', label: 'Stroke width', control: 'slider', min: 0, max: 20, step: 1 },
    { key: 'opacity', label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.05 },
    ...SHADOW_FIELDS,
  ],
  render: (el: DesignerElement) => (
    <Ellipse
      x={el.w / 2} y={el.h / 2}
      radiusX={el.w / 2} radiusY={el.h / 2}
      fill={str(el.props.fill, '#86efac')}
      stroke={str(el.props.stroke, '#0000')}
      strokeWidth={num(el.props.strokeWidth, 0)}
      opacity={num(el.props.opacity, 1)}
      {...shadowProps(el)}
    />
  ),
});

// ── Emoji sticker ─────────────────────────────────────────────────────────────
registry.register({
  type: 'sticker',
  palette: { icon: '⭐', label: 'Emoji sticker', group: 'Stickers' },
  defaults: () => ({ w: 80, h: 80, props: { emoji: '⭐', size: 56, opacity: 1, shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 2, shadowOffsetY: 2, shadowOpacity: 0.5 } }),
  inspector: [
    { key: 'emoji', label: 'Emoji', control: 'text' },
    { key: 'size', label: 'Size', control: 'slider', min: 16, max: 200, step: 2 },
    { key: 'opacity', label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.05 },
    ...SHADOW_FIELDS,
  ],
  render: (el: DesignerElement) => (
    <Text
      width={el.w} height={el.h}
      text={str(el.props.emoji, '⭐')}
      fontSize={num(el.props.size, 56)}
      align="center" verticalAlign="middle"
      opacity={num(el.props.opacity, 1)}
      {...shadowProps(el)}
    />
  ),
});

// ── Image — S-D9.08 filters + S-D9.09 clip-to-shape ─────────────────────────
function KonvaImageEl({ el }: { el: DesignerElement }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const nodeRef = useRef<Konva.Image>(null);
  const url = str(el.props.url, '');

  useEffect(() => {
    if (!url) { setImg(null); return; }
    let cancelled = false;
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => { if (!cancelled) setImg(i); };
    i.src = url;
    return () => { cancelled = true; };
  }, [url]);

  // S-D9.08 — filter values
  const brightness = num(el.props.brightness, 0);
  const contrast = num(el.props.contrast, 0);
  const saturation = num(el.props.saturation, 0);
  const blur = num(el.props.blur, 0);
  const hasFilter = brightness !== 0 || contrast !== 0 || saturation !== 0 || blur !== 0;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !img) return;
    if (hasFilter) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [img, hasFilter, brightness, contrast, saturation, blur]);

  // Use the same type as Konva's filter functions to avoid TS mismatch
  type KFilter = typeof Konva.Filters.Brighten;
  const activeFilters: KFilter[] = [];
  if (brightness !== 0) activeFilters.push(Konva.Filters.Brighten as KFilter);
  if (contrast !== 0) activeFilters.push(Konva.Filters.Contrast as KFilter);
  if (saturation !== 0) activeFilters.push(Konva.Filters.HSL as KFilter);
  if (blur !== 0) activeFilters.push(Konva.Filters.Blur as KFilter);

  // S-D9.09 — clip-to-shape
  const clipShape = str(el.props.clipShape, 'rect');
  let clipFunc: ((ctx: CanvasRenderingContext2D) => void) | undefined;
  if (clipShape === 'ellipse') {
    clipFunc = (ctx) => { ctx.ellipse(el.w / 2, el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2); };
  } else if (clipShape === 'rounded') {
    const r = num(el.props.clipRadius, 24);
    clipFunc = (ctx) => {
      const rr = Math.min(r, el.w / 2, el.h / 2);
      ctx.moveTo(rr, 0);
      ctx.lineTo(el.w - rr, 0);
      ctx.quadraticCurveTo(el.w, 0, el.w, rr);
      ctx.lineTo(el.w, el.h - rr);
      ctx.quadraticCurveTo(el.w, el.h, el.w - rr, el.h);
      ctx.lineTo(rr, el.h);
      ctx.quadraticCurveTo(0, el.h, 0, el.h - rr);
      ctx.lineTo(0, rr);
      ctx.quadraticCurveTo(0, 0, rr, 0);
      ctx.closePath();
    };
  }

  if (!img) {
    return <Rect width={el.w} height={el.h} fill="#374151" cornerRadius={num(el.props.cornerRadius, 0)} />;
  }
  return (
    <KImage
      ref={nodeRef}
      image={img} width={el.w} height={el.h}
      cornerRadius={clipShape === 'rect' ? num(el.props.cornerRadius, 0) : 0}
      opacity={num(el.props.opacity, 1)}
      {...shadowProps(el)}
      {...(hasFilter ? {
        filters: activeFilters,
        brightness,
        contrast,
        saturation,
        blurRadius: blur,
      } : {})}
      {...(clipFunc ? { clipFunc } : {})}
    />
  );
}

registry.register({
  type: 'image',
  palette: { icon: '🖼️', label: 'Image', group: 'Media' },
  defaults: () => ({
    w: 200, h: 200,
    props: {
      url: '', cornerRadius: 0, opacity: 1, clipShape: 'rect', clipRadius: 24,
      brightness: 0, contrast: 0, saturation: 0, blur: 0,
      shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.5,
    },
  }),
  inspector: [
    { key: 'url', label: 'URL / path', control: 'text' },
    { key: 'cornerRadius', label: 'Corners', control: 'slider', min: 0, max: 80, step: 1 },
    { key: 'opacity', label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'clipShape', label: 'Clip shape', control: 'select', options: [{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }, { value: 'rounded', label: 'Rounded' }] },
    { key: 'clipRadius', label: 'Clip radius', control: 'slider', min: 0, max: 200, step: 1 },
    { key: 'brightness', label: 'Brightness', control: 'slider', min: -1, max: 1, step: 0.05 },
    { key: 'contrast', label: 'Contrast', control: 'slider', min: -100, max: 100, step: 1 },
    { key: 'saturation', label: 'Saturation', control: 'slider', min: -2, max: 10, step: 0.1 },
    { key: 'blur', label: 'Blur', control: 'slider', min: 0, max: 20, step: 0.5 },
    ...SHADOW_FIELDS,
  ],
  render: (el: DesignerElement) => <KonvaImageEl el={el} />,
});

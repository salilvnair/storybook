/**
 * Bubbles pack (S-D3) — the real speech/thought bubble set.
 *
 * Six bubble kinds, each a proper comic-style shape. The body + pointer tail are
 * drawn as ONE continuous path (no seam line across the tail mouth), so the tail
 * reads as a smooth filled extension of the bubble — like real comic bubbles.
 *
 * Drawn with react-konva <Shape> sceneFuncs at LOCAL (0,0), sized el.w×el.h (the
 * Studio owns the transform Group). Text sits on top. Inspector: text, fill,
 * outline, text colour, size, outline width, tail side.
 */
import { Shape, Text, Group } from 'react-konva';
import type Konva from 'konva';
import { registry, type DesignerElement } from '../registry';

const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

type Ctx = Konva.Context;
type TailSide = 'left' | 'center' | 'right' | 'none';

const tailLenFor = (h: number, side: TailSide) => (side === 'none' ? 0 : Math.min(30, h * 0.26));
const tailCenterX = (w: number, side: TailSide) => (side === 'left' ? w * 0.30 : side === 'right' ? w * 0.70 : w * 0.5);

/** Rounded-rect body + integrated, gently curved tail — one continuous path. */
function drawRounded(ctx: Ctx, w: number, h: number, side: TailSide, radius: number) {
  const tl = tailLenFor(h, side);
  const bh = h - tl;
  const rr = Math.max(0, Math.min(radius, w / 2, bh / 2));
  const half = Math.max(9, Math.min(w * 0.085, 15));
  const bx = tailCenterX(w, side);
  const tipX = bx + (side === 'left' ? -tl * 0.5 : side === 'right' ? tl * 0.5 : 0);
  ctx.beginPath();
  ctx.moveTo(rr, 0);
  ctx.lineTo(w - rr, 0);
  ctx.quadraticCurveTo(w, 0, w, rr);
  ctx.lineTo(w, bh - rr);
  ctx.quadraticCurveTo(w, bh, w - rr, bh);
  if (side !== 'none') {
    ctx.lineTo(bx + half, bh);
    ctx.quadraticCurveTo(bx + half * 0.5, bh + tl * 0.45, tipX, bh + tl); // out to the tip
    ctx.quadraticCurveTo(bx - half * 0.2, bh + tl * 0.55, bx - half, bh); // back to the body
  }
  ctx.lineTo(rr, bh);
  ctx.quadraticCurveTo(0, bh, 0, bh - rr);
  ctx.lineTo(0, rr);
  ctx.quadraticCurveTo(0, 0, rr, 0);
  ctx.closePath();
}

/** Ellipse perimeter sampled to a polyline, with the tail spliced into the bottom. */
function drawOval(ctx: Ctx, w: number, h: number, side: TailSide) {
  const tl = tailLenFor(h, side);
  const bh = h - tl;
  const cx = w / 2, cy = bh / 2, rx = w / 2 - 1, ry = bh / 2 - 1;
  const N = 72;
  const skew = side === 'left' ? -1 : side === 'right' ? 1 : 0;
  const c = Math.PI / 2 + skew * 0.32;       // bottom of the ellipse, shifted toward the tail
  const dw = 0.22;
  const w1 = c - dw, w2 = c + dw;
  const tip = { x: cx + Math.cos(c) * rx + skew * 16, y: bh + tl };
  ctx.beginPath();
  let moved = false, didTail = false;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / N; // start at the top, sweep clockwise
    if (side !== 'none' && a > w1 && a < w2) { if (!didTail) { ctx.lineTo(tip.x, tip.y); didTail = true; } continue; }
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    if (!moved) { ctx.moveTo(x, y); moved = true; } else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Organic spiky burst (no tail — the spikes are the energy). */
function drawShout(ctx: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2, spikes = 11;
  const m = Math.min(w, h) / 2;
  const ro = m * 0.99, ri = m * 0.66;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (Math.PI * i) / spikes - Math.PI / 2;
    const jit = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.16 + 0.92; // deterministic 0.92–1.08 wobble
    const r = (i % 2 === 0 ? ro : ri) * jit;
    const x = cx + Math.cos(ang) * r * (w / Math.min(w, h));
    const y = cy + Math.sin(ang) * r * (h / Math.min(w, h));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function BubbleText({ el }: { el: DesignerElement }) {
  const tl = tailLenFor(el.h, str(el.props.tail, 'center') as TailSide);
  return (
    <Text width={el.w} height={el.h - tl} text={str(el.props.text, '')} align="center" verticalAlign="middle" padding={14}
      fontSize={num(el.props.fontSize, 20)} fill={str(el.props.textFill, '#2e2426')} fontFamily="Baloo 2, system-ui" fontStyle="bold" />
  );
}

function BubbleShape({ el, draw, extra }: { el: DesignerElement; draw: (ctx: Ctx, w: number, h: number, side: TailSide) => void; extra?: Partial<Konva.ShapeConfig> }) {
  const side = str(el.props.tail, 'left') as TailSide;
  return (
    <Shape
      sceneFunc={(ctx, shape) => { draw(ctx as Ctx, el.w, el.h, side); ctx.fillStrokeShape(shape); }}
      fill={str(el.props.fill, '#fffded')} stroke={str(el.props.stroke, '#2e2426')}
      strokeWidth={num(el.props.strokeWidth, 2)} lineJoin="round" {...extra}
    />
  );
}

const TAIL_FIELD = {
  key: 'tail', label: 'Tail', control: 'select' as const,
  options: [
    { value: 'left', label: 'Bottom-left' },
    { value: 'center', label: 'Bottom-center' },
    { value: 'right', label: 'Bottom-right' },
    { value: 'none', label: 'No tail' },
  ],
};
const COMMON_FIELDS = [
  { key: 'text', label: 'Text', control: 'textarea' as const },
  { key: 'fill', label: 'Fill', control: 'color' as const },
  { key: 'stroke', label: 'Outline', control: 'color' as const },
  { key: 'textFill', label: 'Text color', control: 'color' as const },
  { key: 'fontSize', label: 'Text size', control: 'slider' as const, min: 8, max: 60, step: 1 },
  { key: 'strokeWidth', label: 'Outline width', control: 'slider' as const, min: 0, max: 10, step: 1 },
  TAIL_FIELD,
];
const baseProps = (over: Record<string, unknown> = {}) => ({
  text: 'Said something!', fill: '#fffded', stroke: '#2e2426', strokeWidth: 2,
  fontSize: 20, textFill: '#2e2426', tail: 'left', ...over,
});

// ── Rounded speech bubble ───────────────────────────────────────────────────
registry.register({
  type: 'bubble.rounded',
  palette: { icon: '💬', label: 'Speech (round)', group: 'Bubbles' },
  defaults: () => ({ w: 220, h: 150, props: baseProps() }),
  inspector: COMMON_FIELDS,
  render: (el) => (
    <Group>
      <BubbleShape el={el} draw={(ctx, w, h, side) => drawRounded(ctx, w, h, side, Math.min(w, h - tailLenFor(h, side)) * 0.34)} />
      <BubbleText el={el} />
    </Group>
  ),
});

// ── Oval speech bubble ──────────────────────────────────────────────────────
registry.register({
  type: 'bubble.oval',
  palette: { icon: '🗨️', label: 'Speech (oval)', group: 'Bubbles' },
  defaults: () => ({ w: 240, h: 160, props: baseProps({ text: 'Oh wow!' }) }),
  inspector: COMMON_FIELDS,
  render: (el) => (
    <Group>
      <BubbleShape el={el} draw={drawOval} />
      <BubbleText el={el} />
    </Group>
  ),
});

// ── Rectangle caption ───────────────────────────────────────────────────────
registry.register({
  type: 'bubble.rect',
  palette: { icon: '▢', label: 'Caption box', group: 'Bubbles' },
  defaults: () => ({ w: 240, h: 110, props: baseProps({ text: 'Narration…', fill: '#fff8e1', tail: 'none' }) }),
  inspector: COMMON_FIELDS,
  render: (el) => (
    <Group>
      <BubbleShape el={el} draw={(ctx, w, h, side) => drawRounded(ctx, w, h, side, 8)} />
      <BubbleText el={el} />
    </Group>
  ),
});

// ── Shout / burst ───────────────────────────────────────────────────────────
registry.register({
  type: 'bubble.shout',
  palette: { icon: '💥', label: 'Shout!', group: 'Bubbles' },
  defaults: () => ({ w: 220, h: 200, props: baseProps({ text: 'POW!', fill: '#fff1b8', stroke: '#b45309', textFill: '#b45309', fontSize: 32, strokeWidth: 3, tail: 'none' }) }),
  inspector: [
    { key: 'text', label: 'Text', control: 'textarea' as const },
    { key: 'fill', label: 'Fill', control: 'color' as const },
    { key: 'stroke', label: 'Outline', control: 'color' as const },
    { key: 'textFill', label: 'Text color', control: 'color' as const },
    { key: 'fontSize', label: 'Text size', control: 'slider' as const, min: 8, max: 72, step: 1 },
    { key: 'strokeWidth', label: 'Outline width', control: 'slider' as const, min: 0, max: 10, step: 1 },
  ],
  render: (el) => (
    <Group>
      <BubbleShape el={el} draw={(ctx, w, h) => drawShout(ctx, w, h)} />
      <Text width={el.w} height={el.h} text={str(el.props.text, '')} align="center" verticalAlign="middle"
        fontSize={num(el.props.fontSize, 32)} fill={str(el.props.textFill, '#b45309')} fontFamily="Baloo 2, system-ui" fontStyle="bold" />
    </Group>
  ),
});

// ── Whisper (dashed) ────────────────────────────────────────────────────────
registry.register({
  type: 'bubble.whisper',
  palette: { icon: '🤫', label: 'Whisper', group: 'Bubbles' },
  defaults: () => ({ w: 220, h: 150, props: baseProps({ text: '(psst…)', fill: '#f5f3ff', stroke: '#7c3aed', textFill: '#6d28d9', tail: 'left' }) }),
  inspector: COMMON_FIELDS,
  render: (el) => (
    <Group>
      <BubbleShape el={el} draw={(ctx, w, h, side) => drawRounded(ctx, w, h, side, Math.min(w, h - tailLenFor(h, side)) * 0.34)} extra={{ dash: [9, 6] }} />
      <BubbleText el={el} />
    </Group>
  ),
});

// ── Thought cloud (scalloped + trailing dots) ───────────────────────────────
registry.register({
  type: 'bubble.thought',
  palette: { icon: '💭', label: 'Thought cloud', group: 'Bubbles' },
  defaults: () => ({ w: 240, h: 180, props: baseProps({ text: 'Hmm…', fill: '#ffffff', stroke: '#2e2426', tail: 'left' }) }),
  inspector: COMMON_FIELDS,
  render: (el) => {
    const side = str(el.props.tail, 'left') as TailSide;
    const tl = side === 'none' ? 0 : Math.min(42, el.h * 0.28);
    const bh = el.h - tl;
    const fill = str(el.props.fill, '#ffffff');
    const stroke = str(el.props.stroke, '#2e2426');
    const sw = num(el.props.strokeWidth, 2);
    const dotX = side === 'right' ? el.w * 0.74 : el.w * 0.26;
    const dots = side === 'none' ? [] : [
      { x: dotX, y: bh + tl * 0.30, r: tl * 0.16 },
      { x: dotX + (side === 'right' ? 14 : -14), y: bh + tl * 0.66, r: tl * 0.11 },
      { x: dotX + (side === 'right' ? 24 : -24), y: bh + tl * 0.95, r: tl * 0.07 },
    ];
    return (
      <Group>
        {dots.map((d, i) => (
          <Shape key={i} sceneFunc={(ctx, shape) => { ctx.beginPath(); ctx.arc(d.x, d.y, Math.max(2, d.r), 0, Math.PI * 2); ctx.closePath(); ctx.fillStrokeShape(shape); }}
            fill={fill} stroke={stroke} strokeWidth={sw} />
        ))}
        <Shape
          sceneFunc={(ctx, shape) => {
            const cx = el.w / 2, cy = bh / 2, rx = el.w / 2 - sw, ry = bh / 2 - sw, bumps = 11;
            ctx.beginPath();
            for (let i = 0; i <= bumps; i++) {
              const a = (Math.PI * 2 * i) / bumps;
              const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
              if (i === 0) { ctx.moveTo(x, y); continue; }
              const pa = (Math.PI * 2 * (i - 0.5)) / bumps;
              ctx.quadraticCurveTo(cx + Math.cos(pa) * rx * 1.22, cy + Math.sin(pa) * ry * 1.22, x, y);
            }
            ctx.closePath(); ctx.fillStrokeShape(shape);
          }}
          fill={fill} stroke={stroke} strokeWidth={sw} lineJoin="round"
        />
        <Text width={el.w} height={bh} text={str(el.props.text, '')} align="center" verticalAlign="middle" padding={20}
          fontSize={num(el.props.fontSize, 20)} fill={str(el.props.textFill, '#2e2426')} fontFamily="Baloo 2, system-ui" fontStyle="bold" />
      </Group>
    );
  },
});

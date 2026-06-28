/** Shared SVG schematic of a Template Spec — used by the live preview AND by the
 *  My Story canvas (to show where text / illustration will go before generating). */
import type { TemplateSpec } from '../../store/template-store';

export function TemplateSchematic({ spec, labels = false }: { spec: TemplateSpec; labels?: boolean }) {
  const ratio = spec.pageKind === 'single' ? 1 : spec.aspect === '2:1' ? 2 : spec.aspect === '3:2' ? 1.5 : 1;
  const H = 150;
  const W = H * ratio;
  const single = spec.pageKind === 'single';
  const textLeft = spec.textSide !== 'right';
  const halfW = single ? W : W / 2;
  const accent = spec.palette?.[0] || '#FCD653';
  const img = '#7BAAD2';
  const textX = single ? 0 : textLeft ? 0 : halfW;
  const imgX = single ? 0 : textLeft ? halfW : 0;
  const imgW = single ? W : W - halfW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tp-svg" style={{ aspectRatio: `${ratio}` }}>
      <rect x={imgX} y="0" width={imgW} height={H} fill={img} />
      <g transform={`translate(${imgX + imgW / 2 - 14}, ${H / 2 - (labels ? 20 : 14)})`} opacity="0.9">
        <rect x="0" y="0" width="28" height="28" rx="4" fill="#fff" opacity="0.25" />
        <circle cx="9" cy="9" r="3.5" fill="#fff" />
        <path d="M3 24 L11 15 L17 21 L22 16 L25 24 Z" fill="#fff" />
      </g>
      {labels && (
        <text x={imgX + imgW / 2} y={H * 0.66} textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" opacity="0.9">
          Illustration
        </text>
      )}

      {!single && (() => {
        const rect = spec.cardRect || { x: 0.13, y: 0.28, w: 0.74, h: 0.44 };
        const cx = textX + rect.x * halfW;
        const cy = rect.y * H;
        const cw = rect.w * halfW;
        const ch = rect.h * H;
        return (
          <>
            <rect x={textX} y="0" width={halfW} height={H} fill={accent} />
            {spec.glow && <ellipse cx={textX + halfW / 2} cy={H / 2} rx={halfW * 0.4} ry={H * 0.3} fill="#fff" opacity="0.18" />}
            <rect x={cx} y={cy} width={cw} height={ch} rx="6" fill={spec.cardColor} stroke={spec.frameColor} strokeWidth="1.4" />
            <rect x={cx + cw * 0.14} y={cy + ch * 0.3} width={cw * 0.72} height="4" rx="2" fill={spec.inkColor} />
            <rect x={cx + cw * 0.22} y={cy + ch * 0.48} width={cw * 0.56} height="4" rx="2" fill={spec.inkColor} />
            <rect x={cx + cw * 0.26} y={cy + ch * 0.66} width={cw * 0.48} height="4" rx="2" fill={spec.emphasisColor} />
            {labels && (
              <text x={textX + halfW / 2} y={H * 0.92} textAnchor="middle" fill={spec.inkColor} fontSize="7" fontWeight="700" opacity="0.8">
                Story text
              </text>
            )}
          </>
        );
      })()}
      {single && (
        <>
          <rect x={W * 0.1} y={H * 0.7} width={W * 0.8} height={H * 0.2} rx="6" fill={spec.cardColor} opacity="0.96" />
          <rect x={W * 0.2} y={H * 0.77} width={W * 0.6} height="4" rx="2" fill={spec.inkColor} />
          <rect x={W * 0.28} y={H * 0.83} width={W * 0.44} height="4" rx="2" fill={spec.emphasisColor} />
        </>
      )}
    </svg>
  );
}

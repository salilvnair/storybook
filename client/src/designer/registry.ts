/**
 * Designer Studio — element registry (S-D1/S-D2 foundation).
 *
 * The canvas + inspector are generic; every element KIND is an `ElementSpec`
 * registered here (built-in now; sandboxed community packs later, per
 * plan/designer-studio-plan.md). A spec declares its palette entry, default
 * props, a react-konva renderer, and a declarative inspector schema.
 */
import type { ReactNode } from 'react';

export interface DesignerElement {
  id: string;
  type: string;              // ElementSpec.type
  x: number; y: number;       // top-left, in stage px
  w: number; h: number;
  rotation: number;           // degrees
  props: Record<string, unknown>;
  // S-D4 — layers panel state
  name?: string;             // custom layer name (falls back to the spec label)
  hidden?: boolean;          // hidden on the canvas
  locked?: boolean;          // not draggable / selectable on the canvas
  // S-D9.12 — layer-level effects
  opacity?: number;          // 0–1 applied to the whole element group
  blendMode?: string;        // CSS globalCompositeOperation
  // Flip / mirror — -1 to mirror, 1 normal. x is stored as right-edge when scaleX=-1.
  scaleX?: number;
  scaleY?: number;
}

export interface InspectorField {
  key: string;
  label: string;
  control: 'text' | 'textarea' | 'color' | 'slider' | 'select' | 'toggle';
  options?: { value: string; label: string }[];
  min?: number; max?: number; step?: number;
}

export interface ElementSpec {
  type: string;                              // 'shape.rect', 'text', …
  palette: { icon: string; label: string; group: string };
  defaults: () => Pick<DesignerElement, 'w' | 'h'> & { props: Record<string, unknown> };
  /** react-konva visual at LOCAL (0,0), sized `el.w`×`el.h`. The Studio owns the
   *  enclosing transform Group (position / drag / select / resize). */
  render: (el: DesignerElement) => ReactNode;
  inspector: InspectorField[];
  schemaVersion?: number;
}

class DesignerRegistry {
  private specs = new Map<string, ElementSpec>();

  register(spec: ElementSpec) { this.specs.set(spec.type, spec); return this; }
  get(type: string): ElementSpec | undefined { return this.specs.get(type); }
  all(): ElementSpec[] { return [...this.specs.values()]; }

  /** Palette grouped by `palette.group`, preserving registration order. */
  groups(): { group: string; specs: ElementSpec[] }[] {
    const out: { group: string; specs: ElementSpec[] }[] = [];
    for (const s of this.specs.values()) {
      let g = out.find((x) => x.group === s.palette.group);
      if (!g) { g = { group: s.palette.group, specs: [] }; out.push(g); }
      g.specs.push(s);
    }
    return out;
  }
}

export const registry = new DesignerRegistry();

let _seq = 0;
export function newElement(type: string): DesignerElement | null {
  const spec = registry.get(type);
  if (!spec) return null;
  const d = spec.defaults();
  return {
    id: `el-${Date.now()}-${_seq++}`,
    type,
    x: 80, y: 80, w: d.w, h: d.h, rotation: 0,
    props: { ...d.props },
  };
}

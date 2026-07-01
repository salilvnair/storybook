/**
 * Community block loader (S-D7).
 * Fetches installed block manifests from /api/designer/blocks and registers
 * each element spec into the DesignerRegistry using its baseType renderer.
 *
 * Block manifest format (designer-block.json):
 *   { id, name, version, author, enabled, elements: [{type, baseType, palette, defaults}] }
 *
 * baseType must match an already-registered registry type (e.g. 'sticker', 'text',
 * 'shape.rect'). The community element inherits the base renderer + inspector but
 * can supply different default props to create styled variants.
 */
import { registry, type DesignerElement } from './registry';

export interface BlockElement {
  type: string;
  /** Registry type whose render + inspector is reused. */
  baseType?: string;
  palette: { icon: string; label: string; group: string };
  defaults: { w: number; h: number; props: Record<string, unknown> };
}

export interface BlockManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  enabled?: boolean;
  elements: BlockElement[];
  _dir?: string;
}

interface BlocksResponse {
  blocks: BlockManifest[];
  blocksDir: string;
}

let _cache: BlockManifest[] = [];
let _blocksDir = '';

export async function loadCommunityBlocks(
  overrideEnabled?: Set<string>,
): Promise<{ blocks: BlockManifest[]; blocksDir: string }> {
  try {
    const res = await fetch('/api/designer/blocks');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: BlocksResponse = await res.json();
    _cache = data.blocks;
    _blocksDir = data.blocksDir;

    for (const block of data.blocks) {
      const isEnabled = overrideEnabled
        ? overrideEnabled.has(block.id)
        : block.enabled !== false;
      if (!isEnabled) continue;

      for (const el of block.elements) {
        if (registry.get(el.type)) continue; // already registered

        const baseSpec = el.baseType ? registry.get(el.baseType) : null;
        if (!baseSpec) {
          console.warn(`[designer-blocks] ${block.id}: baseType '${el.baseType}' not found for '${el.type}'`);
          continue;
        }

        registry.register({
          type: el.type,
          palette: el.palette,
          defaults: () => ({
            ...baseSpec.defaults?.() ?? { w: 80, h: 80, props: {} },
            w: el.defaults.w,
            h: el.defaults.h,
            props: { ...(baseSpec.defaults?.()?.props ?? {}), ...el.defaults.props },
          }),
          inspector: baseSpec.inspector,
          render: (elem: DesignerElement) => baseSpec.render(elem),
        });
      }
    }

    return data;
  } catch (err) {
    console.warn('[designer-blocks] failed to load:', err);
    return { blocks: [], blocksDir: '' };
  }
}

export function getCachedBlocks(): BlockManifest[] { return _cache; }
export function getCachedBlocksDir(): string { return _blocksDir; }

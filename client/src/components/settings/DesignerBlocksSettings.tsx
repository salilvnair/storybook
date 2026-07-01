/**
 * Designer Blocks settings panel (S-D7).
 * Lists community element packs installed at ~/.salilvnair/istorybook/designer-blocks/.
 * RearrangeView for ordering/toggling; scaffold button for new packs.
 */
import { useEffect, useState } from 'react';
import { RearrangeView, type RearrangeItem, ButtonView, TextInputView } from '@salilvnair/dui';
import { type BlockManifest, loadCommunityBlocks, getCachedBlocks, getCachedBlocksDir } from '../../designer/community-blocks';

const LS_BLOCK_ORDER = 'istorybook_designer_block_order';

function loadOrder(): RearrangeItem[] {
  try {
    const saved = localStorage.getItem(LS_BLOCK_ORDER);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveOrder(items: RearrangeItem[]) {
  try { localStorage.setItem(LS_BLOCK_ORDER, JSON.stringify(items)); } catch { /* full */ }
}

function blocksToItems(blocks: BlockManifest[], savedOrder: RearrangeItem[]): RearrangeItem[] {
  const orderMap = new Map(savedOrder.map((i, idx) => [i.id, { enabled: i.enabled ?? true, idx }]));
  const items: RearrangeItem[] = blocks.map((b) => ({
    id: b.id,
    label: b.name,
    icon: b.elements[0]?.palette.icon ?? '📦',
    enabled: orderMap.has(b.id) ? (orderMap.get(b.id)!.enabled ?? true) : (b.enabled !== false),
  }));
  // Sort by saved order, then alpha for new blocks
  items.sort((a, b) => {
    const ai = orderMap.get(a.id)?.idx ?? 9999;
    const bi = orderMap.get(b.id)?.idx ?? 9999;
    return ai !== bi ? ai - bi : a.label!.localeCompare(b.label!);
  });
  return items;
}

export function DesignerBlocksSettings() {
  const [blocks, setBlocks] = useState<BlockManifest[]>(() => getCachedBlocks());
  const [blocksDir, setBlocksDir] = useState(() => getCachedBlocksDir());
  const [items, setItems] = useState<RearrangeItem[]>(() => blocksToItems(getCachedBlocks(), loadOrder()));
  const [loading, setLoading] = useState(false);
  const [scaffoldId, setScaffoldId] = useState('');
  const [scaffoldName, setScaffoldName] = useState('');
  const [scaffoldMsg, setScaffoldMsg] = useState('');

  const refresh = async () => {
    setLoading(true);
    const { blocks: fetched, blocksDir: dir } = await loadCommunityBlocks();
    setBlocks(fetched);
    setBlocksDir(dir);
    const saved = loadOrder();
    const next = blocksToItems(fetched, saved);
    setItems(next);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const handleChange = (next: RearrangeItem[]) => {
    setItems(next);
    saveOrder(next);
    // Persist enabled changes back to manifest via API
    next.forEach((item) => {
      const block = blocks.find((b) => b.id === item.id);
      if (block && block.enabled !== item.enabled) {
        fetch(`/api/designer/blocks/${item.id}/enabled`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: item.enabled }),
        }).catch(console.warn);
      }
    });
  };

  const handleScaffold = async () => {
    if (!scaffoldId) return;
    setScaffoldMsg('');
    try {
      const res = await fetch('/api/designer/blocks/scaffold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scaffoldId, name: scaffoldName || scaffoldId }),
      });
      const data = await res.json();
      if (!res.ok) { setScaffoldMsg(`Error: ${data.error}`); return; }
      setScaffoldMsg(`Created: ${data.created}`);
      setScaffoldId('');
      setScaffoldName('');
      await refresh();
    } catch (err: unknown) {
      setScaffoldMsg(`Error: ${String(err)}`);
    }
  };

  return (
    <div className="ds-blocks-wrap">
      <div className="ds-blocks-header">
        <div>
          <div className="ds-blocks-title">Designer Blocks</div>
          <div className="ds-blocks-dir">{blocksDir || '~/.salilvnair/istorybook/designer-blocks/'}</div>
        </div>
        <ButtonView size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </ButtonView>
      </div>

      {items.length === 0 ? (
        <div className="ds-blocks-empty">
          No blocks installed yet. Scaffold one below or drop a folder with a{' '}
          <code>designer-block.json</code> into the blocks directory.
        </div>
      ) : (
        <RearrangeView
          items={items}
          onChange={handleChange}
          selectable
          accentColor="var(--story-accent-3)"
          size="sm"
        />
      )}

      <div className="ds-blocks-scaffold">
        <div className="ds-blocks-scaffold-title">Scaffold a new block</div>
        <div className="ds-blocks-scaffold-row">
          <TextInputView
            size="sm"
            placeholder="id (lowercase-kebab)"
            value={scaffoldId}
            onChange={(e) => setScaffoldId((e.target as HTMLInputElement).value)}
          />
          <TextInputView
            size="sm"
            placeholder="Display name (optional)"
            value={scaffoldName}
            onChange={(e) => setScaffoldName((e.target as HTMLInputElement).value)}
          />
          <ButtonView size="sm" variant="primary" onClick={() => void handleScaffold()} disabled={!scaffoldId}>
            Create
          </ButtonView>
        </div>
        {scaffoldMsg && <div className="ds-blocks-scaffold-msg">{scaffoldMsg}</div>}
        <div className="ds-blocks-scaffold-hint">
          Creates <code>{blocksDir || '~/.salilvnair/istorybook/designer-blocks/'}/{scaffoldId || '&lt;id&gt;'}/designer-block.json</code> with a starter element.
          Edit the manifest, then Refresh to load it into the Designer palette.
        </div>
      </div>
    </div>
  );
}

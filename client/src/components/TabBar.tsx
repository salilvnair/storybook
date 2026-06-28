/**
 * TabBar — Daakia-style draggable tab strip. Each tab has a coloured icon, an
 * active accent underline, and a close button; the "+" opens a new Story.
 * Right-click a tab for the full daakia-style context menu (Duplicate, Close,
 * Close Others, Close to the Right/Left, Close All) via DUI ContextMenuView.
 */
import { useState, type DragEvent } from 'react';
import { ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import { useTabsStore, type Tab, type TabType } from '../store/tabs-store';
import { CopyIcon, CloseCircleIcon, CloseIcon, ArrowToRightIcon, ArrowToLeftIcon, TrashIcon, PlusIcon } from '../icons';

const TAB_META: Record<TabType, { icon: string; badge: string; color: string }> = {
  'story': { icon: '📖', badge: 'STORY', color: 'var(--story-accent)' },
  'templates': { icon: '🎨', badge: 'TMPL', color: 'var(--story-accent-3)' },
  'library': { icon: '📚', badge: 'LIB', color: 'var(--story-accent-2)' },
  'sample-preview': { icon: '📄', badge: 'SAMPLE', color: 'var(--story-accent)' },
  'settings': { icon: '⚙', badge: 'SETTINGS', color: '#94a3b8' },
};

interface MenuState { tabId: string; x: number; y: number }

export function TabBar() {
  const { tabs, activeId, newStory, close, closeOthers, closeRight, closeLeft, closeAll, duplicate, activate, reorder } = useTabsStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const menuItems: ContextMenuItem[] = (() => {
    if (!menu) return [];
    const idx = tabs.findIndex((t) => t.id === menu.tabId);
    const tab = tabs[idx];
    if (!tab) return [];
    const closableCount = tabs.filter((t) => t.closable).length;
    const hasRight = tabs.slice(idx + 1).some((t) => t.closable);
    const hasLeft = tabs.slice(0, idx).some((t) => t.closable);
    const hasOthers = tabs.some((t) => t.id !== tab.id && t.closable);
    const items: ContextMenuItem[] = [
      { id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} style={{ color: 'var(--story-accent-2)' }} />, onClick: () => { duplicate(tab.id); setMenu(null); } },
    ];
    items.push({ id: 'sep1', label: '', separator: true });
    if (tab.closable) items.push({ id: 'close', label: 'Close', shortcut: 'W', icon: <CloseCircleIcon size={13} style={{ color: 'var(--story-accent)' }} />, onClick: () => { close(tab.id); setMenu(null); } });
    if (hasOthers) items.push({ id: 'close-others', label: 'Close Others', shortcut: 'O', icon: <CloseIcon size={13} style={{ color: '#fbbf24' }} />, onClick: () => { closeOthers(tab.id); setMenu(null); } });
    if (hasRight) items.push({ id: 'close-right', label: 'Close to the Right', icon: <ArrowToRightIcon size={13} style={{ color: '#fbbf24' }} />, onClick: () => { closeRight(tab.id); setMenu(null); } });
    if (hasLeft) items.push({ id: 'close-left', label: 'Close to the Left', icon: <ArrowToLeftIcon size={13} style={{ color: '#fbbf24' }} />, onClick: () => { closeLeft(tab.id); setMenu(null); } });
    if (closableCount >= 2) items.push({ id: 'close-all', label: 'Close All', shortcut: 'A', danger: true, icon: <TrashIcon size={13} style={{ color: 'var(--color-error, #f87171)' }} />, onClick: () => { closeAll(); setMenu(null); } });
    return items;
  })();

  return (
    <div className="story-tabbar">
      <div className="story-tabbar-scroll">
        {tabs.map((tab, idx) => (
          <TabChip
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            dragging={dragIdx === idx}
            dragOver={overIdx === idx && dragIdx !== idx}
            onClick={() => activate(tab.id)}
            onClose={() => close(tab.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }); }}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
            onDrop={() => { if (dragIdx !== null) reorder(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          />
        ))}
        <button className="story-tab-add" title="New story" onClick={newStory}><PlusIcon size={15} /></button>
      </div>

      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        onClose={() => setMenu(null)}
        items={menuItems}
        rounded
      />
    </div>
  );
}

function TabChip({
  tab, active, dragging, dragOver, onClick, onClose, onContextMenu,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  tab: Tab;
  active: boolean;
  dragging: boolean;
  dragOver: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const meta = TAB_META[tab.type];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`story-tab${active ? ' is-active' : ''}${dragging ? ' is-dragging' : ''}${dragOver ? ' is-dragover' : ''}`}
    >
      {active && <span className="story-tab-accent" style={{ background: meta.color }} />}
      <span className="story-tab-icon" style={{ color: meta.color }}>{meta.icon}</span>
      <span className="story-tab-title">{tab.title}</span>
      {tab.closable && (
        <button
          className="story-tab-close"
          title="Close tab"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          ×
        </button>
      )}
    </div>
  );
}

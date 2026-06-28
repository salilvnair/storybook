/**
 * LibraryTab — the main Library page opened from the top nav button.
 * Shows all generated storybooks as cover cards with a 3-dot context menu
 * for open, download (with format picker), archive, and delete.
 * Toggle between "Latest" and "Archive" views.
 */
import { useCallback, useEffect, useState } from 'react';
import { ContextMenuView, type ContextMenuItem, ModalView, ButtonView, ChipView } from '@salilvnair/dui';
import { BookFlip } from '../components/book/BookFlip';
import { PageFlipBook } from '../components/book/PageFlipBook';
import { usePrefsStore } from '../store/prefs-store';
import {
  BookIcon, TrashIcon, DownloadIcon, RefreshIcon, MoreVertIcon,
  ArchiveIcon, UnarchiveIcon, PrintIcon,
} from '../icons';

interface StoryMeta {
  id: string;
  title: string;
  author?: string;
  createdAt: string;
  pageCount: number;
  archived?: boolean;
  chat?: { provider?: string; model?: string } | null;
  image?: { engine?: string; label?: string } | null;
}

const ENGINE_ACCENT: Record<string, string> = { ideogram4: '#8b5cf6', 'zimg-turbo': '#22d3ee', flux2: '#f59e0b' };

type ViewMode = 'latest' | 'archive';

interface PrintOptions { format: 'default' | 'a4'; layout: 'spread' | '1by1' }
interface MenuState { id: string; x: number; y: number }

export function LibraryTab() {
  const [stories, setStories] = useState<StoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('latest');
  const [reading, setReading] = useState<StoryMeta | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [printTarget, setPrintTarget] = useState<StoryMeta | null>(null);
  const [printOpts, setPrintOpts] = useState<PrintOptions>({ format: 'default', layout: 'spread' });
  const [printing, setPrinting] = useState(false);
  const readerMode = usePrefsStore((s) => s.prefs.readerMode);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/stories')
      .then((r) => r.json())
      .then((s) => { setStories(Array.isArray(s) ? s : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const visible = stories.filter((s) => viewMode === 'archive' ? !!s.archived : !s.archived);

  const openReader = (s: StoryMeta) => { setReading(s); setMenu(null); };

  const downloadPdf = (id: string, title: string, format: 'default' | 'a4' = 'default', layout: 'spread' | '1by1' = 'spread') => {
    if (format === 'default' && layout === 'spread') {
      const a = document.createElement('a');
      a.href = `/api/stories/${id}/pdf`;
      a.click();
      return;
    }
    fetch(`/api/stories/${id}/pdf/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, layout }),
    }).then((r) => r.blob()).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${format}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(console.error);
  };

  const handlePrint = async () => {
    if (!printTarget) return;
    setPrinting(true);
    downloadPdf(printTarget.id, printTarget.title, printOpts.format, printOpts.layout);
    setPrinting(false);
    setPrintTarget(null);
  };

  const archiveStory = async (id: string, archive: boolean) => {
    await fetch(`/api/stories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: archive }),
    });
    refresh();
    setMenu(null);
  };

  const deleteStory = async (id: string) => {
    if (!confirm('Delete this storybook permanently?')) return;
    await fetch(`/api/stories/${id}`, { method: 'DELETE' });
    refresh();
    setMenu(null);
  };

  const menuStory = stories.find((s) => s.id === menu?.id) || null;
  const menuItems: ContextMenuItem[] = menuStory ? [
    {
      id: 'open', label: 'Open book', shortcut: '↩',
      icon: <BookIcon size={13} style={{ color: '#60a5fa' }} />,
      onClick: () => openReader(menuStory),
    },
    {
      id: 'download', label: 'Download PDF', shortcut: '⬇',
      icon: <DownloadIcon size={13} style={{ color: '#34d399' }} />,
      onClick: () => { downloadPdf(menuStory.id, menuStory.title); setMenu(null); },
    },
    {
      id: 'print', label: 'Print options…',
      icon: <PrintIcon size={13} style={{ color: '#f59e0b' }} />,
      onClick: () => { setPrintTarget(menuStory); setMenu(null); },
    },
    { id: 'sep1', label: '', separator: true },
    menuStory.archived
      ? {
          id: 'unarchive', label: 'Restore from archive',
          icon: <UnarchiveIcon size={13} style={{ color: '#22d3ee' }} />,
          onClick: () => archiveStory(menuStory.id, false),
        }
      : {
          id: 'archive', label: 'Move to archive',
          icon: <ArchiveIcon size={13} style={{ color: '#a855f7' }} />,
          onClick: () => archiveStory(menuStory.id, true),
        },
    { id: 'sep2', label: '', separator: true },
    {
      id: 'delete', label: 'Delete permanently', danger: true,
      icon: <TrashIcon size={13} style={{ color: '#f87171' }} />,
      onClick: () => deleteStory(menuStory.id),
    },
  ] : [];

  const openMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setMenu({ id, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="lib-tab-root story-tab-scroll">
      {/* Header */}
      <div className="lib-tab-head">
        <div className="lib-tab-title-row">
          <BookIcon size={20} style={{ color: 'var(--story-accent-2)' }} />
          <h2 className="lib-tab-h2">Library</h2>
        </div>
        <div className="lib-tab-actions">
          {/* Archive / Latest toggle */}
          <div className="lib-view-toggle">
            <button
              className={`lib-vt-btn${viewMode === 'latest' ? ' is-active' : ''}`}
              onClick={() => setViewMode('latest')}
            >Latest</button>
            <button
              className={`lib-vt-btn${viewMode === 'archive' ? ' is-active' : ''}`}
              onClick={() => setViewMode('archive')}
            >Archive</button>
          </div>
          <ButtonView size="sm" variant="secondary" iconLeft={<RefreshIcon size={12} />} onClick={refresh}>Refresh</ButtonView>
        </div>
      </div>
      <p className="lib-tab-lead">
        {viewMode === 'archive'
          ? 'Archived storybooks — restore them anytime.'
          : 'Every storybook you generate is saved here — open it as a flip-book or download the PDF.'}
      </p>

      {loading ? (
        <div className="lib-tab-empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="lib-tab-empty">
          <div className="story-empty-emoji">{viewMode === 'archive' ? '🗄️' : '📚'}</div>
          <div className="story-empty-title">
            {viewMode === 'archive' ? 'Archive is empty' : 'No storybooks yet'}
          </div>
          <div className="story-empty-text">
            {viewMode === 'archive'
              ? 'Move stories here to keep things tidy.'
              : 'Generate one from the My Story tab — finished books appear here automatically.'}
          </div>
        </div>
      ) : (
        <div className="book-shelf lib-tab-shelf">
          {visible.map((s) => {
            const imgAccent = ENGINE_ACCENT[s.image?.engine || ''] || '#8b5cf6';
            return (
              <div key={s.id} className="book-card lib-tab-card" onClick={() => openReader(s)}>
                <div className="book-card-cover">
                  <img
                    src={`/api/stories/${s.id}/cover`}
                    alt={s.title}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget.style.display = 'none'); }}
                  />
                  <div className="book-card-spine" />
                  <div className="book-card-open">📖 Read</div>
                </div>
                <div className="book-card-meta">
                  <div className="book-card-title">{s.title}</div>
                  <div className="book-card-sub">
                    {new Date(s.createdAt).toLocaleDateString()} · {s.pageCount} pages
                  </div>
                  <div className="book-card-chips">
                    {s.chat?.model && <ChipView size="xs" color="#34d399" label={`💬 ${s.chat.model}`} />}
                    {s.image?.label && <ChipView size="xs" color={imgAccent} label={`🖼 ${s.image.label}`} />}
                  </div>
                </div>
                <div className="book-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="lib-dl-btn"
                    title="Download PDF"
                    onClick={() => downloadPdf(s.id, s.title)}
                  >
                    <DownloadIcon size={13} />
                  </button>
                  <button
                    className="lib-del-btn"
                    title="Delete"
                    onClick={() => deleteStory(s.id)}
                  >
                    <TrashIcon size={13} />
                  </button>
                  <button
                    className="lib-more-btn"
                    title="More options"
                    onClick={(e) => openMenu(e, s.id)}
                  >
                    <MoreVertIcon size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3-dot context menu */}
      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        onClose={() => setMenu(null)}
        items={menuItems}
        rounded
      />

      {/* Print options modal */}
      <ModalView
        open={!!printTarget}
        onClose={() => setPrintTarget(null)}
        title="Print / Download options"
        subtitle={printTarget?.title || ''}
        size="sm"
        headerColor="var(--story-accent-3)"
        footerRight={
          <ButtonView size="md" accentColor="var(--story-accent)" iconLeft={<DownloadIcon size={14} />} onClick={handlePrint} disabled={printing}>
            {printing ? 'Preparing…' : 'Download PDF'}
          </ButtonView>
        }
      >
        <div className="lib-print-opts">
          <div className="lib-print-group">
            <div className="lib-print-label">Page size</div>
            <div className="lib-print-row">
              {(['default', 'a4'] as const).map((f) => (
                <button
                  key={f}
                  className={`lib-print-chip${printOpts.format === f ? ' is-active' : ''}`}
                  onClick={() => setPrintOpts((o) => ({ ...o, format: f }))}
                >
                  {f === 'default' ? 'Default (A4 wide)' : 'A4 (portrait)'}
                </button>
              ))}
            </div>
          </div>
          <div className="lib-print-group">
            <div className="lib-print-label">Layout</div>
            <div className="lib-print-row">
              {(['spread', '1by1'] as const).map((l) => (
                <button
                  key={l}
                  className={`lib-print-chip${printOpts.layout === l ? ' is-active' : ''}`}
                  onClick={() => setPrintOpts((o) => ({ ...o, layout: l }))}
                >
                  {l === 'spread' ? 'Text + image side by side' : '1-by-1 (image then text)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ModalView>

      {/* Reader modal */}
      <ModalView
        open={!!reading}
        onClose={() => setReading(null)}
        title={reading?.title || ''}
        subtitle={reading ? `${reading.pageCount} pages · ${reading.image?.label || ''}` : ''}
        size="xl"
        headerColor="var(--story-accent-3)"
        headerGradient
        footerRight={reading && (
          <ButtonView size="md" accentColor="var(--story-accent)" iconLeft={<DownloadIcon size={14} />} onClick={() => downloadPdf(reading.id, reading.title)}>
            Download PDF
          </ButtonView>
        )}
      >
        {reading && (
          readerMode === 'pageflip'
            ? <PageFlipBook storyId={reading.id} pageCount={reading.pageCount} title={reading.title} />
            : <BookFlip storyId={reading.id} pageCount={reading.pageCount} title={reading.title} />
        )}
      </ModalView>
    </div>
  );
}

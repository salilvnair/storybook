/**
 * StoryLibrary — your shelf of generated books. Each is a cute cover-image card
 * with chips for the chat + image engine used; click to read it in a flip-book
 * modal or download the PDF. Reads from the server's persisted bundles
 * (~/.salilvnair/istorybook/story/<uuid>/).
 */
import { useCallback, useEffect, useState } from 'react';
import { ButtonView, IconButtonView, ChipView, ModalView, EmptyStateView } from '@salilvnair/dui';
import { BookIcon, TrashIcon, DownloadIcon, CpuIcon, RefreshIcon } from '../../icons';
import { BookFlip } from '../book/BookFlip';

interface StoryMeta {
  id: string;
  title: string;
  author?: string;
  createdAt: string;
  pageCount: number;
  chat?: { provider?: string; model?: string } | null;
  image?: { engine?: string; label?: string } | null;
}

const ENGINE_ACCENT: Record<string, string> = { ideogram4: '#8b5cf6', 'zimg-turbo': '#22d3ee' };

export function StoryLibrary() {
  const [stories, setStories] = useState<StoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState<StoryMeta | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/stories').then((r) => r.json()).then((s) => { setStories(Array.isArray(s) ? s : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const download = (id: string) => {
    const a = document.createElement('a');
    a.href = `/api/stories/${id}/pdf`;
    a.click();
  };
  const del = async (id: string) => {
    if (!confirm('Delete this storybook permanently?')) return;
    await fetch(`/api/stories/${id}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div className="story-tab-scroll">
      <div className="prov-page">
        <div className="prov-section-head" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 15 }}>📚</span>
          <h2 className="story-settings-h2" style={{ margin: 0, flex: 1 }}>Library</h2>
          <ButtonView size="sm" variant="secondary" iconLeft={<RefreshIcon size={12} />} onClick={refresh}>Refresh</ButtonView>
        </div>
        <p className="story-settings-lead">Every storybook you generate is saved here forever — open it as a flip-book or download the PDF.</p>

        {loading ? (
          <div className="tb-saved-empty">Loading…</div>
        ) : stories.length === 0 ? (
          <EmptyStateView icon={<BookIcon size={30} />} title="No storybooks yet"
            message="Generate one from My Story — finished books appear here automatically." />
        ) : (
          <div className="book-shelf">
            {stories.map((s) => {
              const imgAccent = ENGINE_ACCENT[s.image?.engine || ''] || '#8b5cf6';
              return (
                <div key={s.id} className="book-card" onClick={() => setReading(s)} title="Open this book">
                  <div className="book-card-cover">
                    <img src={`/api/stories/${s.id}/cover`} alt={s.title} loading="lazy"
                      onError={(e) => { (e.currentTarget.style.display = 'none'); }} />
                    <div className="book-card-spine" />
                    <div className="book-card-open">📖 Read</div>
                  </div>
                  <div className="book-card-meta">
                    <div className="book-card-title">{s.title}</div>
                    <div className="book-card-sub">{new Date(s.createdAt).toLocaleDateString()} · {s.pageCount} pages</div>
                    <div className="book-card-chips">
                      {s.chat?.model && <ChipView size="xs" color="#34d399" label={`💬 ${s.chat.model}`} />}
                      {s.image?.label && <ChipView size="xs" color={imgAccent} label={`🖼 ${s.image.label}`} />}
                    </div>
                  </div>
                  <div className="book-card-actions" onClick={(e) => e.stopPropagation()}>
                    <IconButtonView size="sm" tooltip="Download PDF" icon={<DownloadIcon size={13} />} onClick={() => download(s.id)} />
                    <IconButtonView size="sm" tooltip="Delete" icon={<TrashIcon size={13} />} accentColor="var(--color-error, #f87171)" onClick={() => del(s.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reader — flip-book modal */}
      <ModalView
        open={!!reading}
        onClose={() => setReading(null)}
        title={reading?.title || ''}
        subtitle={reading ? `${reading.pageCount} pages · ${reading.image?.label || ''}` : ''}
        size="xl"
        headerColor="var(--story-accent-3)"
        headerGradient
        footerRight={reading && (
          <ButtonView size="md" accentColor="var(--story-accent)" iconLeft={<DownloadIcon size={14} />} onClick={() => download(reading.id)}>Download PDF</ButtonView>
        )}
      >
        {reading && <BookFlip storyId={reading.id} pageCount={reading.pageCount} title={reading.title} />}
      </ModalView>
    </div>
  );
}

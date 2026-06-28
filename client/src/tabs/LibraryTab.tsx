/**
 * LibraryTab — your saved storybooks. Lists the PDFs the server bound (from
 * server/output), with open-in-new-tab / download / delete. (S2.05)
 */
import { useEffect, useState, useCallback } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { BookIcon, TrashIcon } from '../icons';

interface Book { name: string; title: string; size: number; createdAt: string }

export function LibraryTab() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/storybook/list').then((r) => r.json()).then((b) => { setBooks(b); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const open = (name: string) => window.open(`/api/storybook/file/${encodeURIComponent(name)}`, '_blank');
  const download = (name: string) => {
    const a = document.createElement('a');
    a.href = `/api/storybook/file/${encodeURIComponent(name)}`;
    a.download = name;
    a.click();
  };
  const del = (name: string) => fetch(`/api/storybook/file/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(refresh);

  return (
    <div className="story-tab-scroll">
      <div className="lib-page">
        <div className="lib-head">
          <BookIcon size={18} style={{ color: 'var(--story-accent-2)' }} />
          <h2 className="story-settings-h2" style={{ margin: 0, flex: 1 }}>Your Storybooks</h2>
          <ButtonView size="sm" accentColor="var(--story-accent-3)" onClick={refresh}>↻ Refresh</ButtonView>
        </div>

        {loading ? (
          <div className="tb-saved-empty">Loading…</div>
        ) : books.length === 0 ? (
          <div className="lib-empty">
            <div className="story-empty-emoji">📚</div>
            <div className="story-empty-title">No storybooks yet</div>
            <div className="story-empty-text">Generate one from the <b>My Story</b> tab — finished books are saved here automatically.</div>
          </div>
        ) : (
          <div className="lib-grid">
            {books.map((b) => (
              <div key={b.name} className="lib-card">
                <button className="lib-cover" onClick={() => open(b.name)} title="Open">
                  <span className="lib-cover-emoji">📖</span>
                </button>
                <div className="lib-meta">
                  <div className="lib-title">{b.title}</div>
                  <div className="lib-sub">{new Date(b.createdAt).toLocaleDateString()} · {(b.size / 1024).toFixed(0)} KB</div>
                </div>
                <div className="lib-actions">
                  <ButtonView size="sm" accentColor="var(--story-accent-3)" onClick={() => open(b.name)}>↗ Open</ButtonView>
                  <ButtonView size="sm" accentColor="var(--story-accent)" onClick={() => download(b.name)}>⬇</ButtonView>
                  <button className="tb-icon" title="Delete" onClick={() => del(b.name)}><TrashIcon size={13} style={{ color: 'var(--color-text-muted)' }} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

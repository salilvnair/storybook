/**
 * StorybookCanvas — the right pane. Shows the generation progress, the cover and
 * per-scene pages as they stream in, and the final PDF download/preview.
 */
import { ButtonView } from '@salilvnair/dui';
import { useStoryStore } from '../store/story-store';
import { useTemplatesStore } from '../store/templates-store';
import { TemplateSchematic } from './template/TemplateSchematic';

function dataUri(b64: string) {
  return b64 ? `data:image/png;base64,${b64}` : '';
}

export function StorybookCanvas() {
  const { story, phase, progress, cover, pages, warns, error, pdfBase64, pdfFilename, reset, regenerating, regeneratePage, regeneratingCover, regenerateCover } = useStoryStore();
  const defaultSpec = useTemplatesStore((s) => s.defaultSpec());
  const savedCount = useTemplatesStore((s) => s.saved.length);
  const canReroll = (phase === 'done' || phase === 'error') && regenerating === null && !regeneratingCover;

  const downloadPdf = () => {
    if (!pdfBase64) return;
    const a = document.createElement('a');
    a.href = `data:application/pdf;base64,${pdfBase64}`;
    a.download = pdfFilename || 'storybook.pdf';
    a.click();
  };

  const openPdf = () => {
    if (!pdfBase64) return;
    const byteChars = atob(pdfBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank');
  };

  const busy = phase === 'generating';
  const showGallery = busy || phase === 'done' || cover || pages.some((p) => p.image_b64);

  return (
    <div className="story-pane-canvas">
      <div className="story-canvas-head">
        <span className="story-canvas-head-title">
          {story ? `📚 ${story.title}` : '📚 Your Storybook'}
        </span>
        {(phase === 'done' || phase === 'error') && (
          <button className="story-icon-btn" title="Clear" onClick={reset}>↺</button>
        )}
      </div>

      <div className="story-canvas-body">
        {/* Idle — show the live template (where text + illustration will go) */}
        {!showGallery && phase === 'idle' && (
          <div className="story-template-idle">
            <div className="story-template-idle-label">
              Your pages will use this template
              <span className="story-template-idle-sub">
                {savedCount > 0 ? 'your default template' : 'the built-in classic spread'} · change it in 🎨 Templates
              </span>
            </div>
            <div className="story-template-idle-frame">
              <TemplateSchematic spec={defaultSpec} labels />
            </div>
            <div className="story-empty-text" style={{ marginTop: 16 }}>
              Chat with iStorybook on the left to dream up a story. When it's ready,
              hit <b>✨ Generate Storybook</b> and each page is illustrated into this layout.
            </div>
          </div>
        )}

        {/* Progress */}
        {busy && (
          <div className="story-progress">
            <div className="story-progress-row">
              <span className="story-progress-spinner" />
              <span className="story-progress-label">{progress.label || 'Working…'}</span>
              <span className="story-progress-pct">{progress.pct}%</span>
            </div>
            <div className="story-progress-track">
              <div className="story-progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="story-progress" style={{ borderColor: 'rgba(248,113,113,0.4)' }}>
            <div className="story-progress-row">
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span className="story-progress-label" style={{ color: '#fca5a5' }}>{error}</span>
            </div>
          </div>
        )}

        {/* Gallery */}
        {showGallery && (
          <div className="story-pages">
            {(cover || busy) && (
              <div className="story-page-card is-cover">
                <div className="story-page-img-wrap">
                  {regeneratingCover ? (
                    <div className="story-page-img-loading">
                      <span className="story-progress-spinner" />
                      <span>Re-rolling cover…</span>
                    </div>
                  ) : cover ? (
                    <img src={dataUri(cover)} alt="Cover" />
                  ) : (
                    <div className="story-page-img-loading">
                      <span className="story-progress-spinner" />
                      <span>Painting the cover…</span>
                    </div>
                  )}
                  {canReroll && cover && (
                    <button
                      className="story-page-reroll"
                      title="Regenerate the cover art"
                      onClick={() => void regenerateCover()}
                    >🔄</button>
                  )}
                </div>
                <div className="story-page-meta">
                  <div className="story-page-num">Cover</div>
                  <div className="story-page-title">{story?.title}</div>
                </div>
              </div>
            )}

            {pages.map((page) => (
              <div key={page.index} className="story-page-card">
                <div className="story-page-img-wrap">
                  {regenerating === page.index ? (
                    <div className="story-page-img-loading">
                      <span className="story-progress-spinner" />
                      <span>Re-rolling…</span>
                    </div>
                  ) : page.image_b64 ? (
                    <img src={dataUri(page.image_b64)} alt={page.title} />
                  ) : (
                    <div className="story-page-img-loading">
                      <span className="story-progress-spinner" />
                      <span>Scene {page.index + 1}</span>
                    </div>
                  )}
                  {/* Per-scene re-roll (S2.02) — shown once the book is done */}
                  {canReroll && page.image_b64 && (
                    <button
                      className="story-page-reroll"
                      title="Regenerate just this page's art"
                      onClick={() => void regeneratePage(page.index)}
                    >🔄</button>
                  )}
                </div>
                <div className="story-page-meta">
                  <div className="story-page-num">Page {page.index + 1}</div>
                  <div className="story-page-title">{page.title}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {warns.length > 0 && (
          <div className="story-warns">
            {warns.map((w, i) => (
              <div key={i} className="story-warn">⚠️ {w}</div>
            ))}
          </div>
        )}

        {/* Result / download */}
        {phase === 'done' && pdfBase64 && (
          <div className="story-result-bar">
            <div className="story-result-text">
              <div className="story-result-title">🎉 Storybook ready!</div>
              <div className="story-result-sub">{story?.title} · {pages.length} pages</div>
            </div>
            <ButtonView size="md" accentColor="var(--story-accent-3)" onClick={openPdf}>👁 Preview</ButtonView>
            <ButtonView size="md" accentColor="var(--story-accent)" onClick={downloadPdf}>⬇ Download PDF</ButtonView>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * StorybookCanvas — the right pane. During generation and after, shows the live
 * flip-book (LiveBookFlip) so the user sees pages appear as they stream in.
 * Idle state shows the live template schematic. Error and result bar are overlaid.
 */
import { ButtonView } from '@salilvnair/dui';
import { useStoryStore } from '../store/story-store';
import { useTemplatesStore } from '../store/templates-store';
import { TemplateSchematic } from './template/TemplateSchematic';
import { LiveBookFlip } from './book/LiveBookFlip';
import { LivePageFlipBook } from './book/LivePageFlipBook';
import { usePrefsStore } from '../store/prefs-store';

function dataUri(b64: string) {
  return b64 ? `data:image/png;base64,${b64}` : '';
}

export function StorybookCanvas() {
  const { story, phase, progress, cover, pages, warns, error, pdfBase64, pdfFilename, reset, regenerating, regeneratePage, regeneratingCover, regenerateCover } = useStoryStore();
  const readerMode = usePrefsStore((s) => s.prefs.readerMode);
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
  const showBook = busy || phase === 'done' || cover || pages.some((p) => p.image_b64);

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

      <div className={`story-canvas-body${showBook ? ' story-canvas-body-book' : ''}`}>
        {/* Idle — show the live template (where text + illustration will go) */}
        {!showBook && phase === 'idle' && (
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

        {/* Error */}
        {phase === 'error' && (
          <div className="story-progress" style={{ borderColor: 'rgba(248,113,113,0.4)', marginBottom: 16 }}>
            <div className="story-progress-row">
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span className="story-progress-label" style={{ color: '#fca5a5' }}>{error}</span>
            </div>
          </div>
        )}

        {/* Live book-flip — replaces the old card grid */}
        {showBook && (readerMode === 'pageflip' && phase === 'done' ? <LivePageFlipBook /> : <LiveBookFlip />)}


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

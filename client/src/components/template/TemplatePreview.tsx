/**
 * TemplatePreview — the right pane of the Template Creator. Shows a LIVE schematic
 * of the current Template Spec (updates instantly as the chat cards edit it).
 * "Generate sample" renders the real PDF and opens it in a NEW TAB (no embedded
 * viewer, so the pane never scrolls). A small bar lets you re-open / download it.
 */
import { ButtonView } from '@salilvnair/dui';
import { useTemplateStore } from '../../store/template-store';
import { useTabsStore } from '../../store/tabs-store';
import { TemplateSchematic } from './TemplateSchematic';

export function TemplatePreview() {
  const { spec, samplePdf, rendering, error, renderSample } = useTemplateStore();
  const openTab = useTabsStore((s) => s.open);

  const downloadSample = () => {
    if (!samplePdf) return;
    const a = document.createElement('a');
    a.href = `data:application/pdf;base64,${samplePdf}`;
    a.download = 'template-sample.pdf';
    a.click();
  };

  const openSample = () => openTab('sample-preview');

  return (
    <div className="tp-pane">
      <div className="tp-head">
        <span className="tp-head-title">📐 Live template preview</span>
        <ButtonView size="md" accentColor="var(--story-accent)" disabled={rendering} onClick={() => void renderSample()}>
          {rendering ? '🎨 Rendering…' : '✨ Generate sample'}
        </ButtonView>
      </div>

      <div className="tp-body">
        <div className="tp-section-label">Layout schematic</div>
        <TemplateSchematic spec={spec} />

        {error && <div className="tp-error">⚠️ {error}</div>}

        {samplePdf ? (
          <div className="tp-sample-bar">
            <span className="tp-sample-ok">✅ Opened in the Sample tab</span>
            <ButtonView size="sm" accentColor="var(--story-accent-3)" onClick={openSample}>Open Sample tab</ButtonView>
            <ButtonView size="sm" accentColor="var(--story-accent)" onClick={downloadSample}>⬇ Download</ButtonView>
          </div>
        ) : (
          <div className="tp-sample-hint">
            Hit <b>✨ Generate sample</b> to render a real PDF page — it opens in a <b>Sample</b> tab here in the app
            (uses placeholder art, no image server needed).
          </div>
        )}
      </div>
    </div>
  );
}

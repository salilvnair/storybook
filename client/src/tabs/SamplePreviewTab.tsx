/** SamplePreviewTab — shows the last rendered template sample PDF in an in-app tab. */
import { useEffect, useMemo } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { useTemplateStore } from '../store/template-store';

/** base64 → Blob URL — far more reliable than a giant data: URL inside an <iframe>. */
function usePdfBlobUrl(base64: string | null): string | null {
  const url = useMemo(() => {
    if (!base64) return null;
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    } catch {
      return null;
    }
  }, [base64]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

export function SamplePreviewTab() {
  const samplePdf = useTemplateStore((s) => s.samplePdf);
  const blobUrl = usePdfBlobUrl(samplePdf);

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'template-sample.pdf';
    a.click();
  };

  if (!samplePdf) {
    return (
      <div className="story-empty">
        <div className="story-empty-emoji">📄</div>
        <div className="story-empty-title">No sample yet</div>
        <div className="story-empty-text">Generate a sample from the <b>Templates</b> tab and it appears here.</div>
      </div>
    );
  }

  return (
    <div className="sp-pane">
      <div className="sp-head">
        <span className="sp-title">📄 Template sample</span>
        <ButtonView size="sm" accentColor="var(--story-accent)" onClick={download}>⬇ Download</ButtonView>
      </div>
      {blobUrl ? (
        <iframe title="Template sample" src={`${blobUrl}#toolbar=1&view=FitH`} className="sp-pdf" />
      ) : (
        <div className="story-empty"><div className="story-empty-text">PDF preview unavailable — use Download.</div></div>
      )}
    </div>
  );
}

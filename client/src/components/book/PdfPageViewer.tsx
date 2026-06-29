import { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  pdfUrl: string;
}

export function PdfPageViewer({ pdfUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    let cancelled = false;

    const loadPdf = async () => {
      const pdf = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
      const containerWidth = container.clientWidth || 760;

      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) break;
        const page = await pdf.getPage(i);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = 'pdf-page-canvas';

        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-page-wrapper';
        const label = document.createElement('div');
        label.className = 'pdf-page-label';
        label.textContent = `Page ${i}`;
        wrapper.appendChild(canvas);
        wrapper.appendChild(label);

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) container.appendChild(wrapper);
      }
    };

    void loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  return <div className="pdf-page-viewer" ref={containerRef} />;
}

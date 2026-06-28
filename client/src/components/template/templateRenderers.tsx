/**
 * ConvEngine custom renderers for the Prompt & PDF template-creation modes. The
 * assistant emits {type:'TemplateControls'|'PdfImport'|'TemplateReady'} payloads;
 * the controls card is bound LIVE to the template-store so the right preview
 * updates instantly. Buttons drive the chat via the `actions` API.
 */
import { useEffect } from 'react';
import { useTemplateStore, PALETTE_THEMES, type TemplateSpec } from '../../store/template-store';

interface Actions {
  submit: (text: string, params?: Record<string, unknown>) => void;
  submitSilent: (params?: Record<string, unknown>) => void;
  appendBubble: (text: string, role?: string) => void;
  prefillInput: (text: string) => void;
}

function TemplateControlsCard({ payload, actions }: { payload: { intro?: string }; actions: Actions }) {
  const spec = useTemplateStore((s) => s.spec);
  const setSpec = useTemplateStore((s) => s.setSpec);
  const renderSample = useTemplateStore((s) => s.renderSample);

  // The LLM (Mode B/PDF) can ship an inferred spec via an [[apply-spec:{…}]] sentinel.
  const rawIntro = payload?.intro || '';
  const specMatch = rawIntro.match(/\[\[apply-spec:([\s\S]*?)\]\]/);
  const intro = rawIntro.replace(/\[\[apply-spec:[\s\S]*?\]\]/, '').trim();
  useEffect(() => {
    if (!specMatch) return;
    try { setSpec(JSON.parse(specMatch[1]) as Partial<TemplateSpec>); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specMatch?.[1]]);

  const seg = <T extends string | boolean>(label: string, value: T, current: T, set: (v: T) => void) => (
    <button key={String(value)} type="button" className={`tcx-seg${current === value ? ' is-active' : ''}`} onClick={() => set(value)}>{label}</button>
  );
  const swatch = (key: keyof TemplateSpec) => (
    <label className="tcx-swatch">
      <input type="color" value={String(spec[key])} onChange={(e) => setSpec({ [key]: e.target.value } as Partial<TemplateSpec>)} />
      <span className="tcx-swatch-dot" style={{ background: String(spec[key]) }} />
    </label>
  );

  return (
    <div className="ce-interactive-card tcx-card">
      {intro && <p className="tcx-intro">{intro}</p>}
      <div className="tcx-row"><span className="tcx-label">Page</span><div className="tcx-segs">
        {seg('Spread', 'spread', spec.pageKind, (v) => setSpec({ pageKind: v }))}
        {seg('Single', 'single', spec.pageKind, (v) => setSpec({ pageKind: v }))}
      </div></div>
      {spec.pageKind === 'spread' && (<>
        <div className="tcx-row"><span className="tcx-label">Shape</span><div className="tcx-segs">
          {seg('2:1', '2:1', spec.aspect, (v) => setSpec({ aspect: v }))}
          {seg('3:2', '3:2', spec.aspect, (v) => setSpec({ aspect: v }))}
          {seg('Square', '1:1', spec.aspect, (v) => setSpec({ aspect: v }))}
        </div></div>
        <div className="tcx-row"><span className="tcx-label">Text on</span><div className="tcx-segs">
          {seg('◧ Left', 'left', spec.textSide, (v) => setSpec({ textSide: v }))}
          {seg('Right ◨', 'right', spec.textSide, (v) => setSpec({ textSide: v }))}
        </div></div>
      </>)}
      <div className="tcx-row"><span className="tcx-label">Palette</span><div className="tcx-themes">
        {PALETTE_THEMES.map((th) => (
          <button key={th.name} type="button" title={th.name} className={`tcx-theme${spec.palette[0] === th.colors[0] ? ' is-active' : ''}`} onClick={() => setSpec({ palette: th.colors })}>
            {th.colors.slice(0, 4).map((c, i) => <span key={i} style={{ background: c }} />)}
          </button>
        ))}
      </div></div>
      <div className="tcx-row"><span className="tcx-label">Colours</span><div className="tcx-swatches">
        <span className="tcx-swatch-wrap">Card {swatch('cardColor')}</span>
        <span className="tcx-swatch-wrap">Frame {swatch('frameColor')}</span>
        <span className="tcx-swatch-wrap">Accent {swatch('emphasisColor')}</span>
      </div></div>
      <button className="ce-interactive-submit tcx-generate" onClick={() => { void renderSample(); actions.submit('Generate a sample', { action: 'sample' }); }}>✨ Generate sample →</button>
    </div>
  );
}
export const templateControlsRenderer = {
  key: 'TemplateControls', priority: 200, hideBubble: false,
  match: ({ effectiveType }: { effectiveType: string }) => effectiveType === 'TemplateControls',
  Component: TemplateControlsCard,
};

function PdfImportCard({ payload, actions }: { payload: { intro?: string }; actions: Actions }) {
  return (
    <div className="ce-interactive-card tcx-card">
      {payload?.intro && <p className="tcx-intro">{payload.intro}</p>}
      <label className="tcx-dropzone">📎 Choose a PDF…
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => actions.submit(`Uploaded ${file.name}`, { action: 'imported', fileName: file.name, fileData: reader.result });
          reader.readAsDataURL(file);
        }} />
      </label>
      <p className="tcx-hint">We’ll read its layout and start a matching template you can tweak.</p>
    </div>
  );
}
export const pdfImportRenderer = {
  key: 'PdfImport', priority: 200, hideBubble: false,
  match: ({ effectiveType }: { effectiveType: string }) => effectiveType === 'PdfImport',
  Component: PdfImportCard,
};

function TemplateReadyCard({ payload, actions }: { payload: { intro?: string }; actions: Actions }) {
  return (
    <div className="ce-interactive-card tcx-card">
      {payload?.intro && <p className="tcx-intro">{payload.intro}</p>}
      <div className="tcx-ready-actions">
        <button className="ce-interactive-submit" onClick={() => actions.appendBubble('✅ Looks good! Save it from the Manual tab to use it in My Story.', 'user')}>👍 Looks good</button>
        <button className="ce-interactive-submit tcx-ghost" onClick={() => actions.submit('Keep tweaking', { action: 'edit' })}>✏ Keep tweaking</button>
      </div>
    </div>
  );
}
export const templateReadyRenderer = {
  key: 'TemplateReady', priority: 200, hideBubble: false,
  match: ({ effectiveType }: { effectiveType: string }) => effectiveType === 'TemplateReady',
  Component: TemplateReadyCard,
};

export const TEMPLATE_RENDERERS = [templateControlsRenderer, pdfImportRenderer, templateReadyRenderer];

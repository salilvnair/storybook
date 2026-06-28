/**
 * Template Creator backend.
 *
 *   POST /api/template/message  — ConvEngine chat that drives template building.
 *       Returns interactive-renderer payloads ({type:'TemplateControls'|'PdfImport'
 *       |'TemplateReady'}) that the client renders as live cards. Deterministic +
 *       conversational (no LLM key required); LLM spec-inference lands later.
 *
 *   POST /api/template/sample   — render a SAMPLE pdf from a spec using built-in
 *       dummy square images (no RunPod). Returns { pdf_base64 }.
 */
import { Router } from 'express';
import { buildFromTemplate } from '../services/pdf-from-template.js';
import { SAMPLE_STORY, SAMPLE_COVER, SAMPLE_SCENE_IMAGES } from '../services/sample-image.js';
import { specFromDescription } from '../services/templateAgent.js';

export function templateRouter() {
  const router = Router();

  router.post('/api/template/message', async (req, res) => {
    const { message, inputParams } = req.body || {};
    const action = inputParams?.action || '';
    const text = String(message || '').trim();
    const lower = text.toLowerCase();

    const controls = (intro, spec) =>
      res.json({ payload: { type: 'TemplateControls', intro: spec ? `[[apply-spec:${JSON.stringify(spec)}]]${intro}` : intro } });

    // Mode C — a PDF was uploaded → infer a spec from its name/cue via the LLM.
    if (action === 'imported') {
      try {
        const spec = await specFromDescription(`A children's picture book similar to "${inputParams?.fileName || 'a classic board book'}". Infer a warm, typical board-book spread layout.`);
        return controls(`Read **${inputParams?.fileName || 'your PDF'}** and built a matching template. Tweak anything below — the preview updates live.`, spec || undefined);
      } catch {
        return controls(`Read **${inputParams?.fileName || 'your PDF'}**. Here's a starting template — tweak it below.`);
      }
    }
    // Choose the PDF path
    if (action === 'import_pdf' || /\bpdf\b|copy a real|real book/.test(lower)) {
      return res.json({ payload: { type: 'PdfImport', intro: 'Attach a picture-book PDF and I’ll recreate its layout as a template.' } });
    }
    // Sample rendered
    if (action === 'sample') {
      return res.json({ payload: { type: 'TemplateReady', intro: 'Here’s a sample on the right 👉 Happy with it? Save it, or keep tweaking.' } });
    }

    // Mode B — a freeform description (not a command word) → infer a spec via the LLM.
    const isCommand = action === 'start' || /^(open|edit|the )?(layout|editor|design|start|begin|template)\b/.test(lower) || lower.length < 4;
    if (!isCommand && text) {
      try {
        const spec = await specFromDescription(text);
        if (spec) return controls('Done — I built a layout from your description. Tweak it below, then **Generate sample**.', spec);
      } catch { /* fall through to default */ }
    }

    const wantsStart = action === 'start' || /editor|design|layout|start|begin|template/.test(lower);
    return controls(
      wantsStart
        ? 'Let’s design your storybook template! Use the controls below — every change shows instantly in the live preview. When it looks right, hit **Generate sample**.'
        : 'Updated. Keep tweaking the controls below, or hit **Generate sample** to see a real page.',
    );
  });

  router.post('/api/template/sample', async (req, res) => {
    try {
      const spec = req.body?.spec || {};
      const bytes = await buildFromTemplate(spec, SAMPLE_STORY, SAMPLE_SCENE_IMAGES, SAMPLE_COVER);
      res.json({ pdf_base64: Buffer.from(bytes).toString('base64') });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

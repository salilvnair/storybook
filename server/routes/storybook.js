/**
 * Storybook generation.
 *   POST /api/storybook/generate   — streaming NDJSON: progress + pages + final PDF
 *   GET  /api/storybook/file/:name — serve a saved PDF
 *
 * Streaming (newline-delimited JSON) keeps the connection alive during the long
 * multi-image RunPod run (avoids Chromium's 300s idle-fetch kill) and lets the
 * canvas show live "scene 2/5" progress and preview each page as it lands.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ensureLoaded, generate as engineGenerate, engineList } from '../services/engines/index.js';
import { resolveImageConfig, getImageConfig, setImageConfig } from '../store/image-config.js';
import { buildScenePrompt } from '../services/storyAgent.js';
import { buildFromTemplate } from '../services/pdf-from-template.js';
import { getConversation } from '../store/conversations.js';
import { getPromptOverrides } from '../store/prompts.js';

export function storybookRouter() {
  const router = Router();

  // ── Image engines: list + config get/set ────────────────────────────────────
  router.get('/api/engines', (_req, res) => {
    res.json({ engines: engineList(), config: getImageConfig() });
  });
  router.get('/api/image-config', (_req, res) => res.json(getImageConfig()));
  router.post('/api/image-config', (req, res) => res.json({ ok: true, config: setImageConfig(req.body || {}) }));

  router.post('/api/storybook/generate', async (req, res) => {
    const { story: bodyStory, conversationId, override, spec, features } = req.body || {};
    const story = bodyStory || (conversationId ? getConversation(conversationId).story : null);
    const ft = features || { magicPrompt: true, autoLoadModel: true };

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    const send = (obj) => { try { res.write(JSON.stringify(obj) + '\n'); } catch { /* client gone */ } };

    if (!story || !Array.isArray(story.scenes) || story.scenes.length === 0) {
      send({ type: 'error', message: 'No story to generate. Finish creating a story in the chat first.' });
      return res.end();
    }

    const scenes = story.scenes;
    const total = scenes.length + 2; // load + cover + scenes
    let step = 0;
    const progress = (label, extra = {}) => {
      step += 1;
      send({ type: 'progress', step, total, pct: Math.round((step / total) * 100), label, ...extra });
    };

    // Prompt Library overrides: illustration style (System) + optional extra (User).
    const ov = getPromptOverrides();
    const baseStyle = (ov.sceneStyle && ov.sceneStyle.trim()) ? ov.sceneStyle : story.style;
    const style = (ov.sceneStyleUser && ov.sceneStyleUser.trim()) ? `${baseStyle}, ${ov.sceneStyleUser.trim()}` : baseStyle;

    // Resolve the active image engine + URL + options (per-request override wins).
    const { engine, url: engineUrl, options: engineOpts } = resolveImageConfig(override);
    const imgOpts = {
      aspect_ratio: engineOpts.aspect_ratio || '1:1',
      // magic prompt only matters for engines that support it (e.g. Ideogram 4)
      magic: ft.magicPrompt !== false && engineOpts.magic !== false,
      preset: engineOpts.preset,
      steps: engineOpts.steps,
      negativePrompt: engineOpts.negativePrompt,
    };
    const genImage = (prompt, extra = {}) => engineGenerate(engine, engineUrl, prompt, { ...imgOpts, ...extra });

    try {
      // 1. Ensure model loaded (skippable via AI Features)
      if (ft.autoLoadModel !== false) {
        send({ type: 'progress', step: 0, total, pct: 2, label: 'Waking up the art studio…' });
        await ensureLoaded(engineUrl);
      }
      progress('Art studio ready');

      // 2. Cover
      const sceneDesc = scenes[0]?.image_prompt || scenes[0]?.narration || '';
      const coverBody = (ov.coverPrompt && ov.coverPrompt.trim())
        ? ov.coverPrompt.replace(/\{\{title\}\}/g, story.title).replace(/\{\{scene\}\}/g, sceneDesc)
        : `Children's picture book cover for "${story.title}". ${sceneDesc}`;
      const coverStylePrefix = (ov.coverPromptStyle && ov.coverPromptStyle.trim()) ? `${ov.coverPromptStyle.trim()}. ` : '';
      const coverPrompt = `${coverStylePrefix}${coverBody}. Style: ${style}.`;
      progress(`Painting the cover…`);
      let coverB64 = '';
      try {
        const cover = await genImage(coverPrompt, { aspect_ratio: '1:1' });
        coverB64 = cover.image_b64 || '';
        send({ type: 'cover', image_b64: coverB64 });
      } catch (e) {
        send({ type: 'warn', message: `Cover failed: ${e.message}` });
      }

      // 3. Per-scene images
      const sceneImages = [];
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        progress(`Illustrating scene ${i + 1} of ${scenes.length}: ${scene.title}`);
        const prompt = buildScenePrompt(scene, style);
        try {
          const img = await genImage(prompt);
          sceneImages[i] = img.image_b64 || '';
          send({ type: 'page', index: i, title: scene.title, image_b64: sceneImages[i] });
        } catch (e) {
          sceneImages[i] = '';
          send({ type: 'warn', message: `Scene ${i + 1} failed: ${e.message}` });
          send({ type: 'page', index: i, title: scene.title, image_b64: '' });
        }
      }

      // 4. Build PDF
      send({ type: 'progress', step: total, total, pct: 99, label: 'Binding the storybook…' });
      // Render through the chosen template (falls back to the default spread).
      const pdfBytes = await buildFromTemplate(spec || {}, story, sceneImages, coverB64);
      const pdfB64 = Buffer.from(pdfBytes).toString('base64');

      // Save to disk
      const safe = (story.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const filename = `${safe}_${Date.now()}.pdf`;
      try { fs.writeFileSync(path.join(config.outputDir, filename), Buffer.from(pdfBytes)); } catch { /* ignore */ }

      send({ type: 'done', pdf_base64: pdfB64, filename, title: story.title });
      res.end();
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      res.end();
    }
  });

  // ── Regenerate a single scene's image (S2.02) ───────────────────────────────
  router.post('/api/storybook/regenerate-scene', async (req, res) => {
    try {
      const { scene, style, override } = req.body || {};
      if (!scene) return res.status(400).json({ error: 'scene required' });
      const ov = getPromptOverrides();
      const useStyle = style || (ov.sceneStyle && ov.sceneStyle.trim()) || 'bright flat cartoon illustration for a children picture book';
      const prompt = buildScenePrompt(scene, useStyle);
      const { engine, url, options } = resolveImageConfig(override);
      const img = await engineGenerate(engine, url, prompt, {
        aspect_ratio: options.aspect_ratio || '1:1', magic: options.magic, preset: options.preset,
        steps: options.steps, negativePrompt: options.negativePrompt,
      });
      res.json({ image_b64: img.image_b64, seed: img.seed });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Saved storybooks library ────────────────────────────────────────────────
  router.get('/api/storybook/list', (_req, res) => {
    try {
      const files = fs.readdirSync(config.outputDir).filter((f) => f.endsWith('.pdf'));
      const books = files.map((name) => {
        const st = fs.statSync(path.join(config.outputDir, name));
        // filename: <slug>_<timestamp>.pdf → friendly title
        const base = name.replace(/\.pdf$/, '').replace(/_\d{10,}$/, '');
        const title = base.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || name;
        return { name, title, size: st.size, createdAt: st.mtime.toISOString() };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json(books);
    } catch {
      res.json([]);
    }
  });

  router.get('/api/storybook/file/:name', (req, res) => {
    const name = path.basename(req.params.name);
    const file = path.join(config.outputDir, name);
    if (!file.startsWith(config.outputDir) || !fs.existsSync(file)) {
      return res.status(404).json({ error: 'not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(file);
  });

  router.delete('/api/storybook/file/:name', (req, res) => {
    const name = path.basename(req.params.name);
    const file = path.join(config.outputDir, name);
    if (file.startsWith(config.outputDir) && fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
    res.json({ ok: true });
  });

  return router;
}

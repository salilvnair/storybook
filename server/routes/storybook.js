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
import { ensureLoaded, generate as engineGenerate, generateStream as engineGenerateStream, engineList, status as engineStatus, getEngine } from '../services/engines/index.js';
import { resolveImageConfig, getImageConfig, setImageConfig } from '../store/image-config.js';
import { audioEngineList, audioEngineGenerate, audioEngineStatus, audioEngineClone } from '../services/audio-engines/index.js';
import { resolveAudioConfig, getAudioConfig, setAudioConfig } from '../store/audio-config.js';
import { musicEngineList, musicEngineGenerate, musicEngineStatus } from '../services/music-engines/index.js';
import { resolveMusicConfig, getMusicConfig, setMusicConfig } from '../store/music-config.js';
import {
  DEFAULT_SCENE_STYLE, DEFAULT_COVER_PROMPT, DEFAULT_PHOTO_HERO_PROMPT,
  DEFAULT_ART_DIRECTOR_PROMPT, MUSIC_MOOD_PROMPTS,
  DEFAULT_BRANCHING_PROMPT,
  DEFAULT_TRANSLATE_PROMPT, DEFAULT_ADAPT_LEVEL_PROMPT, DEFAULT_PHONICS_PROMPT,
  DEFAULT_QUIZ_PROMPT, DEFAULT_VOCAB_PROMPT,
} from '../services/prompt-templates.js';
import { chat } from '../services/llm.js';
import { saveStory, listStories, getStory, storyFile, removeStory, patchStoryMeta } from '../store/story-library.js';
import { buildScenePrompt, buildCharacterClause } from '../services/storyAgent.js';
import { buildFromTemplate } from '../services/pdf-from-template.js';
import { getConversation, resetConversation } from '../store/conversations.js';
import { getPromptOverrides } from '../store/prompts.js';

export function storybookRouter() {
  const router = Router();

  // ── Image engines: list + config get/set ────────────────────────────────────
  router.get('/api/engines', (_req, res) => {
    res.json({ engines: engineList(), config: getImageConfig() });
  });
  router.get('/api/image-config', (_req, res) => res.json(getImageConfig()));
  router.post('/api/image-config', (req, res) => res.json({ ok: true, config: setImageConfig(req.body || {}) }));

  // ── Story Library (persisted bundles in ~/.salilvnair/istorybook/story) ──────
  router.get('/api/stories', (_req, res) => res.json(listStories()));
  router.get('/api/stories/:id', (req, res) => {
    const rec = getStory(req.params.id);
    return rec ? res.json(rec) : res.status(404).json({ error: 'not found' });
  });
  router.delete('/api/stories/:id', (req, res) => res.json({ ok: removeStory(req.params.id) }));
  router.patch('/api/stories/:id', (req, res) => {
    const updated = patchStoryMeta(req.params.id, req.body || {});
    return updated ? res.json(updated) : res.status(404).json({ error: 'not found' });
  });
  router.get('/api/stories/:id/cover', (req, res) => {
    const f = storyFile(req.params.id, 'cover.png');
    if (!f) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(f).pipe(res);
  });
  router.get('/api/stories/:id/page/:n', (req, res) => {
    const f = storyFile(req.params.id, `page-${parseInt(req.params.n, 10)}.png`);
    if (!f) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(f).pipe(res);
  });
  router.get('/api/stories/:id/pdf', (req, res) => {
    const f = storyFile(req.params.id, 'book.pdf');
    if (!f) return res.status(404).end();
    const rec = getStory(req.params.id);
    const name = `${(rec?.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    fs.createReadStream(f).pipe(res);
  });

  // Health of the configured image engine — pings its /status so the header dot
  // can show green (reachable) / red (no URL or unreachable).
  router.get('/api/image-config/health', async (_req, res) => {
    const { engine, url } = resolveImageConfig();
    const configured = !!url && !url.includes('REPLACE') && !url.includes('xxxxx');
    if (!configured) return res.json({ engine, configured: false, ok: false });
    try {
      const s = await engineStatus(url);
      res.json({ engine, url, configured: true, ok: true, status: s.status });
    } catch (err) {
      res.json({ engine, url, configured: true, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Audio engines: list + config get/set ────────────────────────────────────
  router.get('/api/engines/audio', (_req, res) => {
    res.json({ engines: audioEngineList(), config: getAudioConfig() });
  });
  router.get('/api/audio-config', (_req, res) => res.json(getAudioConfig()));
  router.post('/api/audio-config', (req, res) => res.json({ ok: true, config: setAudioConfig(req.body || {}) }));

  // Health of the configured TTS engine
  router.get('/api/audio-config/health', async (_req, res) => {
    const { engine, url } = resolveAudioConfig();
    const configured = !!url && !url.includes('REPLACE') && !url.includes('xxxxx');
    if (!configured) return res.json({ engine, configured: false, ok: false });
    try {
      const s = await audioEngineStatus(url);
      res.json({ engine, url, configured: true, ok: true, status: s.status || 'ok' });
    } catch (err) {
      res.json({ engine, url, configured: true, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Narrate a page — POST { text, voice?, speed?, format? }
  router.post('/api/storybook/narrate', async (req, res) => {
    const { text, voice, speed, format } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    try {
      const { engine, url, options } = resolveAudioConfig();
      const data = await audioEngineGenerate(engine, url, text, {
        voice: voice || options.voice,
        speed: speed != null ? speed : options.speed,
        format: format || options.format || 'wav',
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/voice/clone — clone a voice from a reference audio sample (Fish Speech / F5-TTS)
  router.post('/api/voice/clone', async (req, res) => {
    const { label, sample_b64, ref_text, consent_given } = req.body || {};
    if (!consent_given) return res.status(400).json({ error: 'Consent is required to process a voice sample.' });
    if (!sample_b64) return res.status(400).json({ error: 'sample_b64 is required' });
    try {
      const { engine, url } = resolveAudioConfig();
      const data = await audioEngineClone(engine, url, sample_b64, ref_text);
      res.json({ ok: true, clone_voice_id: data.voice_id || data.id || `cloned-${Date.now()}`, engine_id: engine });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Music engines: list + config + health + score ───────────────────────────
  router.get('/api/engines/music', (_req, res) => {
    res.json({ engines: musicEngineList(), config: getMusicConfig() });
  });
  router.get('/api/music-config', (_req, res) => res.json(getMusicConfig()));
  router.post('/api/music-config', (req, res) => res.json({ ok: true, config: setMusicConfig(req.body || {}) }));
  router.get('/api/music-config/health', async (_req, res) => {
    const { engine, url } = resolveMusicConfig();
    const configured = !!url && !url.includes('REPLACE');
    if (!configured) return res.json({ engine, configured: false, ok: false });
    try {
      const s = await musicEngineStatus(url);
      res.json({ engine, url, configured: true, ok: true, status: s.status || 'ok' });
    } catch (err) {
      res.json({ engine, url, configured: true, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Generate background music score — POST { mood, duration?, format? }
  router.post('/api/storybook/score', async (req, res) => {
    const { mood = 'playful', duration, format } = req.body || {};
    const moodPrompt = MUSIC_MOOD_PROMPTS[mood] || MUSIC_MOOD_PROMPTS.playful;
    try {
      const { engine, url, options } = resolveMusicConfig();
      if (!url) return res.status(503).json({ error: 'Music engine URL not configured. Set it in Settings → Music.' });
      const data = await musicEngineGenerate(engine, url, moodPrompt, {
        duration: duration ?? options.duration ?? 30,
        format: format || options.format || 'wav',
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // AI Art Director — POST { title, summary, styles[] } → LLM → { suggestedStyleId, mood, reasoning, musicMood }
  router.post('/api/storybook/art-director', async (req, res) => {
    const { title, summary, styles = [] } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const ov = getPromptOverrides();
    const styleList = styles.map((s) => `"${s.id}": ${s.label}`).join(', ');
    const systemText = (ov.artDirectorPrompt || DEFAULT_ART_DIRECTOR_PROMPT)
      .replace('{{title}}', title)
      .replace('{{summary}}', summary || '(no summary)')
      .replace('{{styles}}', styleList);
    try {
      const { content } = await chat(
        [{ role: 'system', content: systemText }, { role: 'user', content: `Analyse this story and suggest the best style.` }],
        { stage: 'Art Director', temperature: 0.3 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(clean);
      res.json({ ok: true, ...parsed });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Conversation reset (clear server-side history for a tab) ─────────────────
  router.post('/api/v1/conversation/reset/:id', (req, res) => {
    resetConversation(req.params.id);
    res.json({ ok: true });
  });

  // ── Alternative PDF formats ───────────────────────────────────────────────────
  // GET /api/stories/:id/pdf/a4  — A4 single pages (text left, image right)
  // GET /api/stories/:id/pdf/1by1 — A4 single pages alternating text then image
  router.post('/api/stories/:id/pdf/format', async (req, res) => {
    try {
      const rec = getStory(req.params.id);
      if (!rec) return res.status(404).json({ error: 'not found' });
      const { format = 'default', layout = 'spread' } = req.body || {};
      // load images from disk
      const coverPath = storyFile(req.params.id, 'cover.png');
      const coverB64 = coverPath ? fs.readFileSync(coverPath).toString('base64') : '';
      const pageImages = (rec.story?.scenes || []).map((_, i) => {
        const f = storyFile(req.params.id, `page-${i + 1}.png`);
        return f ? fs.readFileSync(f).toString('base64') : '';
      });
      const spec = layout === '1by1'
        ? { pageKind: 'single', aspect: '1:1' }
        : { pageKind: 'spread', aspect: '2:1' };
      const opts = format === 'a4' ? { pageSize: 'A4' } : {};
      const pdfBytes = await buildFromTemplate(spec, rec.story, pageImages, coverB64, opts);
      const name = `${(rec.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${format}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/api/storybook/generate', async (req, res) => {
    const { story: bodyStory, conversationId, override, spec, features, meta: clientMeta, cast } = req.body || {};
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

    // Character consistency clause — injected into every scene + cover prompt.
    const characterClause = buildCharacterClause(Array.isArray(cast) ? cast : [], ov.characterClause);

    // Resolve the active image engine + URL + options (per-request override wins).
    const { engine, url: engineUrl, options: engineOpts } = resolveImageConfig(override);
    const imgOpts = {
      aspect_ratio: engineOpts.aspect_ratio || '1:1',
      // magic prompt only matters for engines that support it (e.g. Ideogram 4)
      magic: ft.magicPrompt !== false && engineOpts.magic !== false,
      preset: engineOpts.preset,
      steps: engineOpts.steps,
      negativePrompt: engineOpts.negativePrompt,
      model: engineOpts.model || '',
    };
    const genImage = (prompt, extra = {}) => engineGenerateStream(
      engine, engineUrl, prompt, { ...imgOpts, ...extra },
      (step) => send({ type: 'gen_step', step: step.step, total: step.total, pct: step.pct, elapsed_s: step.elapsed_s, it_s: step.it_s, prompt: step.prompt_used || prompt.slice(0, 80), seed: step.seed, config: step.config }),
    );

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
        : DEFAULT_COVER_PROMPT.replace('{{title}}', story.title).replace('{{scene}}', sceneDesc);
      const coverStylePrefix = (ov.coverPromptStyle && ov.coverPromptStyle.trim()) ? `${ov.coverPromptStyle.trim()}. ` : '';
      const coverCharClause = characterClause ? ` ${characterClause}` : '';
      const coverPrompt = `${coverStylePrefix}${coverBody}.${coverCharClause} Style: ${style}.`;
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
        const prompt = buildScenePrompt(scene, style, characterClause);
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

      // Save to disk (flat PDF — back-compat with the old library list)
      const safe = (story.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const filename = `${safe}_${Date.now()}.pdf`;
      try { fs.writeFileSync(path.join(config.outputDir, filename), Buffer.from(pdfBytes)); } catch { /* ignore */ }

      // Persist the full bundle to ~/.salilvnair/istorybook/story/<uuid>/ + meta.
      let savedId = null;
      try {
        const rec = saveStory({
          story, cover: coverB64, pages: sceneImages, pdfB64,
          meta: {
            chat: clientMeta?.chat || null,
            image: clientMeta?.image || { engine, label: getEngine(engine)?.label },
          },
        });
        savedId = rec.id;
      } catch { /* non-fatal */ }

      send({ type: 'done', pdf_base64: pdfB64, filename, title: story.title, storyId: savedId });
      res.end();
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      res.end();
    }
  });

  // ── Rebuild PDF after a re-roll (cover or page) ────────────────────────────
  router.post('/api/storybook/rebuild-pdf', async (req, res) => {
    try {
      const { story, cover, pages: pageImages, spec } = req.body || {};
      if (!story) return res.status(400).json({ error: 'story required' });
      const pdfBytes = await buildFromTemplate(spec || {}, story, pageImages || [], cover || '');
      const pdfB64 = Buffer.from(pdfBytes).toString('base64');
      const safe = (story.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const filename = `${safe}_${Date.now()}.pdf`;
      res.json({ pdf_base64: pdfB64, filename });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Regenerate a single scene's image (S2.02) ───────────────────────────────
  router.post('/api/storybook/regenerate-scene', async (req, res) => {
    try {
      const { scene, style, override, cast, lockedSeed } = req.body || {};
      if (!scene) return res.status(400).json({ error: 'scene required' });
      const ov = getPromptOverrides();
      const useStyle = style || (ov.sceneStyle && ov.sceneStyle.trim()) || DEFAULT_SCENE_STYLE;
      const clause = buildCharacterClause(Array.isArray(cast) ? cast : [], ov.characterClause);
      const prompt = buildScenePrompt(scene, useStyle, clause);
      const { engine, url, options } = resolveImageConfig(override);
      const img = await engineGenerate(engine, url, prompt, {
        aspect_ratio: options.aspect_ratio || '1:1', magic: options.magic, preset: options.preset,
        steps: options.steps, negativePrompt: options.negativePrompt, model: options.model || '',
        ...(lockedSeed != null ? { seed: lockedSeed } : {}),
      });
      res.json({ image_b64: img.image_b64, seed: img.seed });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Regenerate the cover image ──────────────────────────────────────────────
  router.post('/api/storybook/regenerate-cover', async (req, res) => {
    try {
      const { story, override, cast } = req.body || {};
      if (!story) return res.status(400).json({ error: 'story required' });
      const ov = getPromptOverrides();
      const baseStyle = (ov.sceneStyle && ov.sceneStyle.trim()) ? ov.sceneStyle : story.style;
      const style = (ov.sceneStyleUser && ov.sceneStyleUser.trim()) ? `${baseStyle}, ${ov.sceneStyleUser.trim()}` : baseStyle;
      const sceneDesc = story.scenes?.[0]?.image_prompt || story.scenes?.[0]?.narration || '';
      const coverBody = (ov.coverPrompt && ov.coverPrompt.trim())
        ? ov.coverPrompt.replace(/\{\{title\}\}/g, story.title).replace(/\{\{scene\}\}/g, sceneDesc)
        : DEFAULT_COVER_PROMPT.replace('{{title}}', story.title).replace('{{scene}}', sceneDesc);
      const coverStylePrefix = (ov.coverPromptStyle && ov.coverPromptStyle.trim()) ? `${ov.coverPromptStyle.trim()}. ` : '';
      const clause = buildCharacterClause(Array.isArray(cast) ? cast : [], ov.characterClause);
      const coverCharClause = clause ? ` ${clause}` : '';
      const prompt = `${coverStylePrefix}${coverBody}.${coverCharClause} Style: ${style}.`;
      const { engine, url, options } = resolveImageConfig(override);
      const img = await engineGenerate(engine, url, prompt, {
        aspect_ratio: '1:1', magic: options.magic, preset: options.preset, steps: options.steps, negativePrompt: options.negativePrompt, model: options.model || '',
      });
      res.json({ image_b64: img.image_b64, seed: img.seed });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Photo → Hero (S15) ─────────────────────────────────────────────────────
  // Privacy-first: only routes to local engine URLs (localhost / LAN).
  // The photo is never written to disk — processed in memory, returned as base64.
  router.post('/api/storybook/photo-to-hero', async (req, res) => {
    try {
      const { photo_b64, artStyle, consentGiven, cast, variantCount = 2 } = req.body || {};
      if (!consentGiven) return res.status(400).json({ error: 'Consent is required before processing photos.' });
      if (!photo_b64) return res.status(400).json({ error: 'photo_b64 required' });

      const ov = getPromptOverrides();
      const { engine, url, options } = resolveImageConfig();

      // Privacy gate: only local engine URLs are allowed for photo processing.
      const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url || '');
      if (!isLocal) {
        return res.status(403).json({
          error: 'Photo → Hero requires a local image engine (localhost / LAN). Configure a local engine URL in Settings → Providers.',
          requiresLocal: true,
        });
      }

      const style = artStyle || (ov.sceneStyle && ov.sceneStyle.trim()) || DEFAULT_SCENE_STYLE;
      const characterClause = buildCharacterClause(Array.isArray(cast) ? cast : [], ov.characterClause);
      const heroTemplate = (ov.photoHeroPrompt && ov.photoHeroPrompt.trim()) ? ov.photoHeroPrompt : DEFAULT_PHOTO_HERO_PROMPT;
      const heroBase = heroTemplate.replace('{{characterClause}}', characterClause ? characterClause + ' ' : '').trimEnd();
      const prompt = `${heroBase} Style: ${style}.`;

      const imgOpts = {
        aspect_ratio: '1:1',
        magic: options.magic,
        preset: options.preset,
        steps: options.steps,
        negativePrompt: options.negativePrompt,
        model: options.model || '',
        referenceImage: photo_b64,
      };

      const count = Math.min(Math.max(1, parseInt(String(variantCount), 10) || 2), 4);
      const tasks = Array.from({ length: count }, () => engineGenerate(engine, url, prompt, imgOpts));
      const results = await Promise.allSettled(tasks);

      const variants = results
        .filter((r) => r.status === 'fulfilled' && r.value?.image_b64)
        .map((r) => ({ image_b64: r.value.image_b64, seed: r.value.seed }));

      if (variants.length === 0) {
        throw new Error('Image engine returned no results. Check that it is running and reachable.');
      }

      res.json({ variants });
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

  // ── S21 — Interactive Branching ───────────────────────────────────────────────
  router.post('/api/storybook/add-choices', async (req, res) => {
    const { story } = req.body || {};
    if (!story) return res.status(400).json({ error: 'story required' });
    const ov = getPromptOverrides();
    const systemText = ov.branchingPrompt || DEFAULT_BRANCHING_PROMPT;
    const userText = systemText.replace('{{story}}', JSON.stringify(story, null, 2));
    try {
      const { content } = await chat(
        [{ role: 'user', content: userText }],
        { stage: 'Branching', temperature: 0.6 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const branched = JSON.parse(clean);
      res.json({ ok: true, story: branched });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S22 — Translate ───────────────────────────────────────────────────────────
  router.post('/api/storybook/translate', async (req, res) => {
    const { story, targetLanguage } = req.body || {};
    if (!story || !targetLanguage) return res.status(400).json({ error: 'story and targetLanguage required' });
    const ov = getPromptOverrides();
    const prompt = (ov.translatePrompt || DEFAULT_TRANSLATE_PROMPT)
      .replace('{{targetLanguage}}', targetLanguage)
      .replace('{{story}}', JSON.stringify(story, null, 2));
    try {
      const { content } = await chat(
        [{ role: 'user', content: prompt }],
        { stage: 'Translate', temperature: 0.2 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, story: JSON.parse(clean) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S22 — Adapt reading level ─────────────────────────────────────────────────
  router.post('/api/storybook/adapt-level', async (req, res) => {
    const { story, level } = req.body || {};
    if (!story || !level) return res.status(400).json({ error: 'story and level required' });
    const ov = getPromptOverrides();
    const prompt = (ov.adaptLevelPrompt || DEFAULT_ADAPT_LEVEL_PROMPT)
      .replace(/\{\{level\}\}/g, level)
      .replace('{{story}}', JSON.stringify(story, null, 2));
    try {
      const { content } = await chat(
        [{ role: 'user', content: prompt }],
        { stage: 'AdaptLevel', temperature: 0.3 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, story: JSON.parse(clean) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S22 — Phonics emphasis ────────────────────────────────────────────────────
  router.post('/api/storybook/phonics', async (req, res) => {
    const { story, words = [] } = req.body || {};
    if (!story) return res.status(400).json({ error: 'story required' });
    const ov = getPromptOverrides();
    const prompt = (ov.phonicsPrompt || DEFAULT_PHONICS_PROMPT)
      .replace('{{words}}', words.join(', '))
      .replace('{{story}}', JSON.stringify(story, null, 2));
    try {
      const { content } = await chat(
        [{ role: 'user', content: prompt }],
        { stage: 'Phonics', temperature: 0.1 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, story: JSON.parse(clean) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S23 — Comprehension quiz + SEL + parent prompts ──────────────────────────
  router.post('/api/storybook/quiz', async (req, res) => {
    const { story } = req.body || {};
    if (!story) return res.status(400).json({ error: 'story required' });
    const ov = getPromptOverrides();
    const prompt = (ov.quizPrompt || DEFAULT_QUIZ_PROMPT)
      .replace('{{story}}', JSON.stringify(story, null, 2));
    try {
      const { content } = await chat(
        [{ role: 'user', content: prompt }],
        { stage: 'Quiz', temperature: 0.4 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, ...JSON.parse(clean) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S23 — Vocabulary card lookup ──────────────────────────────────────────────
  router.post('/api/storybook/vocab', async (req, res) => {
    const { word, context = '' } = req.body || {};
    if (!word) return res.status(400).json({ error: 'word required' });
    const ov = getPromptOverrides();
    const prompt = (ov.vocabPrompt || DEFAULT_VOCAB_PROMPT)
      .replace(/\{\{word\}\}/g, word)
      .replace('{{context}}', context);
    try {
      const { content } = await chat(
        [{ role: 'user', content: prompt }],
        { stage: 'Vocab', temperature: 0.3 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, ...JSON.parse(clean) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

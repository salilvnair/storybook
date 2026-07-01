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
import { config, isLlmConfigured } from '../config.js';
import { ensureLoaded, generate as engineGenerate, generateStream as engineGenerateStream, engineList, status as engineStatus, getEngine } from '../services/engines/index.js';
import { resolveImageConfig, getImageConfig, setImageConfig } from '../store/image-config.js';
import { editEngineList, editGenerate, status as editStatus, isDirectEngine } from '../services/edit-engines/index.js';
import { editGenerateGptImage } from '../services/edit-engines/gpt-image.js';
import { resolveEditConfig, getEditConfig, setEditConfig, isEditConfigured } from '../store/edit-config.js';
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
  DEFAULT_IMAGE_EDITOR_PROMPT,
} from '../services/prompt-templates.js';
import { chat } from '../services/llm.js';
import { saveStory, listStories, getStory, storyFile, removeStory, patchStoryMeta, saveStoryImage } from '../store/story-library.js';
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
  router.post('/api/image-config', async (req, res) => {
    const body = req.body || {};
    // Extract and save cloud API keys to OS keychain; strip them from stored config
    const { saveApiKey } = await import('../config.js');
    const urls = body.urls || {};
    if (urls['openrouter'] !== undefined) { await saveApiKey('openrouter-api-key', urls['openrouter']); urls['openrouter'] = ''; }
    if (urls['gpt-image'] !== undefined)  { await saveApiKey('openai-api-key',    urls['gpt-image']);  urls['gpt-image'] = ''; }
    res.json({ ok: true, config: setImageConfig({ ...body, urls }) });
  });

  // ── Edit (inpaint) engines: list + config get/set + health (S-E2) ────────────
  router.get('/api/engines/edit', (_req, res) => res.json({ engines: editEngineList(), config: getEditConfig() }));
  router.get('/api/edit-config', (_req, res) => res.json(getEditConfig()));
  router.post('/api/edit-config', async (req, res) => {
    const body = req.body || {};
    const { saveApiKey } = await import('../config.js');
    const urls = body.urls || {};
    if (urls['openrouter-edit'] !== undefined) { await saveApiKey('openrouter-api-key', urls['openrouter-edit']); urls['openrouter-edit'] = ''; }
    if (urls['gpt-image-1'] !== undefined)     { await saveApiKey('openai-api-key',     urls['gpt-image-1']);     urls['gpt-image-1'] = ''; }
    res.json({ ok: true, config: setEditConfig({ ...body, urls }) });
  });
  router.get('/api/edit-config/health', async (_req, res) => {
    const { engine, url } = resolveEditConfig();
    // Direct cloud engines — no local URL; configured = API key present.
    if (isDirectEngine(engine)) {
      if (engine === 'openrouter-edit') {
        const { getOpenRouterKey } = await import('../config.js');
        const hasKey = !!(await getOpenRouterKey(url));
        return res.json({ engine, configured: hasKey, ok: hasKey, status: hasKey ? 'api-key-ok' : 'no-api-key' });
      }
      // gpt-image-1 (OpenAI)
      const { getOpenAiImageKey } = await import('../config.js');
      const hasKey = !!(await getOpenAiImageKey(url));
      return res.json({ engine, configured: hasKey, ok: hasKey, status: hasKey ? 'api-key-ok' : 'no-api-key' });
    }
    const configured = !!url && !url.includes('REPLACE') && !url.includes('xxxxx');
    if (!configured) return res.json({ engine, configured: false, ok: false });
    try {
      const s = await editStatus(url);
      res.json({ engine, url, configured: true, ok: true, status: s.status });
    } catch (err) {
      res.json({ engine, url, configured: true, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

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
    // `styles` may arrive as a pre-joined string (current client) or an array of
    // { id, label }. Accept both — calling .map() on a string crashed the server.
    const styleList = Array.isArray(styles)
      ? styles.map((s) => `"${s.id}": ${s.label}`).join(', ')
      : String(styles || '');
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

  // ── AI Image Edit (S-E2/S-E4) ──────────────────────────────────────────────
  // The client sends image + brush mask + instruction. We (optionally) refine the
  // instruction into a tight inpaint prompt via the "Image Editor" prompt entry,
  // then:
  //   • if an Edit Engine is configured (Settings → Edit Engine) → real inpaint
  //     through editGenerate() → returns the repainted image.
  //   • otherwise → STUB: echo the image with stub:true. The panel renders a
  //     visible masked-region preview so the round-trip is verifiable without a GPU.
  router.post('/api/storybook/edit-image', async (req, res) => {
    const { image_b64, mask_b64, instruction = '', currentPrompt = '', override } = req.body || {};
    if (!image_b64) return res.status(400).json({ error: 'image_b64 required' });
    let prompt = String(instruction || '').trim();
    try {
      const ov = getPromptOverrides();
      const sys = (ov.imageEditorPrompt || DEFAULT_IMAGE_EDITOR_PROMPT);
      if (prompt && isLlmConfigured()) {
        const user = sys.replace(/\{\{instruction\}\}/g, prompt).replace(/\{\{currentPrompt\}\}/g, currentPrompt || '');
        const { content } = await chat([{ role: 'user', content: user }], { stage: 'Image Edit', temperature: 0.4 });
        if (content && content.trim()) prompt = content.trim();
      }
    } catch { /* keep the raw instruction */ }

    // Real inpaint when an edit engine is wired up.
    if (isEditConfigured(override)) {
      try {
        const { engine, url, options } = resolveEditConfig(override);
        // GPT Image 1 calls OpenAI directly — no local server URL needed.
        if (isDirectEngine(engine)) {
          if (engine === 'openrouter-edit') {
            // editGenerate() handles openrouter-edit dispatch internally
            const img = await editGenerate(engine, url, { image_b64, mask_b64: mask_b64 || null, prompt, model: options.model });
            return res.json({ ok: true, image_b64: img.image_b64, mask_b64: mask_b64 || null, prompt, seed: null, engine, stub: false });
          }
          // gpt-image-1 (OpenAI)
          const { getOpenAiImageKey } = await import('../config.js');
          const img = await editGenerateGptImage({ image_b64, mask_b64: mask_b64 || null, prompt, model: options.model, quality: options.quality, size: options.size }, await getOpenAiImageKey(url));
          return res.json({ ok: true, image_b64: img.image_b64, mask_b64: mask_b64 || null, prompt, seed: null, engine, stub: false });
        }
        const img = await editGenerate(engine, url, {
          image_b64, mask_b64: mask_b64 || null, prompt,
          steps: options.steps, guidance: options.guidance, seed: options.seed,
        });
        return res.json({ ok: true, image_b64: img.image_b64, mask_b64: mask_b64 || null, prompt, seed: img.seed, engine, stub: false });
      } catch (err) {
        return res.status(502).json({ error: err instanceof Error ? err.message : String(err), prompt });
      }
    }

    // Stub fallback — no engine configured.
    res.json({
      ok: true,
      image_b64,            // unchanged (stub) — a configured engine returns the inpainted image
      mask_b64: mask_b64 || null,
      prompt,
      stub: true,
      note: 'No Edit Engine configured yet — image returned unchanged. Connect one in Settings → Edit Engine for real inpaint.',
    });
  });

  // ── Persist an edited image back into a saved story (S-E5) ─────────────────
  // Used by the reader's 🖌 Edit button: after AIEditPanel produces a new image
  // (stub today, real inpaint once S-E1/S-E2 land), write it to cover.png /
  // page-N.png so the edit survives a reload. PDF is rebuilt best-effort.
  router.post('/api/stories/:id/image', async (req, res) => {
    try {
      const { slot, image_b64 } = req.body || {};
      if (!image_b64) return res.status(400).json({ error: 'image_b64 required' });
      if (slot == null) return res.status(400).json({ error: 'slot required ("cover" or a page number)' });
      const result = saveStoryImage(req.params.id, slot, image_b64);
      if (!result.ok) return res.status(404).json({ error: 'story not found or image could not be saved' });
      res.json({ ok: true, file: result.file });
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

  // ── S39 — Multi-character cast relationships ──────────────────────────────────
  // POST /api/storybook/cast-relationship { castA, castB, relationship, sceneContext }
  // LLM generates placement/interaction hints for group scenes.
  router.post('/api/storybook/cast-relationship', async (req, res) => {
    const { castA, castB, relationship = 'friends', sceneContext = '' } = req.body || {};
    if (!castA || !castB) return res.status(400).json({ error: 'castA and castB required' });
    const prompt = `Two characters appear together in a children's picture book scene.\nCharacter A: ${castA.name} (${castA.look_description || ''})\nCharacter B: ${castB.name} (${castB.look_description || ''})\nRelationship: ${relationship}\nScene: ${sceneContext}\n\nProvide brief image composition hints for this group scene. Return JSON: {"compositionHint":"<how to place them>","interactionHint":"<what they are doing together>","outfitHint":"<any outfit changes relevant to this scene>"}`;
    try {
      const { content } = await chat([{ role: 'user', content: prompt }], { stage: 'CastRelationship', temperature: 0.4 });
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, ...JSON.parse(clean) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S40 — Custom photo backgrounds ───────────────────────────────────────────
  // POST /api/storybook/background { photo_b64, artStyle, sceneDescription }
  // Stylises a real photo into a storybook background.
  router.post('/api/storybook/background', async (req, res) => {
    const { photo_b64, artStyle, sceneDescription = 'a cosy room' } = req.body || {};
    if (!photo_b64) return res.status(400).json({ error: 'photo_b64 required' });
    try {
      const { engine, url: engineUrl, options: engineOpts } = resolveImageConfig();
      if (!engineUrl) return res.status(503).json({ error: 'Image engine not configured' });
      const baseStyle = artStyle || (await import('../services/prompt-templates.js').then((m) => m.DEFAULT_SCENE_STYLE));
      const prompt = `${sceneDescription}, ${baseStyle}, background illustration, no characters, wide establishing shot`;
      const body = {
        prompt,
        reference_image: photo_b64,
        aspect_ratio: engineOpts.aspect_ratio || '1:1',
        return_base64: true,
        image_strength: 0.6,
      };
      const r = await fetch(`${engineUrl.replace(/\/+$/, '')}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Engine error: ${r.status}` });
      const data = await r.json();
      res.json({ ok: true, image_b64: data.image_b64 || data.image, engine });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S42 — Comic / Graphic-novel mode ─────────────────────────────────────────
  // POST /api/storybook/comic { story, preset:'manga'|'western'|'strip', panels:2|3|4 }
  // Generates a comic-panel layout spec for the story scenes.
  router.post('/api/storybook/comic', async (req, res) => {
    const { story, preset = 'western', panels = 3 } = req.body || {};
    if (!story) return res.status(400).json({ error: 'story required' });
    const prompt = `You are a comic book artist. Convert this children's story into a comic panel layout.\nPreset: ${preset} (manga=right-to-left, western=left-to-right, strip=horizontal strip)\nPanels per page: ${panels}\n\nFor each scene, provide a panel layout spec.\nReturn ONLY valid JSON:\n{"pages":[{"sceneIndex":0,"panels":[{"type":"full"|"half"|"third","content":"<what to draw>","bubble":{"type":"speech"|"thought"|"caption","text":"..."}|null}]}]}`;
    try {
      const { content } = await chat(
        [{ role: 'user', content: `${prompt}\n\nStory:\n${JSON.stringify(story, null, 2)}` }],
        { stage: 'ComicLayout', temperature: 0.5 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, layout: JSON.parse(clean), preset });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S50 — Adaptive ambient soundscape ────────────────────────────────────────
  // POST /api/storybook/soundscape { scenes[], sleepyMode? }
  // Returns per-scene music + SFX prompts based on scene content.
  router.post('/api/storybook/soundscape', async (req, res) => {
    const { scenes = [], sleepyMode = false } = req.body || {};
    const prompt = `You are a children's media sound designer.\nAnalyse these story scenes and create a soundscape spec.\n${sleepyMode ? 'This is a SLEEPY MODE story — music should get progressively calmer and quieter, ending with silence.\n' : ''}For each scene suggest: musicMood, sfxCues[], and tempo ('normal','slow','very-slow').\nReturn ONLY valid JSON:\n{"scenes":[{"sceneIndex":0,"musicMood":"calm|playful|adventurous|dreamy|whimsical","sfxCues":["wind","birds"],"tempo":"normal"}]}`;
    try {
      const { content } = await chat(
        [{ role: 'user', content: `${prompt}\n\nScenes:\n${JSON.stringify(scenes.map((s, i) => ({ i, text: s.text?.slice(0, 100) })))}}` }],
        { stage: 'Soundscape', temperature: 0.3 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      res.json({ ok: true, soundscape: JSON.parse(clean).scenes, sleepyMode });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S53 — Custom LoRA style training ────────────────────────────────────────
  // POST /api/storybook/train-style { label, images_b64[], triggerWord?, steps? }
  // Sends training samples to the image engine's /train endpoint.
  router.post('/api/storybook/train-style', async (req, res) => {
    const { label, images_b64 = [], triggerWord = 'mystyle', steps = 100 } = req.body || {};
    if (!label || images_b64.length < 3) return res.status(400).json({ error: 'label + at least 3 images required' });
    try {
      const { url: engineUrl } = resolveImageConfig();
      if (!engineUrl) return res.status(503).json({ error: 'Image engine not configured' });
      const r = await fetch(`${engineUrl.replace(/\/+$/, '')}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, images: images_b64, trigger_word: triggerWord, steps }),
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Training error: ${r.status}` });
      const data = await r.json();
      res.json({ ok: true, jobId: data.job_id || data.id, label, triggerWord, note: 'Use the triggerWord in your scene style prompt once training completes.' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/storybook/train-style/:jobId — check training status
  router.get('/api/storybook/train-style/:jobId', async (req, res) => {
    try {
      const { url: engineUrl } = resolveImageConfig();
      if (!engineUrl) return res.status(503).json({ error: 'Image engine not configured' });
      const r = await fetch(`${engineUrl.replace(/\/+$/, '')}/train/${req.params.jobId}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return res.status(r.status).json({ error: `Status error: ${r.status}` });
      res.json(await r.json());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S41 — EPUB export ─────────────────────────────────────────────────────────
  router.get('/api/stories/:id/epub', async (req, res) => {
    try {
      const { buildEpub } = await import('../services/epub.js');
      const rec = getStory(req.params.id);
      if (!rec) return res.status(404).json({ error: 'story not found' });
      const layout = req.query.layout || 'reflowable';
      const storyDir = storyFile(req.params.id, '.');
      const epubBuf = await buildEpub(
        { ...rec, ...rec.story, id: rec.id, title: rec.title, scenes: rec.story?.scenes || [] },
        { storyDir: storyDir ? path.dirname(storyDir + '/x') : undefined, layout },
      );
      const name = `${(rec.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.epub`;
      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send(epubBuf);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S44 — Magic Editor: inpaint a region ──────────────────────────────────────
  // POST /api/storybook/inpaint { storyId, pageIdx, maskB64, instruction, baseImageB64? }
  router.post('/api/storybook/inpaint', async (req, res) => {
    const { storyId, pageIdx, maskB64, instruction, baseImageB64 } = req.body || {};
    if (!maskB64 || !instruction) return res.status(400).json({ error: 'maskB64 + instruction required' });
    try {
      const { engine, url: engineUrl, options: engineOpts } = resolveImageConfig();
      if (!engineUrl) return res.status(503).json({ error: 'Image engine not configured' });
      const prompt = `${instruction}. ${engineOpts.aspect_ratio || '1:1'} illustration.`;
      const body = {
        prompt,
        mask_b64: maskB64,
        ...(baseImageB64 ? { reference_image: baseImageB64 } : {}),
        aspect_ratio: engineOpts.aspect_ratio || '1:1',
        return_base64: true,
      };
      const r = await fetch(`${engineUrl.replace(/\/+$/, '')}/inpaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Engine inpaint error: ${r.status}` });
      const data = await r.json();
      res.json({ ok: true, image_b64: data.image_b64 || data.image, engine });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S45 — Content moderation ──────────────────────────────────────────────────
  // POST /api/storybook/moderate { text?, imageB64?, mode:'text'|'image'|'both' }
  router.post('/api/storybook/moderate', async (req, res) => {
    const { text, imageB64, mode = 'text' } = req.body || {};
    const moderationUrl = process.env.MODERATION_URL || '';
    if (!moderationUrl) {
      // No moderation engine configured → pass-through (log only)
      return res.json({ ok: true, safe: true, flags: [], note: 'Moderation engine not configured — pass-through' });
    }
    try {
      const results = [];
      if ((mode === 'text' || mode === 'both') && text) {
        const r = await fetch(`${moderationUrl.replace(/\/+$/, '')}/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) results.push({ type: 'text', ...(await r.json()) });
      }
      if ((mode === 'image' || mode === 'both') && imageB64) {
        const r = await fetch(`${moderationUrl.replace(/\/+$/, '')}/scan-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_b64: imageB64 }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) results.push({ type: 'image', ...(await r.json()) });
      }
      const safe = results.every((r) => r.safe !== false);
      const flags = results.flatMap((r) => r.flags || []);
      res.json({ ok: true, safe, flags, results });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S45 — COPPA/kids mode gate ────────────────────────────────────────────────
  // POST /api/storybook/kids-mode { enabled, parentPin? }
  const kidsState = { enabled: false, parentPin: '' };
  router.get('/api/kids-mode', (_req, res) => res.json({ enabled: kidsState.enabled }));
  router.post('/api/kids-mode', (req, res) => {
    const { enabled, parentPin } = req.body || {};
    if (enabled && parentPin) kidsState.parentPin = parentPin;
    if (!enabled && req.body.pin !== kidsState.parentPin && kidsState.parentPin) {
      return res.status(403).json({ error: 'Wrong parent PIN' });
    }
    kidsState.enabled = !!enabled;
    res.json({ ok: true, enabled: kidsState.enabled });
  });

  // ── S47 — Real-time streaming illustration preview (SSE) ─────────────────────
  // GET /api/storybook/stream-preview?storyId=<id>&sceneIdx=<n>
  // Emits 'progress' events as the image engine generates (polls engine /status).
  router.get('/api/storybook/stream-preview', async (req, res) => {
    const { prompt, engine: engineOverride } = req.query;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const emit = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      emit({ type: 'start', message: 'Starting image generation…' });
      const { engine, url: engineUrl, options: engineOpts } = resolveImageConfig({ engine: engineOverride });
      if (!engineUrl) { emit({ type: 'error', message: 'Image engine not configured' }); return res.end(); }

      // Start generation
      const genBody = getEngine(engine).buildBody({ prompt, aspect_ratio: engineOpts.aspect_ratio || '1:1', magic: true, return_base64: true });
      const genRes = await fetch(`${engineUrl.replace(/\/+$/, '')}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(genBody),
      });
      if (!genRes.ok) { emit({ type: 'error', message: `Engine error: ${genRes.status}` }); return res.end(); }
      const genData = await genRes.json();
      const jobId = genData.job_id || genData.id;

      if (genData.image_b64 || genData.image) {
        emit({ type: 'done', image_b64: genData.image_b64 || genData.image, engine });
        return res.end();
      }

      // Poll for result
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 120) { clearInterval(poll); emit({ type: 'error', message: 'Timeout' }); res.end(); return; }
        try {
          const statusRes = await fetch(`${engineUrl.replace(/\/+$/, '')}/status/${jobId}`);
          if (!statusRes.ok) return;
          const s = await statusRes.json();
          emit({ type: 'progress', pct: s.pct || s.progress || (attempts / 120 * 100), status: s.status });
          if (s.image_b64 || s.image || s.status === 'done') {
            clearInterval(poll);
            emit({ type: 'done', image_b64: s.image_b64 || s.image, engine });
            res.end();
          }
        } catch { /* retry */ }
      }, 1000);

      req.on('close', () => clearInterval(poll));
    } catch (err) {
      emit({ type: 'error', message: err.message });
      res.end();
    }
  });

  // ── S51 — Infinite Story (nightly adaptive bedtime) ──────────────────────────
  // POST /api/storybook/infinite { childProfile, mood, previousEpisodeIds[] }
  router.post('/api/storybook/infinite', async (req, res) => {
    const { childProfile = {}, mood = 'calm', previousEpisodeIds = [], worldId } = req.body || {};
    const ov = getPromptOverrides();
    const name = childProfile.name || 'the little hero';
    const interests = (childProfile.interests || []).join(', ') || 'adventures, animals, magic';
    const systemPrompt = `You are a bedtime storytelling AI. Generate a short 4-scene children's story (JSON format) for ${name} with these interests: ${interests}. Tonight's mood: ${mood}. ${previousEpisodeIds.length ? `This is episode ${previousEpisodeIds.length + 1} of an ongoing series — make it feel like a continuation.` : 'This is the first episode.'} End with a calming, sleep-encouraging conclusion. Return ONLY valid JSON: {"title":"...", "scenes":[{"text":"...", "says":"...optional", "thinks":"...optional"}]}`;

    try {
      const { content } = await chat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Create tonight's bedtime story.` }],
        { stage: 'Infinite Story', temperature: 0.8 },
      );
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const story = JSON.parse(clean);
      story.mood = mood;
      story.episode = previousEpisodeIds.length + 1;
      story.type = 'infinite';
      if (worldId) story.worldId = worldId;
      res.json({ ok: true, story });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S54 — Speech-to-story (STT → story creation) ─────────────────────────────
  // POST /api/storybook/speech-to-story { audio_b64, language?, duration? }
  router.post('/api/storybook/speech-to-story', async (req, res) => {
    const { audio_b64, language = 'en' } = req.body || {};
    if (!audio_b64) return res.status(400).json({ error: 'audio_b64 required' });

    const sttUrl = process.env.STT_URL || '';
    if (!sttUrl) return res.status(503).json({ error: 'STT engine not configured. Set STT_URL in .env.' });

    try {
      // 1. Transcribe audio
      const sttRes = await fetch(`${sttUrl.replace(/\/+$/, '')}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_b64, language, model: process.env.STT_MODEL || 'base' }),
        signal: AbortSignal.timeout(30000),
      });
      if (!sttRes.ok) return res.status(sttRes.status).json({ error: `STT error: ${sttRes.status}` });
      const { text: transcript } = await sttRes.json();

      // 2. Turn transcript into a story prompt
      const { content } = await chat(
        [
          { role: 'system', content: "You are a children's storybook writer. The user has spoken a story idea. Turn it into a 4-scene children's picture book. Return ONLY valid JSON: {\"title\":\"...\", \"scenes\":[{\"text\":\"...\", \"says\":\"...\"}]}" },
          { role: 'user', content: transcript },
        ],
        { stage: 'Speech-to-Story', temperature: 0.7 },
      );

      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const story = JSON.parse(clean);
      res.json({ ok: true, transcript, story });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S-D9.04 — AI Text→Image (Designer palette) ─────────────────────────────
  router.post('/api/storybook/text-to-image', async (req, res) => {
    try {
      const { prompt, override } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'prompt required' });
      const { engine, url, options } = resolveImageConfig(override);
      const img = await engineGenerate(engine, url, prompt.trim(), {
        aspect_ratio: options.aspect_ratio || '1:1',
        magic: options.magic, preset: options.preset,
        steps: options.steps, negativePrompt: options.negativePrompt,
        model: options.model || '',
      });
      res.json({ ok: true, image_b64: img.image_b64, seed: img.seed, engine });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── S-D9.05 — AI Magic Write (Designer Inspector) ──────────────────────────
  router.post('/api/storybook/magic-write', async (req, res) => {
    try {
      const { text = '', instruction = '', tone = 'fun' } = req.body || {};
      if (!isLlmConfigured()) return res.json({ ok: true, text, stub: true });
      const sys = `You are a creative children's storybook writer. Given the original text and an instruction, rewrite it to be more ${tone}. Return ONLY the rewritten text — no quotes, no explanation, no formatting.`;
      const user = instruction
        ? `Original text: "${text}"\nInstruction: ${instruction}`
        : `Improve this text for a children's storybook (tone: ${tone}): "${text}"`;
      const { content } = await chat(
        [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { stage: 'Magic Write', temperature: 0.8 },
      );
      res.json({ ok: true, text: (content || '').trim() || text });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // S-D9.01 — AI Background Remover (gpt-image-2 background:transparent)
  router.post('/api/storybook/remove-background', async (req, res) => {
    try {
      const { image_b64, model = 'gpt-image-2' } = req.body || {};
      if (!image_b64) return res.status(400).json({ error: 'image_b64 required' });
      const { getOpenAiImageKey } = await import('../config.js');
      const apiKey = await getOpenAiImageKey();
      if (!apiKey) return res.json({ ok: true, image_b64, stub: true, note: 'No OpenAI API key configured' });

      const { GPT_IMAGE_EDIT_MODELS } = await import('../services/edit-engines/index.js');
      const safeModel = GPT_IMAGE_EDIT_MODELS.includes(model) ? model : 'gpt-image-2';
      const imgB64 = image_b64.replace(/^data:image\/[^;]+;base64,/, '');
      const imageBytes = Buffer.from(imgB64, 'base64');

      const form = new FormData();
      form.append('model',       safeModel);
      form.append('prompt',      'Remove the background completely. Make the background fully transparent. Keep the main subject completely unchanged.');
      form.append('background',  'transparent');
      form.append('quality',     'medium');
      form.append('n',           '1');
      form.append('image', new Blob([imageBytes], { type: 'image/png' }), 'image.png');

      const r = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!r.ok) {
        const txt = await r.text();
        let detail = txt;
        try { detail = JSON.parse(txt)?.error?.message || txt; } catch { /**/ }
        return res.status(r.status).json({ error: detail });
      }
      const data = await r.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) return res.status(500).json({ error: 'OpenAI returned no image data' });
      res.json({ ok: true, image_b64: b64 });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // S-D9.02/03 — Designer retouch: brush mask + prompt → inpaint via configured edit engine
  router.post('/api/storybook/designer-retouch', async (req, res) => {
    try {
      const { image_b64, mask_b64, prompt = 'Remove this area and fill with background', model } = req.body || {};
      if (!image_b64) return res.status(400).json({ error: 'image_b64 required' });

      const { engine, url, options } = resolveEditConfig();
      const effectiveModel = model || options.model || '';

      const cleanB64 = (s) => (s ? s.replace(/^data:image\/[^;]+;base64,/, '') : null);

      if (isDirectEngine(engine)) {
        if (engine === 'openrouter-edit') {
          const img = await editGenerate(engine, url, {
            image_b64: cleanB64(image_b64), mask_b64: cleanB64(mask_b64), prompt, model: effectiveModel,
          });
          return res.json({ ok: true, image_b64: img.image_b64 });
        }
        // gpt-image-1 (OpenAI)
        const { getOpenAiImageKey } = await import('../config.js');
        const apiKey = await getOpenAiImageKey(url);
        if (!apiKey) return res.json({ ok: true, image_b64, stub: true, note: 'No OpenAI API key configured' });
        const img = await editGenerateGptImage({
          image_b64: cleanB64(image_b64), mask_b64: cleanB64(mask_b64), prompt, model: effectiveModel, quality: 'medium',
        }, apiKey);
        return res.json({ ok: true, image_b64: img.image_b64 });
      }

      // Local GPU engine (FLUX.1-Fill, FLUX.2-klein, etc.)
      if (!url) return res.json({ ok: true, image_b64, stub: true, note: 'No Edit Engine URL configured' });
      const img = await editGenerate(engine, url, {
        image_b64: cleanB64(image_b64), mask_b64: cleanB64(mask_b64), prompt,
        steps: options.steps, guidance: options.guidance, seed: options.seed,
      });
      res.json({ ok: true, image_b64: img.image_b64 });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // S-D9.16 — AI Design Assistant: NL command → canvas operations
  router.post('/api/storybook/design-assist', async (req, res) => {
    try {
      const { command = '', elements = [], stageW = 700, stageH = 700 } = req.body || {};
      if (!command.trim()) return res.status(400).json({ error: 'command required' });
      if (!isLlmConfigured()) return res.json({ ok: true, ops: [], stub: true });

      const sys = `You are an AI design assistant for a children's storybook canvas editor. The canvas is ${stageW}×${stageH}px.
Given the user's natural-language design command and current canvas elements JSON, return ONLY a JSON object with an "ops" array.

Element types: text, shape.rect, shape.ellipse, sticker.
Text props: text (string), fontSize (8–120), fill (hex), fontFamily ("Baloo 2, system-ui"), bold (bool), italic (bool), align ("left"|"center"|"right"), stroke ("#000000"), strokeWidth (0), shadowBlur (0).
shape.rect props: fill (hex), cornerRadius (0–200), strokeWidth (0), opacity (1), shadowBlur (0).
shape.ellipse props: fill (hex), strokeWidth (0), opacity (1), shadowBlur (0).
sticker props: emoji (single emoji string), fontSize (24–200), opacity (1).

Operations:
{ "op": "add", "type": "text"|"shape.rect"|"shape.ellipse"|"sticker", "x": N, "y": N, "w": N, "h": N, "props": {...} }
{ "op": "patch", "id": "<id>", "patch": { "x":N, "y":N, "w":N, "h":N, "rotation":N, "opacity":N, "blendMode":"..." } }
{ "op": "patchProps", "id": "<id>", "props": { "fill":"#hex", "fontSize":N, "text":"...", "bold":true, ... } }
{ "op": "delete", "id": "<id>" }
{ "op": "clearAll" }
{ "op": "duplicate", "id": "<id>" }
{ "op": "alignH", "id": "<id>", "align": "left"|"center"|"right" }
{ "op": "alignV", "id": "<id>", "align": "top"|"middle"|"bottom" }

Rules:
- Refer to elements by their id from the provided JSON.
- When user says "the title" or "the text" pick the most relevant text element by content.
- When user says "background" pick the bottommost shape.rect or add one if none exists.
- When user says "all text" apply ops to every element with type "text".
- Reasonable defaults: text w=500 h=80, shape.rect w=200 h=200, sticker w=100 h=100.
- Return ONLY valid JSON: { "ops": [...] }. No markdown fences, no explanation, no comments.`;

      const userMsg = `Command: "${command.trim()}"\n\nCanvas elements:\n${JSON.stringify(elements, null, 2)}`;
      const { content } = await chat(
        [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
        { stage: 'Design Assist', temperature: 0.3 },
      );

      const raw = (content || '').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      let ops = [];
      try {
        const parsed = JSON.parse(raw);
        ops = Array.isArray(parsed.ops) ? parsed.ops : (Array.isArray(parsed) ? parsed : []);
      } catch { /* LLM returned bad JSON — return empty ops, don't crash */ }
      res.json({ ok: true, ops });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

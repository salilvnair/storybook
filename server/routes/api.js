/**
 * Public REST API — S31.
 *
 * API-key authenticated endpoints for headless book generation:
 *
 * POST /api/v1/story/create       — create + generate a story (non-streaming)
 * GET  /api/v1/story/:id          — get story metadata + status
 * GET  /api/v1/story/:id/pdf      — download the rendered PDF
 * POST /api/v1/story/:id/narrate  — narrate the story (TTS)
 * GET  /api/v1/story/:id/status   — generation status (polling)
 * GET  /api/v1/stories            — list all stories
 * POST /api/v1/webhooks           — register a webhook endpoint
 * DELETE /api/v1/webhooks/:id     — remove a webhook
 * GET  /api/openapi.json          — OpenAPI 3.1 spec
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { listStories, getStory, storyFile } from '../store/story-library.js';
import { chat } from '../services/llm.js';
import { buildSystemPrompt as buildStorySystemPrompt } from '../services/storyAgent.js';

// ── API key store (in-memory; reload from env) ───────────────────────────────
const VALID_KEYS = new Set((process.env.API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean));

// ── Webhook registry ─────────────────────────────────────────────────────────
/** @type {Map<string, {id:string, url:string, events:string[], secret?:string}>} */
const WEBHOOKS = new Map();

async function fireWebhook(event, payload) {
  for (const [, wh] of WEBHOOKS) {
    if (!wh.events.includes('*') && !wh.events.includes(event)) continue;
    const body = JSON.stringify({ event, payload, ts: new Date().toISOString() });
    const sig = wh.secret
      ? crypto.createHmac('sha256', wh.secret).update(body).digest('hex')
      : undefined;
    fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sig ? { 'X-IStorybook-Signature': sig } : {}),
      },
      body,
    }).catch(() => {});
  }
}

// ── Middleware: API key auth ──────────────────────────────────────────────────
function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (VALID_KEYS.size === 0) {
    // No keys configured → restrict to localhost only
    const ip = req.ip || req.connection.remoteAddress || '';
    if (ip !== '::1' && ip !== '127.0.0.1' && ip !== '::ffff:127.0.0.1') {
      return res.status(401).json({ error: 'API key required. Set API_KEYS in .env or access from localhost.' });
    }
    return next();
  }
  if (!key || !VALID_KEYS.has(key)) {
    return res.status(401).json({ error: 'Invalid or missing API key (x-api-key header).' });
  }
  next();
}

// ── In-progress job tracker ───────────────────────────────────────────────────
/** @type {Map<string, {storyId?:string, status:'pending'|'generating'|'done'|'error', progress:number, error?:string, startedAt:string}>} */
const JOBS = new Map();

export function apiRouter() {
  const router = Router();

  // All /api/v1 routes require API key auth
  router.use('/api/v1', apiKeyAuth);

  // ── List stories ────────────────────────────────────────────────────────────
  router.get('/api/v1/stories', (_req, res) => {
    res.json({ stories: listStories() });
  });

  // ── Get story ───────────────────────────────────────────────────────────────
  router.get('/api/v1/story/:id', (req, res) => {
    const rec = getStory(req.params.id);
    if (!rec) return res.status(404).json({ error: 'not found' });
    res.json(rec);
  });

  // ── Download PDF ─────────────────────────────────────────────────────────────
  router.get('/api/v1/story/:id/pdf', (req, res) => {
    const f = storyFile(req.params.id, 'book.pdf');
    if (!f || !fs.existsSync(f)) return res.status(404).json({ error: 'PDF not found' });
    const rec = getStory(req.params.id);
    const name = `${(rec?.title || 'storybook').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    fs.createReadStream(f).pipe(res);
  });

  // ── Job status ───────────────────────────────────────────────────────────────
  router.get('/api/v1/story/:id/status', (req, res) => {
    const job = JOBS.get(req.params.id);
    if (!job) {
      // Check if a story with this ID exists in the library
      const rec = getStory(req.params.id);
      if (rec) return res.json({ status: 'done', storyId: rec.id, story: rec });
      return res.status(404).json({ error: 'job not found' });
    }
    res.json(job);
  });

  // ── Create + generate story (async) ─────────────────────────────────────────
  router.post('/api/v1/story/create', async (req, res) => {
    const { prompt, pageCount = 5, artStyle, characterIds = [], worldId, templateId } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const job = { status: 'pending', progress: 0, startedAt: new Date().toISOString() };
    JOBS.set(jobId, job);

    // Return immediately with the job ID
    res.status(202).json({ jobId, status: 'pending', pollUrl: `/api/v1/story/${jobId}/status` });

    // Kick off async generation by calling the existing /api/storybook/generate flow
    setImmediate(async () => {
      try {
        job.status = 'generating';
        job.progress = 5;

        // Build story via LLM
        const systemPrompt = buildStorySystemPrompt({ pageCount, artStyle });
        const messages = [{ role: 'user', content: prompt }];
        const storyJson = await chat(systemPrompt, messages);

        let story;
        try {
          const match = storyJson.match(/\{[\s\S]+\}/);
          story = JSON.parse(match ? match[0] : storyJson);
        } catch {
          throw new Error('LLM did not return valid JSON story');
        }

        job.progress = 30;

        // POST to our own generation endpoint
        const port = process.env.PORT || 3001;
        const genRes = await fetch(`http://localhost:${port}/api/storybook/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            story,
            artStyle,
            cast: characterIds,
            worldId,
            templateId,
          }),
        });

        if (!genRes.ok) throw new Error(`Generation failed: ${genRes.status}`);
        if (!genRes.body) throw new Error('No response body from generate');

        const reader = genRes.body.getReader();
        const decoder = new TextDecoder();
        let storyId = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === 'progress') job.progress = Math.min(95, msg.pct || job.progress);
              if (msg.type === 'done' && msg.storyId) storyId = msg.storyId;
            } catch { /* partial line */ }
          }
        }

        if (storyId) {
          job.status = 'done';
          job.progress = 100;
          job.storyId = storyId;
          fireWebhook('story.done', { jobId, storyId, title: story.title });
        } else {
          throw new Error('Generation completed but no storyId returned');
        }
      } catch (err) {
        job.status = 'error';
        job.error = err.message;
        fireWebhook('story.error', { jobId, error: err.message });
      }
    });
  });

  // ── Narrate a story ──────────────────────────────────────────────────────────
  router.post('/api/v1/story/:id/narrate', async (req, res) => {
    const rec = getStory(req.params.id);
    if (!rec) return res.status(404).json({ error: 'story not found' });
    const port = process.env.PORT || 3001;
    // Proxy to internal narrate endpoint
    const text = rec.scenes?.map((s) => s.text).join('\n\n') || '';
    const r = await fetch(`http://localhost:${port}/api/storybook/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId: req.body?.voiceId }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  });

  // ── Webhook management ───────────────────────────────────────────────────────
  router.post('/api/v1/webhooks', (req, res) => {
    const { url, events = ['*'], secret } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    WEBHOOKS.set(id, { id, url, events, secret });
    res.json({ id, url, events });
  });

  router.get('/api/v1/webhooks', (_req, res) => {
    res.json({ webhooks: [...WEBHOOKS.values()].map(({ id, url, events }) => ({ id, url, events })) });
  });

  router.delete('/api/v1/webhooks/:id', (req, res) => {
    const existed = WEBHOOKS.has(req.params.id);
    WEBHOOKS.delete(req.params.id);
    res.json({ ok: existed });
  });

  // ── Generate API key ─────────────────────────────────────────────────────────
  router.post('/api/v1/keys/generate', (_req, res) => {
    const key = `isbk-${crypto.randomBytes(16).toString('hex')}`;
    VALID_KEYS.add(key);
    res.json({ key, note: 'Add to API_KEYS in .env to persist across restarts' });
  });

  // ── OpenAPI spec ─────────────────────────────────────────────────────────────
  router.get('/api/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'iStorybook API',
        version: '1.0.0',
        description: 'Headless AI-powered children\'s storybook generation API.',
        license: { name: 'MIT' },
      },
      servers: [{ url: `http://localhost:${process.env.PORT || 3001}`, description: 'Local server' }],
      security: [{ apiKey: [] }],
      components: {
        securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
      },
      paths: {
        '/api/v1/stories': { get: { summary: 'List all stories', tags: ['Stories'], responses: { 200: { description: 'List of stories' } } } },
        '/api/v1/story/create': { post: { summary: 'Create and generate a story', tags: ['Stories'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' }, pageCount: { type: 'integer', default: 5 }, artStyle: { type: 'string' } }, required: ['prompt'] } } } }, responses: { 202: { description: 'Job started' } } } },
        '/api/v1/story/{id}': { get: { summary: 'Get story by ID', tags: ['Stories'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Story record' }, 404: { description: 'Not found' } } } },
        '/api/v1/story/{id}/status': { get: { summary: 'Poll generation status', tags: ['Stories'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Job status' } } } },
        '/api/v1/story/{id}/pdf': { get: { summary: 'Download story PDF', tags: ['Stories'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'PDF file' } } } },
        '/api/v1/story/{id}/narrate': { post: { summary: 'Narrate story via TTS', tags: ['Stories', 'Audio'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Audio data' } } } },
        '/api/v1/webhooks': { post: { summary: 'Register a webhook', tags: ['Webhooks'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' }, events: { type: 'array', items: { type: 'string' } }, secret: { type: 'string' } }, required: ['url'] } } } }, responses: { 200: { description: 'Webhook registered' } } } },
      },
    });
  });

  // ── Interactive API docs (Swagger UI CDN) ────────────────────────────────────
  router.get('/api/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head><title>iStorybook API Docs</title>
<meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset], layout: 'StandaloneLayout' });
</script>
</body>
</html>`);
  });

  return router;
}

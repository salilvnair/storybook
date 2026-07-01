/**
 * Storybook server — Express.
 *
 * Serves the ConvEngine chat backend, the RunPod image proxy, the storybook
 * generation pipeline, and (in production) the built client.
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, isLlmConfigured, isRunpodConfigured } from './config.js';
import { conversationRouter } from './routes/conversation.js';
import { runpodRouter } from './routes/runpod.js';
import { storybookRouter } from './routes/storybook.js';
import { templateRouter } from './routes/template.js';
import { characterRouter } from './routes/character.js';
import { devtoolsRouter } from './routes/devtools.js';
import { providersSDKRouter } from './routes/providers.js';
import { apiRouter } from './routes/api.js';
import { pluginsRouter } from './routes/plugins.js';
import { configExportRouter } from './routes/config-export.js';
import { observabilityRouter } from './routes/observability.js';
import { designerBlocksRouter } from './routes/designer-blocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep the server alive if a single request handler throws/rejects unexpectedly —
// one buggy route should degrade to a 500, not take down the whole backend.
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ── Health + config (frontend reads this to know what's set up) ──────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => {
  res.json({
    llmConfigured: isLlmConfigured(),
    runpodConfigured: isRunpodConfigured(),
    llmModel: config.llm.model,
  });
});

// ── Feature routes ───────────────────────────────────────────────────────────
app.use(conversationRouter());
app.use(runpodRouter());
app.use(storybookRouter());
app.use(templateRouter());
app.use(characterRouter());
app.use(devtoolsRouter());
app.use(providersSDKRouter());
app.use(apiRouter());
app.use(pluginsRouter());
app.use(configExportRouter());
app.use(observabilityRouter());
app.use(designerBlocksRouter());

// ── API error safety net — a bug in ONE route must never 500-crash the whole
//    server (e.g. a sync throw in an async handler). Returns JSON instead. ──
app.use('/api', (err, _req, res, _next) => {
  console.error('[api error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

// ── Serve built client in production ─────────────────────────────────────────
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`\n  📖 iStorybook server  →  http://localhost:${config.port}`);
  console.log(`     LLM    : ${isLlmConfigured() ? `✓ ${config.llm.model}` : '✗ not configured (set LLM_API_KEY in .env)'}`);
  console.log(`     RunPod : ${isRunpodConfigured() ? `✓ ${config.runpod.url}` : '✗ not configured (set RUNPOD_URL in .env)'}\n`);
});

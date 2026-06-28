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
import { devtoolsRouter } from './routes/devtools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
app.use(devtoolsRouter());

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

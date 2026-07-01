#!/usr/bin/env node
/**
 * iStorybook CLI — S38.
 *
 * Usage:
 *   istorybook generate "A brave rabbit saves the forest" [--pages 5] [--style watercolour]
 *   istorybook list
 *   istorybook render <story-id> [--format epub|pdf] [--layout fixed|reflowable]
 *   istorybook narrate <story-id> [--voice Chelsie]
 *   istorybook status <job-id-or-story-id>
 *   istorybook batch <prompts.txt> [--out ./output]
 *   istorybook scaffold [--name my-story-plugin]
 *   istorybook config export [--out ./my-config.storybuddy]
 *   istorybook config import <path.storybuddy>
 *
 * Config:
 *   Set ISTORYBOOK_URL (default: http://localhost:8787)
 *   Set ISTORYBOOK_API_KEY if API keys are configured
 */
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';

const BASE_URL = process.env.ISTORYBOOK_URL || 'http://localhost:8787';
const API_KEY = process.env.ISTORYBOOK_API_KEY || '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) h['x-api-key'] = API_KEY;
  return h;
}

async function api(method, path_, body) {
  const res = await fetch(`${BASE_URL}${path_}`, {
    method,
    headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`API error ${res.status}: ${err.error || res.statusText}`);
  }
  return res.json();
}

async function pollUntilDone(jobId, interval = 3000) {
  process.stdout.write(`Polling job ${jobId}`);
  while (true) {
    await new Promise((r) => setTimeout(r, interval));
    const status = await api('GET', `/api/v1/story/${jobId}/status`);
    process.stdout.write('.');
    if (status.status === 'done') { process.stdout.write('\n'); return status; }
    if (status.status === 'error') { process.stdout.write('\n'); throw new Error(`Job failed: ${status.error}`); }
  }
}

const [,, cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case 'generate': {
      const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        pages: { type: 'string', short: 'p', default: '5' },
        style: { type: 'string', short: 's', default: '' },
        wait: { type: 'boolean', short: 'w', default: false },
      }});
      const prompt = positionals[0];
      if (!prompt) { console.error('Usage: istorybook generate "<prompt>"'); process.exit(1); }
      console.log(`Creating story: "${prompt}"…`);
      const job = await api('POST', '/api/v1/story/create', {
        prompt, pageCount: parseInt(values.pages), artStyle: values.style,
      });
      console.log(`Job started: ${job.jobId}`);
      console.log(`Poll: istorybook status ${job.jobId}`);
      if (values.wait) {
        const done = await pollUntilDone(job.jobId);
        console.log(`Done! Story ID: ${done.storyId}`);
        console.log(`Download PDF: istorybook render ${done.storyId}`);
      }
      break;
    }

    case 'list': {
      const { stories } = await api('GET', '/api/v1/stories');
      if (!stories.length) { console.log('No stories yet.'); break; }
      console.log(`\n${'ID'.padEnd(36)}  ${'Title'.padEnd(40)}  Pages  Created`);
      console.log('─'.repeat(100));
      for (const s of stories) {
        const date = new Date(s.created_at || s.createdAt || 0).toLocaleDateString();
        console.log(`${s.id.padEnd(36)}  ${(s.title || 'Untitled').padEnd(40)}  ${String(s.page_count || s.pageCount || 0).padEnd(5)}  ${date}`);
      }
      console.log();
      break;
    }

    case 'status': {
      const id = args[0];
      if (!id) { console.error('Usage: istorybook status <job-id>'); process.exit(1); }
      const status = await api('GET', `/api/v1/story/${id}/status`);
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    case 'render': {
      const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        format: { type: 'string', short: 'f', default: 'pdf' },
        layout: { type: 'string', short: 'l', default: 'reflowable' },
        out: { type: 'string', short: 'o', default: '' },
      }});
      const id = positionals[0];
      if (!id) { console.error('Usage: istorybook render <story-id>'); process.exit(1); }
      const fmt = values.format;
      const ext = fmt === 'epub' ? '.epub' : '.pdf';
      const outPath = values.out || `./story-${id.slice(0, 8)}${ext}`;
      const endpoint = fmt === 'epub'
        ? `/api/stories/${id}/epub?layout=${values.layout}`
        : `/api/v1/story/${id}/pdf`;
      console.log(`Downloading ${fmt.toUpperCase()} → ${outPath}…`);
      const res = await fetch(`${BASE_URL}${endpoint}`, { headers: headers() });
      if (!res.ok) { console.error(`Error: ${res.status}`); process.exit(1); }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outPath, buf);
      console.log(`Saved: ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
      break;
    }

    case 'narrate': {
      const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        voice: { type: 'string', short: 'v', default: 'narrator' },
        out: { type: 'string', short: 'o', default: '' },
      }});
      const id = positionals[0];
      if (!id) { console.error('Usage: istorybook narrate <story-id>'); process.exit(1); }
      const data = await api('POST', `/api/v1/story/${id}/narrate`, { voiceId: values.voice });
      if (data.audio_b64) {
        const outPath = values.out || `./narration-${id.slice(0, 8)}.wav`;
        fs.writeFileSync(outPath, Buffer.from(data.audio_b64, 'base64'));
        console.log(`Narration saved: ${outPath}`);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case 'batch': {
      const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        out: { type: 'string', short: 'o', default: './batch-output' },
        pages: { type: 'string', short: 'p', default: '4' },
        wait: { type: 'boolean', short: 'w', default: true },
      }});
      const promptFile = positionals[0];
      if (!promptFile || !fs.existsSync(promptFile)) { console.error('Usage: istorybook batch <prompts.txt>'); process.exit(1); }
      const prompts = fs.readFileSync(promptFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
      fs.mkdirSync(values.out, { recursive: true });
      console.log(`Batch: ${prompts.length} stories → ${values.out}`);
      for (let i = 0; i < prompts.length; i++) {
        console.log(`\n[${i + 1}/${prompts.length}] ${prompts[i]}`);
        try {
          const job = await api('POST', '/api/v1/story/create', { prompt: prompts[i], pageCount: parseInt(values.pages) });
          if (values.wait) {
            const done = await pollUntilDone(job.jobId);
            if (done.storyId) {
              const res = await fetch(`${BASE_URL}/api/v1/story/${done.storyId}/pdf`, { headers: headers() });
              const buf = Buffer.from(await res.arrayBuffer());
              const outPath = path.join(values.out, `story-${i + 1}-${done.storyId.slice(0, 8)}.pdf`);
              fs.writeFileSync(outPath, buf);
              console.log(`  → ${outPath}`);
            }
          } else {
            console.log(`  Job: ${job.jobId}`);
          }
        } catch (e) {
          console.error(`  Error: ${e.message}`);
        }
      }
      break;
    }

    case 'scaffold': {
      const { values } = parseArgs({ args, options: { name: { type: 'string', short: 'n', default: 'my-plugin' } }});
      const dir = `./${values.name}`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify({
        id: values.name,
        name: values.name,
        version: '1.0.0',
        description: 'My iStorybook plugin',
        author: 'you',
        permissions: ['read-stories'],
        exporters: [],
        providers: [],
        hooks: [],
      }, null, 2));
      fs.writeFileSync(`${dir}/README.md`, `# ${values.name}\n\niStorybook plugin. Install with:\n\`\`\`\ncurl -X POST http://localhost:8787/api/plugins/install -d @manifest.json -H 'Content-Type: application/json'\n\`\`\`\n`);
      console.log(`Plugin scaffolded at ${dir}/`);
      break;
    }

    case 'config': {
      const sub = args[0];
      if (sub === 'export') {
        const { values } = parseArgs({ args: args.slice(1), options: { out: { type: 'string', short: 'o', default: './istorybook.storybuddy' } }});
        const res = await fetch(`${BASE_URL}/api/config/export`, { headers: headers() });
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(values.out, buf);
        console.log(`Config exported → ${values.out}`);
      } else if (sub === 'import') {
        const filePath = args[1];
        if (!filePath || !fs.existsSync(filePath)) { console.error('Usage: istorybook config import <path.storybuddy>'); process.exit(1); }
        const bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const result = await api('POST', '/api/config/import', bundle);
        console.log('Config imported:', result);
      } else {
        console.log('Usage: istorybook config export|import');
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
iStorybook CLI — S38

Commands:
  generate "<prompt>"    Create a story (--pages 5, --style watercolour, --wait)
  list                   List all stories
  status <id>            Check job/story status
  render <id>            Download PDF or EPUB (--format pdf|epub, --layout fixed|reflowable)
  narrate <id>           Generate TTS narration (--voice narrator, --out file.wav)
  batch <prompts.txt>    Generate multiple stories from a file (--out ./output, --wait)
  scaffold               Create a plugin scaffold (--name my-plugin)
  config export          Export all config as .storybuddy (--out file.storybuddy)
  config import <file>   Import config from .storybuddy file

Env:
  ISTORYBOOK_URL        Server URL (default: http://localhost:8787)
  ISTORYBOOK_API_KEY    API key (if configured)
      `);
    }
  }
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });

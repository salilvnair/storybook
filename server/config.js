/**
 * Server config — reads from process.env with sensible defaults.
 * Loads a .env file manually (no dotenv dependency) so the app stays lean.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Tiny .env loader (no dependency) ─────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

export const config = {
  port: parseInt(process.env.PORT || '8787', 10),
  root: ROOT,
  outputDir: path.join(process.env.HOME || os.homedir(), '.salilvnair', 'istorybook', 'output'),

  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1/chat/completions',
    model: process.env.LLM_MODEL || 'deepseek-chat',
    apiKey: process.env.LLM_API_KEY || '',
    type: (process.env.LLM_TYPE || 'openai').toLowerCase(),
  },

  runpod: {
    url: (process.env.RUNPOD_URL || '').replace(/\/$/, ''),
    preset: process.env.IMAGE_PRESET || 'DEFAULT',
    // 1:1 — square illustrations fill the right half of each picture-book spread.
    aspectRatio: process.env.IMAGE_ASPECT_RATIO || '1:1',
    magic: (process.env.IMAGE_MAGIC || 'true') !== 'false',
  },
};

// Ensure output dir exists
try { fs.mkdirSync(config.outputDir, { recursive: true }); } catch { /* ignore */ }

export function isLlmConfigured() {
  return Boolean(config.llm.apiKey && config.llm.baseUrl);
}

export function isRunpodConfigured() {
  return Boolean(config.runpod.url && !config.runpod.url.includes('REPLACE'));
}

/** OpenAI API key. Priority: env var → OS keychain → ui fallback. */
export async function getOpenAiImageKey(uiFallback = '') {
  const env = process.env.OPENAI_API_KEY || '';
  if (env) return env;
  if ((process.env.LLM_TYPE || 'openai').toLowerCase() === 'openai') {
    const llm = process.env.LLM_API_KEY || '';
    if (llm) return llm;
  }
  const { getKey } = await import('./services/keychain.js');
  return (await getKey('openai-api-key')) || uiFallback || '';
}

/** OpenRouter API key. Priority: env var → OS keychain → ui fallback. */
export async function getOpenRouterKey(uiFallback = '') {
  const env = process.env.OPENROUTER_API_KEY || '';
  if (env) return env;
  const { getKey } = await import('./services/keychain.js');
  return (await getKey('openrouter-api-key')) || uiFallback || '';
}

/** Store an API key in the OS keychain (called from settings save endpoint). */
export async function saveApiKey(account, secret) {
  const { setKey, deleteKey } = await import('./services/keychain.js');
  if (!secret || secret === '••••••••') return;
  if (secret === '') { await deleteKey(account); return; }
  await setKey(account, secret);
}

/** Returns true if a key is available (env var or keychain). Never returns the key itself. */
export async function hasApiKey(account, envVar) {
  if (envVar && process.env[envVar]) return true;
  const { hasKey } = await import('./services/keychain.js');
  return hasKey(account);
}

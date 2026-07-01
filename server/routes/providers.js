/**
 * Universal Provider SDK routes — S29.
 *
 * GET  /api/providers/sdk              — list all registered providers (by capability)
 * GET  /api/providers/sdk/health       — health check for all/capability providers
 * GET  /api/providers/sdk/active       — get active provider IDs
 * POST /api/providers/sdk/active       — set active provider for a capability
 * POST /api/providers/sdk/fallback     — set fallback chain for a capability
 * GET  /api/providers/sdk/custom       — list custom providers
 * POST /api/providers/sdk/custom       — register a custom provider from JSON schema
 * DELETE /api/providers/sdk/custom/:id — remove a custom provider
 * POST /api/providers/sdk/detect-local — auto-detect local engines on common ports (S30)
 */
import { Router } from 'express';
import {
  listProviderSummaries,
  healthCheckAll,
  getActiveProviderId,
  setActiveProvider,
  setFallbackChain,
  getFallbackChain,
  listCustomProviders,
  registerCustomProvider,
  removeCustomProvider,
} from '../services/providers/index.js';

// Common ports for local auto-detection (S30)
const LOCAL_PROBES = [
  { port: 7860, capability: 'image', engine: 'flux2', label: 'FLUX.2-klein (port 7860)' },
  { port: 8080, capability: 'image', engine: 'zimg-turbo', label: 'Z-Image Turbo (port 8080)' },
  { port: 7861, capability: 'image', engine: 'ideogram4', label: 'Ideogram 4 (port 7861)' },
  { port: 9000, capability: 'tts', engine: 'qwen3-tts', label: 'Qwen3-TTS (port 9000)' },
  { port: 9001, capability: 'tts', engine: 'fish-speech', label: 'Fish Speech (port 9001)' },
  { port: 9002, capability: 'tts', engine: 'f5-tts', label: 'F5-TTS (port 9002)' },
  { port: 9003, capability: 'tts', engine: 'kokoro', label: 'Kokoro (port 9003)' },
  { port: 8765, capability: 'music', engine: 'musicgen', label: 'MusicGen (port 8765)' },
  { port: 8766, capability: 'music', engine: 'audioldm2', label: 'AudioLDM2 (port 8766)' },
  { port: 5000, capability: 'stt', engine: 'whisper', label: 'Whisper STT (port 5000)' },
  { port: 8200, capability: 'moderation', engine: 'llm-guard', label: 'LLM Guard (port 8200)' },
];

export function providersSDKRouter() {
  const router = Router();

  // List all providers (grouped by capability)
  router.get('/api/providers/sdk', (req, res) => {
    const cap = req.query.capability;
    const providers = listProviderSummaries(cap || undefined);
    const grouped = {};
    for (const p of providers) {
      if (!grouped[p.capability]) grouped[p.capability] = [];
      grouped[p.capability].push(p);
    }
    res.json({ providers, grouped });
  });

  // Health check
  router.get('/api/providers/sdk/health', async (req, res) => {
    const cap = req.query.capability || undefined;
    const results = await healthCheckAll(cap);
    res.json({ results });
  });

  // Get / set active provider IDs
  router.get('/api/providers/sdk/active', (req, res) => {
    const caps = ['llm', 'image', 'tts', 'music', 'stt', 'translate', 'moderation'];
    const active = {};
    const fallbacks = {};
    for (const c of caps) {
      active[c] = getActiveProviderId(c);
      fallbacks[c] = getFallbackChain(c);
    }
    res.json({ active, fallbacks });
  });

  router.post('/api/providers/sdk/active', (req, res) => {
    const { capability, id } = req.body || {};
    if (!capability) return res.status(400).json({ error: 'capability required' });
    setActiveProvider(capability, id || '');
    res.json({ ok: true, capability, id });
  });

  // Set fallback chain
  router.post('/api/providers/sdk/fallback', (req, res) => {
    const { capability, chain } = req.body || {};
    if (!capability || !Array.isArray(chain)) return res.status(400).json({ error: 'capability + chain[] required' });
    setFallbackChain(capability, chain);
    res.json({ ok: true, capability, chain });
  });

  // Custom providers
  router.get('/api/providers/sdk/custom', (_req, res) => {
    res.json({ providers: listCustomProviders() });
  });

  router.post('/api/providers/sdk/custom', (req, res) => {
    try {
      const provider = registerCustomProvider(req.body || {});
      res.json({ ok: true, id: provider.id, label: provider.label });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/api/providers/sdk/custom/:id', (req, res) => {
    removeCustomProvider(req.params.id);
    res.json({ ok: true });
  });

  // S30: Auto-detect local engines on common ports
  router.post('/api/providers/sdk/detect-local', async (_req, res) => {
    const detected = [];
    await Promise.allSettled(LOCAL_PROBES.map(async (probe) => {
      try {
        const url = `http://localhost:${probe.port}`;
        const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) {
          detected.push({ ...probe, url, detected: true });
        }
      } catch { /* not running */ }
    }));
    res.json({ detected });
  });

  return router;
}

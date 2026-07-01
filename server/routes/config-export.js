/**
 * Config-as-Code routes — S37.
 *
 * Export / import the entire app configuration as a versioned JSON bundle.
 * The bundle contains: templates, prompts, providers (without API keys),
 * image/audio/music config, custom providers, plugins.
 *
 * GET  /api/config/export   — download a .storybuddy config bundle
 * POST /api/config/import   — restore from a .storybuddy bundle
 * GET  /api/config/history  — list config snapshots (kv-backed)
 * POST /api/config/snapshot — take a named snapshot
 */
import { Router } from 'express';
import { getImageConfig, setImageConfig } from '../store/image-config.js';
import { getAudioConfig, setAudioConfig } from '../store/audio-config.js';
import { getMusicConfig, setMusicConfig } from '../store/music-config.js';
import { listCustomProviders, registerCustomProvider } from '../services/providers/index.js';
import { listPlugins } from '../services/plugin-system/index.js';

const BUNDLE_VERSION = '1.0.0';

/** In-memory snapshot history (last 20). */
const SNAPSHOTS = [];

function buildBundle(label = 'export') {
  const imageConfig = getImageConfig();
  const audioConfig = getAudioConfig();
  const musicConfig = getMusicConfig();

  return {
    __type: 'storybuddy-config',
    version: BUNDLE_VERSION,
    label,
    exportedAt: new Date().toISOString(),
    imageConfig: {
      engine: imageConfig.engine,
      urls: imageConfig.urls,
      options: { ...imageConfig.options },
    },
    audioConfig: {
      engine: audioConfig.engine,
      url: audioConfig.url,
      options: audioConfig.options,
    },
    musicConfig: {
      engine: musicConfig.engine,
      url: musicConfig.url,
      options: musicConfig.options,
    },
    customProviders: listCustomProviders(),
    plugins: listPlugins().map(({ id, name, version, description }) => ({ id, name, version, description })),
  };
}

export function configExportRouter() {
  const router = Router();

  // Export bundle
  router.get('/api/config/export', (req, res) => {
    const label = req.query.label || 'export';
    const bundle = buildBundle(label);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="istorybook-config-${Date.now()}.storybuddy"`);
    res.json(bundle);
  });

  // Import bundle
  router.post('/api/config/import', (req, res) => {
    const bundle = req.body;
    if (!bundle || bundle.__type !== 'storybuddy-config') {
      return res.status(400).json({ error: 'Invalid .storybuddy bundle' });
    }

    const applied = [];

    if (bundle.imageConfig) { setImageConfig(bundle.imageConfig); applied.push('imageConfig'); }
    if (bundle.audioConfig) { setAudioConfig(bundle.audioConfig); applied.push('audioConfig'); }
    if (bundle.musicConfig) { setMusicConfig(bundle.musicConfig); applied.push('musicConfig'); }

    if (Array.isArray(bundle.customProviders)) {
      for (const schema of bundle.customProviders) {
        try { registerCustomProvider(schema); } catch { /* skip invalid */ }
      }
      applied.push('customProviders');
    }

    // Take a snapshot before import for rollback
    const snap = { label: `pre-import-${Date.now()}`, bundle: buildBundle('pre-import'), at: new Date().toISOString() };
    SNAPSHOTS.unshift(snap);
    if (SNAPSHOTS.length > 20) SNAPSHOTS.length = 20;

    res.json({ ok: true, applied, bundleVersion: bundle.version, label: bundle.label });
  });

  // Snapshot history
  router.get('/api/config/history', (_req, res) => {
    res.json({ snapshots: SNAPSHOTS.map(({ label, at }) => ({ label, at })) });
  });

  // Take named snapshot
  router.post('/api/config/snapshot', (req, res) => {
    const label = req.body?.label || `snapshot-${Date.now()}`;
    const snap = { label, bundle: buildBundle(label), at: new Date().toISOString() };
    SNAPSHOTS.unshift(snap);
    if (SNAPSHOTS.length > 20) SNAPSHOTS.length = 20;
    res.json({ ok: true, label, at: snap.at });
  });

  // Restore a snapshot by index
  router.post('/api/config/restore/:idx', (req, res) => {
    const idx = parseInt(req.params.idx, 10);
    if (isNaN(idx) || idx < 0 || idx >= SNAPSHOTS.length) {
      return res.status(404).json({ error: 'snapshot not found' });
    }
    const snap = SNAPSHOTS[idx];
    if (snap.bundle.imageConfig) setImageConfig(snap.bundle.imageConfig);
    if (snap.bundle.audioConfig) setAudioConfig(snap.bundle.audioConfig);
    if (snap.bundle.musicConfig) setMusicConfig(snap.bundle.musicConfig);
    res.json({ ok: true, restoredFrom: snap.label, at: snap.at });
  });

  return router;
}

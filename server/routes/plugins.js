/**
 * Plugin management routes — S32.
 *
 * GET  /api/plugins         — list installed plugins
 * POST /api/plugins/install — install a plugin from manifest JSON
 * DELETE /api/plugins/:id   — uninstall a plugin
 * GET  /api/plugins/:id     — get plugin details
 * GET  /api/exporters       — list all available exporters by format
 */
import { Router } from 'express';
import { listPlugins, installPlugin, uninstallPlugin, getPlugin, getExporters } from '../services/plugin-system/index.js';

export function pluginsRouter() {
  const router = Router();

  router.get('/api/plugins', (_req, res) => {
    res.json({ plugins: listPlugins() });
  });

  router.post('/api/plugins/install', async (req, res) => {
    try {
      const result = await installPlugin(req.body || {});
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/api/plugins/:id', (req, res) => {
    const ok = uninstallPlugin(req.params.id);
    res.json({ ok });
  });

  router.get('/api/plugins/:id', (req, res) => {
    const p = getPlugin(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json(p);
  });

  router.get('/api/exporters', (req, res) => {
    const format = req.query.format;
    res.json({ exporters: getExporters(format || undefined) });
  });

  return router;
}

/**
 * RunPod status passthrough — lets the UI show whether the image server is awake.
 *   GET /api/runpod/status
 */
import { Router } from 'express';
import { status } from '../services/runpod.js';

export function runpodRouter() {
  const router = Router();

  router.get('/api/runpod/status', async (req, res) => {
    try {
      const snap = await status(req.query.url);
      res.json({ ok: true, ...snap });
    } catch (err) {
      res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

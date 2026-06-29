/**
 * Developer-tools + provider routes.
 *   AI Audit (ce_audit): list / detail / delete / clear
 *   Providers: list / set active + configs
 */
import { Router } from 'express';
import { listAiAudit, getAiAudit, deleteAiAudit, clearAiAudit, setMax } from '../store/aiAudit.js';
import { listProviders, setProviders } from '../store/provider.js';

export function devtoolsRouter() {
  const router = Router();

  // ── AI Audit ────────────────────────────────────────────────────────────────
  router.get('/api/ai-audit', (_req, res) => res.json(listAiAudit()));
  router.get('/api/ai-audit/:id', (req, res) => {
    const e = getAiAudit(req.params.id);
    if (!e) return res.status(404).json({ error: 'not found' });
    res.json(e);
  });
  router.delete('/api/ai-audit/:id', (req, res) => { deleteAiAudit(req.params.id); res.json({ ok: true }); });
  router.delete('/api/ai-audit', (_req, res) => { clearAiAudit(); res.json({ ok: true }); });
  router.patch('/api/ai-audit/config', (req, res) => {
    const { maxEntries } = req.body || {};
    if (typeof maxEntries === 'number' && maxEntries > 0) setMax(maxEntries);
    res.json({ ok: true });
  });

  // ── Providers ────────────────────────────────────────────────────────────────
  router.get('/api/providers', (_req, res) => res.json(listProviders()));
  router.post('/api/providers', (req, res) => {
    const { providers, activeKey } = req.body || {};
    setProviders(providers, activeKey);
    res.json({ ok: true, ...listProviders() });
  });

  return router;
}

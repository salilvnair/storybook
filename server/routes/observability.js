/**
 * Observability Suite — S36.
 *
 * GET  /api/observability/runs           — list all story generation runs with timeline
 * GET  /api/observability/runs/:id       — full trace for a run (steps + timings)
 * POST /api/observability/replay/:id     — replay a generation (re-runs the same inputs)
 * GET  /api/observability/metrics        — provider metrics (latency, success rate, cost)
 * GET  /api/observability/diff/:a/:b     — diff two stories (prompt + images)
 */
import { Router } from 'express';
import { getStory, listStories } from '../store/story-library.js';
import { listAiAudit } from '../store/aiAudit.js';

/** In-memory run trace store. Populated by generation middleware. */
const RUN_TRACES = new Map();

/** Accumulate metrics per provider. */
const PROVIDER_METRICS = new Map();

/**
 * Record a step in the current run trace.
 * Called by generation routes during their execution.
 */
export function recordRunStep(runId, step) {
  if (!RUN_TRACES.has(runId)) {
    RUN_TRACES.set(runId, { id: runId, steps: [], startedAt: new Date().toISOString(), status: 'running' });
  }
  const trace = RUN_TRACES.get(runId);
  trace.steps.push({ ...step, ts: new Date().toISOString() });
  if (step.type === 'done') trace.status = 'done';
  if (step.type === 'error') { trace.status = 'error'; trace.error = step.message; }
}

/**
 * Record provider metrics (called from generation and LLM routes).
 */
export function recordProviderMetric(providerId, ok, latencyMs, costCents = 0) {
  if (!PROVIDER_METRICS.has(providerId)) {
    PROVIDER_METRICS.set(providerId, { id: providerId, calls: 0, errors: 0, totalMs: 0, totalCost: 0 });
  }
  const m = PROVIDER_METRICS.get(providerId);
  m.calls++;
  if (!ok) m.errors++;
  m.totalMs += latencyMs;
  m.totalCost += costCents;
}

export function observabilityRouter() {
  const router = Router();

  // List all run traces (enriched with story metadata)
  router.get('/api/observability/runs', (_req, res) => {
    const traces = [...RUN_TRACES.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const enriched = traces.map((t) => {
      const story = getStory(t.storyId || '');
      return {
        ...t,
        storyTitle: story?.title,
        stepCount: t.steps?.length || 0,
        durationMs: t.endedAt
          ? new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()
          : null,
      };
    });
    res.json({ runs: enriched });
  });

  // Full trace for a specific run
  router.get('/api/observability/runs/:id', (req, res) => {
    const trace = RUN_TRACES.get(req.params.id);
    if (!trace) return res.status(404).json({ error: 'trace not found' });
    res.json(trace);
  });

  // Replay a generation from its stored inputs
  router.post('/api/observability/replay/:id', async (req, res) => {
    const trace = RUN_TRACES.get(req.params.id);
    if (!trace || !trace.inputs) {
      // Try finding the original story and re-generating from it
      const story = getStory(req.params.id);
      if (!story) return res.status(404).json({ error: 'run or story not found' });
      // Start a new generation with the same story JSON
      const port = process.env.PORT || 8787;
      const r = await fetch(`http://localhost:${port}/api/storybook/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: story.story }),
      });
      res.status(r.status);
      r.body?.pipeTo(res.writable).catch(() => {});
    } else {
      const port = process.env.PORT || 8787;
      const r = await fetch(`http://localhost:${port}/api/storybook/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trace.inputs),
      });
      r.body?.pipeTo(res.writable).catch(() => {});
    }
  });

  // Provider metrics dashboard
  router.get('/api/observability/metrics', (_req, res) => {
    const metrics = [...PROVIDER_METRICS.values()].map((m) => ({
      ...m,
      avgLatencyMs: m.calls > 0 ? Math.round(m.totalMs / m.calls) : 0,
      successRate: m.calls > 0 ? ((m.calls - m.errors) / m.calls * 100).toFixed(1) : '0',
      avgCostCents: m.calls > 0 ? (m.totalCost / m.calls).toFixed(3) : '0',
    }));

    // Also include AI audit data for LLM calls
    const auditList = listAiAudit ? listAiAudit() : [];
    const llmStats = {};
    for (const entry of auditList) {
      const key = entry.model || 'unknown';
      if (!llmStats[key]) llmStats[key] = { calls: 0, errors: 0, totalMs: 0 };
      llmStats[key].calls++;
      if (entry.error) llmStats[key].errors++;
      llmStats[key].totalMs += entry.ms || 0;
    }

    const llmMetrics = Object.entries(llmStats).map(([model, s]) => ({
      id: `llm::${model}`, model,
      calls: s.calls, errors: s.errors,
      avgLatencyMs: s.calls > 0 ? Math.round(s.totalMs / s.calls) : 0,
      successRate: s.calls > 0 ? ((s.calls - s.errors) / s.calls * 100).toFixed(1) : '0',
    }));

    res.json({ providers: metrics, llm: llmMetrics, totalRuns: RUN_TRACES.size });
  });

  // Diff two story runs (prompt comparison, scene count, etc.)
  router.get('/api/observability/diff/:a/:b', (req, res) => {
    const [a, b] = [getStory(req.params.a), getStory(req.params.b)];
    if (!a || !b) return res.status(404).json({ error: 'one or both stories not found' });

    const diff = {
      titles: { a: a.title, b: b.title, same: a.title === b.title },
      sceneCounts: { a: a.story?.scenes?.length || 0, b: b.story?.scenes?.length || 0 },
      engines: { a: a.imageEngine, b: b.imageEngine, same: a.imageEngine === b.imageEngine },
      chatModels: { a: a.chatModel, b: b.chatModel, same: a.chatModel === b.chatModel },
      scenes: (a.story?.scenes || []).map((sceneA, i) => {
        const sceneB = b.story?.scenes?.[i];
        return {
          index: i,
          textA: sceneA.text?.slice(0, 100),
          textB: sceneB?.text?.slice(0, 100),
          same: sceneA.text === sceneB?.text,
        };
      }),
      createdAt: { a: a.createdAt, b: b.createdAt },
    };
    res.json(diff);
  });

  return router;
}

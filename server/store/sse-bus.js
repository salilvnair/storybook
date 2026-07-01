/**
 * In-memory SSE bus (Express). Maps conversationId → Set<res>. The conversation
 * stream route registers a response; the message route emits VERBOSE token events
 * + ENGINE_RETURN while the LLM answer streams. Mirrors the convengine-chat-demo
 * sse-bus, adapted to Express response objects.
 */
const subs = new Map(); // conversationId → Set<res>

export function registerSse(conversationId, res) {
  if (!subs.has(conversationId)) subs.set(conversationId, new Set());
  subs.get(conversationId).add(res);
}

export function unregisterSse(conversationId, res) {
  const set = subs.get(conversationId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subs.delete(conversationId);
}

export function emitSse(conversationId, stage, data) {
  const set = subs.get(conversationId);
  if (!set || set.size === 0) return false;
  const payload = `event: ${stage}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* closed */ }
  }
  return true;
}

/**
 * Stream a sequence of "thinking" progress lines (VERBOSE) into the typing
 * indicator while a non-streaming LLM call runs — so endpoints that return a
 * structured payload (template / character specs) still FEEL live instead of a
 * sudden REST blob. Returns a `stop()` to call when the work is done; it clears
 * the progress with ENGINE_RETURN.
 */
export function startThinking(conversationId, steps, intervalMs = 650) {
  let i = 0;
  // Emit the first step immediately so the indicator updates right away.
  if (steps.length) emitSse(conversationId, 'VERBOSE', { verbose: { text: steps[i++] } });
  const timer = setInterval(() => {
    if (i < steps.length) emitSse(conversationId, 'VERBOSE', { verbose: { text: steps[i++] } });
  }, intervalMs);
  return () => {
    clearInterval(timer);
    emitSse(conversationId, 'ENGINE_RETURN', { stage: 'ENGINE_RETURN' });
  };
}

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

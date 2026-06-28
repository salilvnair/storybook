/**
 * In-memory conversation store. Keyed by conversationId.
 * Good enough for a personal single-user app; swap for SQLite later if needed.
 */
const conversations = new Map();

export function getConversation(id) {
  if (!conversations.has(id)) {
    conversations.set(id, { id, messages: [], story: null, createdAt: Date.now() });
  }
  return conversations.get(id);
}

export function appendMessage(id, role, content) {
  const conv = getConversation(id);
  conv.messages.push({ id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role, content, ts: Date.now() });
  return conv;
}

export function setStory(id, story) {
  const conv = getConversation(id);
  conv.story = story;
  return conv;
}

export function resetConversation(id) {
  conversations.set(id, { id, messages: [], story: null, createdAt: Date.now() });
  return conversations.get(id);
}

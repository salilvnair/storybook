/**
 * ConvEngine Chat backend routes.
 *   POST /api/v1/conversation/message   — send user message, get assistant reply
 *   POST /api/v1/conversation/feedback  — thumbs up/down (no-op store)
 *   GET  /api/v1/conversation/audit/:id — full transcript
 *
 * The message reply payload is an object:
 *   { type: 'story', rawText: <markdown the user reads>, story: <parsed story|null> }
 * The frontend's custom renderer reads rawText (markdown) and, when story != null,
 * shows a "Generate Storybook" card.
 */
import { Router } from 'express';
import { chatStream } from '../services/llm.js';
import { buildSystemPrompt, parseStory } from '../services/storyAgent.js';
import { getConversation, appendMessage, setStory, resetConversation } from '../store/conversations.js';
import { getPromptOverrides, setPromptOverrides } from '../store/prompts.js';
import { activeProviderOverride } from '../store/provider.js';
import { registerSse, unregisterSse, emitSse } from '../store/sse-bus.js';
import {
  DEFAULT_SCENE_STYLE,
  DEFAULT_COVER_PROMPT,
  DEFAULT_CHARACTER_CLAUSE,
  DEFAULT_PHOTO_HERO_PROMPT,
} from '../services/prompt-templates.js';

// Re-export for callers that import these from conversation.js
export { DEFAULT_CHARACTER_CLAUSE, DEFAULT_PHOTO_HERO_PROMPT };

export function conversationRouter() {
  const router = Router();

  // ── Prompt Library: defaults + override setter ──────────────────────────────
  router.get('/api/prompts/defaults', (_req, res) => {
    res.json({
      storySystem: buildSystemPrompt(),
      storyUser: '{{message}}',
      sceneStyle: DEFAULT_SCENE_STYLE,
      coverPrompt: DEFAULT_COVER_PROMPT,
      characterClause: DEFAULT_CHARACTER_CLAUSE,
      photoHeroPrompt: DEFAULT_PHOTO_HERO_PROMPT,
    });
  });
  router.post('/api/prompts', (req, res) => {
    res.json({ ok: true, overrides: setPromptOverrides(req.body || {}) });
  });

  // ── SSE stream — ConvEngine connects here when streaming is enabled (S2.04) ──
  router.get('/api/v1/conversation/stream/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ conversationId })}\n\n`);
    registerSse(conversationId, res);
    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* */ } }, 25000);
    req.on('close', () => { clearInterval(keepAlive); unregisterSse(conversationId, res); });
  });

  router.post('/api/v1/conversation/message', async (req, res) => {
    const { conversationId, message, reset, inputParams } = req.body || {};
    const id = conversationId || 'default';

    if (reset) resetConversation(id);

    // messageEnrichment json-mode carries the original text in inputParams.userText
    const userText = (inputParams && inputParams.userText) || message || '';
    if (!userText.trim()) {
      return res.json({ payload: { type: 'story', rawText: 'Tell me about the story you want to create! 🪄', story: null } });
    }

    // Intent: "show current template / layout" — surface the live template, no LLM call.
    // The [[show-template]] sentinel in rawText is detected client-side (survives
    // ConvEngine's payload handling) and replaced with the inline live preview.
    if (/\b(show|current|which|what).{0,20}(template|layout)\b|^\s*template\s*$/i.test(userText)) {
      return res.json({
        payload: {
          type: 'story',
          rawText: 'Here’s the template your storybook will use 👇 You can change it any time in 🎨 **Templates**.\n\n[[show-template]]',
          story: null,
        },
      });
    }

    // Apply the Prompt Library "User Prompt" template if set ({{message}} = the
    // parent's text). Empty template = passthrough (send the raw message).
    const userTpl = getPromptOverrides().storyUser;
    const sentText = userTpl && userTpl.trim()
      ? userTpl.replace(/\{\{\s*message\s*\}\}/g, userText)
      : userText;

    appendMessage(id, 'user', sentText);
    const conv = getConversation(id);

    // Use the Prompt Library override for the Story Author system prompt if set.
    const sysOverride = getPromptOverrides().storySystem;
    const messages = [
      { role: 'system', content: sysOverride && sysOverride.trim() ? sysOverride : buildSystemPrompt() },
      ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      // Stream the answer token-by-token to the SSE bus (live typing indicator),
      // passing the full conversation history + the active configured provider.
      const { content } = await chatStream(
        messages,
        { temperature: 0.85, stage: 'Story Chat', override: activeProviderOverride() || undefined },
        (full) => {
          // Show the conversational part building up (hide the trailing JSON block).
          const visible = full.split('```')[0];
          emitSse(id, 'VERBOSE', { verbose: { text: visible } });
        },
      );
      emitSse(id, 'ENGINE_RETURN', { stage: 'ENGINE_RETURN' });
      appendMessage(id, 'assistant', content);

      const { story, cleanText } = parseStory(content);
      if (story) setStory(id, story);

      return res.json({ payload: { type: 'story', rawText: cleanText || content, story } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.json({ payload: { type: 'story', rawText: `⚠️ ${msg}`, story: null } });
    }
  });

  router.post('/api/v1/conversation/feedback', (req, res) => {
    // Personal app — accept and ignore.
    res.json({ ok: true });
  });

  router.get('/api/v1/conversation/audit/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    res.json({
      conversationId: conv.id,
      messages: conv.messages,
      hasStory: Boolean(conv.story),
    });
  });

  return router;
}

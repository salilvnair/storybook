/**
 * Character Studio backend.
 *
 *   POST /api/character/message — ConvEngine chat that designs a character from a
 *       freeform description. Returns interactive-renderer payloads
 *       ({type:'CharacterControls'} carrying an [[apply-char:{…}]] spec) that the
 *       client renders as a suggestion card + "Create Character" button.
 *       Conversational + deterministic; the spec is inferred via the LLM when a
 *       key is configured (falls back gracefully otherwise).
 */
import { Router } from 'express';
import { characterFromDescription } from '../services/characterAgent.js';
import { startThinking } from '../store/sse-bus.js';

export function characterRouter() {
  const router = Router();

  router.post('/api/character/message', async (req, res) => {
    const { message, inputParams, conversationId } = req.body || {};
    const id = conversationId || 'character-studio';
    const action = inputParams?.action || '';
    const text = String(message || '').trim();
    const lower = text.toLowerCase();

    const card = (intro, spec) =>
      res.json({ payload: { type: 'CharacterControls', intro: spec ? `[[apply-char:${JSON.stringify(spec)}]]${intro}` : intro } });

    if (action === 'created') {
      return res.json({ payload: { type: 'CharacterControls', intro: 'Saved! ✨ Your character is in the studio on the right and will be injected into every scene. Describe another, or tweak this one.' } });
    }

    const isCommand = action === 'start' || lower.length < 4 || /^(help|start|begin|new character)\b/.test(lower);
    if (!isCommand && text) {
      // Stream "thinking" progress into the typing indicator while the LLM infers
      // the character (this endpoint returns a structured card, not chat text).
      const stop = startThinking(id, [
        '🧠 Reading your description…',
        '🎨 Designing the look…',
        '✨ Choosing personality traits…',
        '📦 Building the character…',
      ]);
      try {
        const spec = await characterFromDescription(text);
        stop();
        if (spec) {
          return card("Here's a character from your description — review it on the right, tweak anything, then **Create Character**.", spec);
        }
      } catch { stop(); /* fall through */ }
    }

    return res.json({
      payload: {
        type: 'CharacterControls',
        intro: 'Describe a character — who they are, what they look like, their personality. e.g. *"a shy little silver rabbit with a purple bow who loves stargazing"*. I\'ll fill in the studio on the right.',
      },
    });
  });

  return router;
}

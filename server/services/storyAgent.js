/**
 * Story Agent — the brain of the chat.
 *
 * Prompt strings live in prompt-templates.js — nothing is hardcoded here.
 * This module owns: story parsing, character clause building, scene prompt assembly.
 */
import {
  STORYBOOK_FENCE,
  DEFAULT_SCENE_STYLE,
  DEFAULT_CHARACTER_CLAUSE,
  buildSystemPrompt,
} from './prompt-templates.js';

// Re-export for callers that import from storyAgent (conversation.js etc.)
export { STORYBOOK_FENCE, buildSystemPrompt };

/**
 * Extract the ```storybook JSON block from an assistant message.
 * @returns {{ story: object|null, cleanText: string }}
 *   story    — parsed { title, author?, style?, scenes:[...] } or null
 *   cleanText— the message with the fenced block removed (what the user reads)
 */
export function parseStory(text) {
  if (typeof text !== 'string') return { story: null, cleanText: '' };

  const fenceRe = new RegExp('```' + STORYBOOK_FENCE + '\\s*([\\s\\S]*?)```', 'i');
  const m = text.match(fenceRe);
  if (!m) return { story: null, cleanText: text.trim() };

  let story = null;
  try {
    story = JSON.parse(m[1].trim());
  } catch {
    const braceMatch = m[1].match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { story = JSON.parse(braceMatch[0]); } catch { story = null; }
    }
  }

  const cleanText = text.replace(fenceRe, '').trim();
  return { story: normalizeStory(story), cleanText };
}

function normalizeStory(story) {
  if (!story || typeof story !== 'object') return null;
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  if (scenes.length === 0) return null;

  return {
    title: String(story.title || 'My Storybook'),
    author: String(story.author || ''),
    style: String(story.style || DEFAULT_SCENE_STYLE),
    scenes: scenes.map((s, i) => ({
      index: i + 1,
      title: String(s.title || `Scene ${i + 1}`),
      narration: String(s.narration || s.content || s.text || ''),
      says: String(s.says || ''),
      thinks: String(s.thinks || ''),
      image_prompt: String(s.image_prompt || s.prompt || s.narration || s.title || ''),
    })),
  };
}

/**
 * Build a character-consistency clause from the cast array.
 * The clause template is customisable via the Prompt Library (`characterClause` key).
 * @param {Array<{name:string, lookDescription:string}>} cast
 * @param {string} [clauseTemplate]  optional Prompt Library override
 */
export function buildCharacterClause(cast = [], clauseTemplate = '') {
  if (!cast || cast.length === 0) return '';
  const parts = cast
    .filter((c) => c.name && c.lookDescription)
    .map((c) => `${c.name}: ${c.lookDescription}`);
  if (parts.length === 0) return '';
  const template = (clauseTemplate && clauseTemplate.trim()) ? clauseTemplate : DEFAULT_CHARACTER_CLAUSE;
  return template.replace('{{characters}}', parts.join('; '));
}

/**
 * Build the final per-scene image prompt sent to the image engine:
 * visual prompt + bubble text + character consistency clause + global style.
 * @param {object} scene
 * @param {string} style
 * @param {string} [characterClause]
 */
export function buildScenePrompt(scene, style, characterClause = '') {
  let prompt = scene.image_prompt || scene.narration || scene.title;
  if (scene.says) prompt += `. Speech bubble says: "${scene.says}"`;
  if (scene.thinks) prompt += `. Thought bubble thinks: "${scene.thinks}"`;
  if (characterClause) prompt += `. ${characterClause}`;
  prompt += `. Style: ${style}.`;
  return prompt;
}

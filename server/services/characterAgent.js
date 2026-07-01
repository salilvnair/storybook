/**
 * Character agent — turns a freeform description ("a shy little fox who loves
 * stargazing") into a partial Character spec using the LLM. Returns a plain
 * object the client applies to the live character-draft store.
 */
import { chat } from './llm.js';
import { activeProviderOverride } from '../store/provider.js';
import { getPromptOverrides } from '../store/prompts.js';

const ROLES = ['hero', 'sidekick', 'villain', 'mentor', 'minor'];
const AGES = ['toddler (1–3)', 'young child (4–6)', 'older child (7–10)', 'teen (11–15)', 'adult', 'elder'];

const CHAR_SYSTEM = [
  'You convert a description of a children\'s-story character into a JSON "character spec".',
  'Return ONLY a JSON object (no prose, no code fence) with any of these keys:',
  '  name: a short character name',
  `  role: one of ${ROLES.map((r) => `"${r}"`).join(' | ')}`,
  '  species: e.g. "human", "rabbit", "fox", "dragon", "robot" (lowercase)',
  `  age: one of ${AGES.map((a) => `"${a}"`).join(' | ')}`,
  '  lookDescription: ONE vivid sentence describing the character\'s visual appearance — colours, clothing, distinctive features — suitable to inject into an image prompt for consistency across pages.',
  '  traits: array of 2-5 lowercase personality words (e.g. "brave", "curious")',
  'Pick values that fit the description. Omit keys you are unsure about.',
].join('\n');

/** @returns {Promise<object|null>} partial character spec or null */
export async function characterFromDescription(description) {
  const ov = getPromptOverrides();
  const system = (ov.characterDesignSystem || '').trim() || CHAR_SYSTEM;
  const userTpl = (ov.characterDesignUser || '').trim()
    || `Character description:\n{{description}}\n\nReturn the JSON character spec.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userTpl.replace(/\{\{\s*description\s*\}\}/g, description) },
  ];
  const { content } = await chat(messages, { temperature: 0.6, stage: 'Character Spec', override: activeProviderOverride() || undefined });
  return parseSpec(content);
}

function parseSpec(text) {
  if (!text) return null;
  let json = text.trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) json = fence[1].trim();
  const brace = json.match(/\{[\s\S]*\}/);
  if (brace) json = brace[0];
  try {
    const obj = JSON.parse(json);
    const out = {};
    if (typeof obj.name === 'string' && obj.name.trim()) out.name = obj.name.trim().slice(0, 60);
    if (ROLES.includes(obj.role)) out.role = obj.role;
    if (typeof obj.species === 'string' && obj.species.trim()) out.species = obj.species.trim().toLowerCase().slice(0, 30);
    if (AGES.includes(obj.age)) out.age = obj.age;
    if (typeof obj.lookDescription === 'string' && obj.lookDescription.trim()) out.lookDescription = obj.lookDescription.trim().slice(0, 400);
    if (Array.isArray(obj.traits)) {
      const traits = obj.traits.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase()).slice(0, 6);
      if (traits.length) out.traits = traits;
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/**
 * Template agent — turns a freeform layout description (Mode B) or a reference
 * cue (Mode C) into a partial Template Spec using the LLM. Returns a plain object
 * of spec fields; the client applies it to the live template-store.
 */
import { chat } from './llm.js';
import { activeProviderOverride } from '../store/provider.js';

const SPEC_SYSTEM = [
  'You convert a description of a children picture-book page layout into a JSON "template spec".',
  'Return ONLY a JSON object (no prose, no code fence) with any of these keys:',
  '  pageKind: "spread" | "single"',
  '  aspect: "2:1" | "3:2" | "1:1"',
  '  textSide: "left" | "right"',
  '  glow: boolean',
  '  palette: array of 4-8 hex colours for the text page (warm, soft, child-friendly)',
  '  cardColor: hex (the cream text card)',
  '  frameColor: hex (the card border)',
  '  emphasisColor: hex (the spoken/accent line)',
  '  inkColor: hex (body text)',
  'Pick values that match the mood described. Omit keys you are unsure about.',
].join('\n');

/** @returns {Promise<object|null>} partial spec or null */
export async function specFromDescription(description) {
  const messages = [
    { role: 'system', content: SPEC_SYSTEM },
    { role: 'user', content: `Layout description:\n${description}\n\nReturn the JSON spec.` },
  ];
  const { content } = await chat(messages, { temperature: 0.4, stage: 'Template Spec', override: activeProviderOverride() || undefined });
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
    // Whitelist + light validation
    const out = {};
    if (obj.pageKind === 'spread' || obj.pageKind === 'single') out.pageKind = obj.pageKind;
    if (['2:1', '3:2', '1:1'].includes(obj.aspect)) out.aspect = obj.aspect;
    if (obj.textSide === 'left' || obj.textSide === 'right') out.textSide = obj.textSide;
    if (typeof obj.glow === 'boolean') out.glow = obj.glow;
    if (Array.isArray(obj.palette) && obj.palette.every((c) => /^#[0-9a-f]{3,8}$/i.test(c))) out.palette = obj.palette.slice(0, 8);
    for (const k of ['cardColor', 'frameColor', 'emphasisColor', 'inkColor']) {
      if (typeof obj[k] === 'string' && /^#[0-9a-f]{3,8}$/i.test(obj[k])) out[k] = obj[k];
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

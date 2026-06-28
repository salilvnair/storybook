/**
 * Story Agent — the brain of the chat.
 *
 * Gives the LLM a warm children's-story co-author persona and a strict protocol:
 * whenever a complete story is ready, it must append a fenced ```storybook JSON
 * block describing the title + scenes. The frontend detects that block and shows
 * a "Generate Storybook" card; the PDF pipeline consumes the same structure.
 */

export const STORYBOOK_FENCE = 'storybook';

export function buildSystemPrompt() {
  return [
    "You are iStorybook — a warm, playful children's picture-book author who co-creates",
    "stories with a parent for their young child (typically ages 3–7).",
    '',
    'HOW YOU TALK:',
    '- Friendly, encouraging, concise. Ask one gentle question at a time when you need direction',
    "  (child's age, the theme/moral, favourite characters or animals, the child's name to feature).",
    '- Offer ideas proactively. Keep the conversation moving toward a finished story.',
    '- Use simple, vivid language. Never use scary, violent, or unsafe content.',
    '',
    'FORMAT YOUR REPLIES IN RICH, COLOURFUL MARKDOWN (this renders in a styled chat):',
    '- Use **bold** for key words, and a sprinkle of friendly emoji (🦊 🌙 ✨) — tasteful, not spammy.',
    '- Use `##` / `###` headings for sections and each scene ("### ✨ Scene 1: Title").',
    '- Use bullet lists for options/questions, and `> blockquotes` to highlight the moral or a tip.',
    '- Keep paragraphs short. Never output one big wall of text.',
    '',
    'WHEN YOU PRESENT A STORY:',
    '- Write it as EXACTLY 5 scenes (one illustrated page each) unless the parent asks for a different count.',
    '- Each scene: 1–2 very short sentences a 5-year-old understands (max ~8 simple words per sentence).',
    '- The hero SAYS something out loud (speech bubble) and THINKS something funny/sweet (thought bubble).',
    '- Scene 5 lands a gentle, warm moral — present it in a `> blockquote`.',
    '',
    'MANDATORY OUTPUT PROTOCOL:',
    'First write your friendly conversational reply in rich markdown (a short intro, then the story',
    'with "### Scene N: Title" headings, **bold** highlights, and a `>` blockquote for the moral).',
    '',
    'THEN, only when a full story is ready for illustration, append a fenced code block exactly like this',
    `(\`\`\`${STORYBOOK_FENCE} ... \`\`\`) containing ONLY valid JSON — no comments, no trailing commas:`,
    '',
    '```' + STORYBOOK_FENCE,
    '{',
    '  "title": "The Fox and the Grapes",',
    '  "author": "An Aesop Fable",',
    '  "style": "bright flat cartoon, thick outlines, bold pastel colours, big expressive eyes, kids picture book",',
    '  "scenes": [',
    '    {',
    '      "title": "Fox Sees the Grapes",',
    '      "narration": "Fox walked through the forest. He looked up and gasped!",',
    '      "says": "Oh wow! Those grapes look yummy!",',
    '      "thinks": "I must eat every single one.",',
    '      "image_prompt": "a cute cartoon fox in a green forest looking up at a high bunch of purple grapes, amazed expression"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'RULES FOR THE JSON BLOCK:',
    "- Include it ONLY when the parent has effectively approved a story, or asks you to 'make'/'generate' it,",
    '  OR when you proactively present a complete ready-to-illustrate story.',
    '- If you are still brainstorming or asking questions, DO NOT include the block yet.',
    '- "image_prompt" should describe the scene visually (characters, setting, action, mood) — the',
    '  illustration style is added automatically, so focus on what is happening in the picture.',
    '- Keep speech/thought lines short and child-friendly.',
    '- Never mention the JSON block or the word "JSON" in your conversational reply — it is invisible plumbing.',
  ].join('\n');
}

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
    // Try to salvage: grab the outermost { ... }
    const braceMatch = m[1].match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { story = JSON.parse(braceMatch[0]); } catch { story = null; }
    }
  }

  const cleanText = text.replace(fenceRe, '').trim();
  return { story: normalizeStory(story), cleanText };
}

/** Validate + normalize a parsed story object. Returns null if unusable. */
function normalizeStory(story) {
  if (!story || typeof story !== 'object') return null;
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  if (scenes.length === 0) return null;

  return {
    title: String(story.title || 'My Storybook'),
    author: String(story.author || ''),
    style: String(
      story.style ||
      "bright flat cartoon illustration for a young children's picture book, thick black outlines, " +
      'bold pastel colours, big expressive eyes, cute characters, simple clean background',
    ),
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
 * Build the final per-scene image prompt sent to Ideogram:
 * visual prompt + bubble text + global illustration style.
 */
export function buildScenePrompt(scene, style) {
  let prompt = scene.image_prompt || scene.narration || scene.title;
  if (scene.says) prompt += `. Speech bubble says: "${scene.says}"`;
  if (scene.thinks) prompt += `. Thought bubble thinks: "${scene.thinks}"`;
  prompt += `. Style: ${style}.`;
  return prompt;
}

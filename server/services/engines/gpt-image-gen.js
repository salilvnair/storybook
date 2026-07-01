/**
 * GPT Image — direct OpenAI image-generation API caller.
 * Supports all current OpenAI image models via /v1/images/generations.
 * No local server required; uses OPENAI_API_KEY (or LLM_API_KEY when LLM_TYPE=openai).
 */
const OPENAI_GEN_URL = 'https://api.openai.com/v1/images/generations';

export const GPT_IMAGE_GEN_MODELS = [
  'chatgpt-image-latest',
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-2',
  'gpt-image-2-2026-04-21',
];

const VALID_SIZES  = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);
const VALID_QUALITY = new Set(['low', 'medium', 'high', 'auto']);

/**
 * @param {{ prompt:string, model?:string, size?:string, quality?:string }} opts
 * @param {string} apiKey  OpenAI API key
 * @returns {Promise<{image_b64:string, seed:null, filename:string}>}
 */
export async function generateGptImage(opts = {}, apiKey) {
  const { prompt } = opts;
  if (!prompt)  throw new Error('prompt required');
  if (!apiKey)  throw new Error('OpenAI API key not configured — set OPENAI_API_KEY in .env');

  const model   = GPT_IMAGE_GEN_MODELS.includes(opts.model) ? opts.model : 'gpt-image-2';
  const size    = VALID_SIZES.has(opts.size)    ? opts.size    : '1024x1024';
  const quality = VALID_QUALITY.has(opts.quality) ? opts.quality : 'medium';

  const body = {
    model,
    prompt,
    n: 1,
    size,
    quality,
    response_format: 'b64_json',
  };

  const res = await fetch(OPENAI_GEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch { /**/ }
    throw new Error(`OpenAI /images/generations ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (!item?.b64_json) throw new Error('OpenAI returned no image data');

  return { image_b64: item.b64_json, seed: null, filename: `gpt-image-gen-${Date.now()}.png` };
}

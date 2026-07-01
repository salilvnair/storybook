/**
 * OpenRouter Unified Image API — direct caller.
 * OpenRouter launched a dedicated image API on 2026-06-23 providing standardized
 * access to 30+ image models across Google, OpenAI, BFL, ByteDance, xAI and more.
 *
 * Endpoint:  POST https://openrouter.ai/api/v1/images
 * Auth:      Authorization: Bearer <OPENROUTER_API_KEY>
 * Response:  { data: [{ b64_json }], usage: { cost } }
 *
 * Parameters (normalized across providers by OpenRouter):
 *   model, prompt, n, aspect_ratio, quality, output_format, background, seed
 */

const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images';

export const OPENROUTER_IMAGE_MODELS = [
  'google/gemini-2.5-flash-image',      // Nano Banana — fast + cheap
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3.1-flash-image',
  'google/gemini-3-pro-image-preview',  // Nano Banana Pro
  'google/gemini-3-pro-image',
  'bytedance/seedream-4.5',
  'black-forest-labs/flux-2-pro',
  'black-forest-labs/flux-2-klein',
  'black-forest-labs/flux-2-max',
  'openai/gpt-5-image-mini',
  'xai/grok-imagine',
];

export const OPENROUTER_DEFAULT_MODEL = 'google/gemini-2.5-flash-image';

const VALID_QUALITY     = new Set(['auto', 'low', 'medium', 'high']);
const VALID_ASPECT      = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21']);
const VALID_FORMAT      = new Set(['png', 'jpeg', 'webp']);
const VALID_BACKGROUND  = new Set(['auto', 'transparent', 'opaque']);

/**
 * @param {{ prompt:string, model?:string, aspect_ratio?:string, quality?:string,
 *           output_format?:string, background?:string, seed?:number|null }} opts
 * @param {string} apiKey  OpenRouter API key
 * @returns {Promise<{image_b64:string, seed:null, filename:string}>}
 */
export async function generateOpenRouterImage(opts = {}, apiKey) {
  const { prompt } = opts;
  if (!prompt)  throw new Error('prompt required');
  if (!apiKey)  throw new Error('OpenRouter API key not configured — set OPENROUTER_API_KEY in .env or enter it in Settings → Image Engine');

  const model        = OPENROUTER_IMAGE_MODELS.includes(opts.model) ? opts.model : OPENROUTER_DEFAULT_MODEL;
  const aspect_ratio = VALID_ASPECT.has(opts.aspect_ratio)   ? opts.aspect_ratio   : '1:1';
  const quality      = VALID_QUALITY.has(opts.quality)       ? opts.quality        : 'auto';
  const output_format = VALID_FORMAT.has(opts.output_format) ? opts.output_format  : 'png';

  const body = {
    model,
    prompt,
    n: 1,
    aspect_ratio,
    quality,
    output_format,
    ...(VALID_BACKGROUND.has(opts.background) ? { background: opts.background } : {}),
    ...(opts.seed != null ? { seed: opts.seed } : {}),
  };

  const res = await fetch(OPENROUTER_IMAGE_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://istorybook.app',
      'X-Title':       'iStorybook',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch { /**/ }
    throw new Error(`OpenRouter /images ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (!item?.b64_json) throw new Error('OpenRouter returned no image data (unexpected response shape)');

  return {
    image_b64: item.b64_json,
    seed: null,
    filename: `openrouter-${model.replace(/\//g, '-')}-${Date.now()}.${output_format}`,
  };
}

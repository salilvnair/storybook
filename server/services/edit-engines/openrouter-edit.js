/**
 * OpenRouter Image Editing — mask-guided inpaint via OpenRouter's Unified Image API.
 *
 * OpenRouter's /api/v1/images endpoint accepts input_references for source images.
 * For mask-guided inpainting we pass the source image as the primary reference and
 * include the mask as a secondary reference; prompt describes the edit.
 *
 * Models known to support image editing with input_references on OpenRouter:
 *   • google/gemini-2.5-flash-image  (cheapest / default — Nano Banana)
 *   • google/gemini-3.1-flash-image
 *   • google/gemini-3-pro-image      (highest quality)
 *   • black-forest-labs/flux-1-fill  (mask-guided fill, if available on OpenRouter)
 *
 * Endpoint: POST https://openrouter.ai/api/v1/images
 */

const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images';

export const OPENROUTER_EDIT_MODELS = [
  'google/gemini-2.5-flash-image',       // cheapest — default
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3.1-flash-image',
  'google/gemini-3-pro-image-preview',
  'google/gemini-3-pro-image',
];

export const OPENROUTER_EDIT_DEFAULT_MODEL = 'google/gemini-2.5-flash-image';

/**
 * @param {{ image_b64:string, mask_b64?:string|null, prompt:string,
 *           model?:string, quality?:string }} opts
 * @param {string} apiKey  OpenRouter API key
 */
export async function editGenerateOpenRouterImage(opts = {}, apiKey) {
  const { image_b64, mask_b64, prompt } = opts;
  if (!image_b64) throw new Error('image_b64 required');
  if (!apiKey)    throw new Error('OpenRouter API key not configured — set OPENROUTER_API_KEY in .env or in Settings → Image Editing Engine');

  const model = OPENROUTER_EDIT_MODELS.includes(opts.model) ? opts.model : OPENROUTER_EDIT_DEFAULT_MODEL;

  // Build input_references: source image first, then mask if provided
  const inputRefs = [{ type: 'image', data: image_b64 }];
  if (mask_b64) {
    inputRefs.push({ type: 'mask', data: mask_b64 });
  }

  const body = {
    model,
    prompt: prompt || 'Edit this image as described',
    n: 1,
    output_format: 'png',
    quality: 'auto',
    input_references: inputRefs,
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
    throw new Error(`OpenRouter /images (edit) ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (!item?.b64_json) throw new Error('OpenRouter returned no image data');

  return {
    image_b64: item.b64_json,
    filename:  `openrouter-edit-${Date.now()}.png`,
    seed:      null,
  };
}

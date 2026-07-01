/**
 * GPT Image 1 — direct OpenAI image-edit API caller.
 * No local server required; uses the OPENAI_API_KEY env var (or LLM_API_KEY
 * when LLM_TYPE=openai). Supports whole-image instruction editing + optional
 * mask-guided inpainting via the /v1/images/edits endpoint.
 *
 * Mask convention: OpenAI expects transparent (alpha=0) areas = "edit here".
 * Our brush tool produces white=edit PNG. Pass mask_b64 only if the client
 * already sends RGBA with transparent areas; otherwise prompt-only editing
 * rewrites the whole image per instruction (still phenomenal quality).
 */

import { GPT_IMAGE_EDIT_MODELS } from './index.js';

const OPENAI_EDITS_URL = 'https://api.openai.com/v1/images/edits';
const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);
const VALID_QUALITY = new Set(['low', 'medium', 'high', 'auto']);

/**
 * @param {{ image_b64:string, mask_b64?:string|null, prompt:string,
 *           quality?:string, size?:string, seed?:number|null }} opts
 * @param {string} apiKey  OpenAI API key
 * @returns {Promise<{image_b64:string, filename:string, seed:null}>}
 */
export async function editGenerateGptImage(opts = {}, apiKey) {
  const { image_b64, mask_b64, prompt } = opts;
  const quality = VALID_QUALITY.has(opts.quality) ? opts.quality : 'medium';
  const size    = VALID_SIZES.has(opts.size)    ? opts.size    : '1024x1024';

  if (!image_b64) throw new Error('image_b64 required');
  if (!apiKey)    throw new Error('OpenAI API key not configured — set OPENAI_API_KEY in .env');

  const model = GPT_IMAGE_EDIT_MODELS.includes(opts.model) ? opts.model : 'gpt-image-1';
  const form = new FormData();
  form.append('model',   model);
  form.append('prompt',  prompt || 'Edit this image as described');
  form.append('n',       '1');
  form.append('size',    size);
  form.append('quality', quality);

  // Image: gpt-image-1 requires PNG (<4MB, ≥512px).
  const imageBytes = Buffer.from(image_b64, 'base64');
  form.append('image', new Blob([imageBytes], { type: 'image/png' }), 'image.png');

  // Mask: only attach if provided (client sends RGBA with transparent=edit areas).
  if (mask_b64) {
    const maskBytes = Buffer.from(mask_b64, 'base64');
    form.append('mask', new Blob([maskBytes], { type: 'image/png' }), 'mask.png');
  }

  const res = await fetch(OPENAI_EDITS_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body:    form,
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch { /* */ }
    throw new Error(`OpenAI /images/edits ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const item = data?.data?.[0];
  if (!item?.b64_json) throw new Error('OpenAI returned no image data (unexpected response shape)');

  return {
    image_b64: item.b64_json,
    filename:  `gpt-image-edit-${Date.now()}.png`,
    seed:      null,
  };
}

/**
 * LLM service — calls an OpenAI-compatible (or Anthropic-style) chat endpoint.
 *
 * Default target is DeepSeek, but any OpenAI-compatible provider works via .env
 * or a per-request `override` (so the Settings → Providers panel drives it live).
 * Every call is recorded to the AI Audit (ce_audit) with full request/response.
 */
import { config } from '../config.js';
import { recordAiCall } from '../store/aiAudit.js';

/**
 * @param {Array<{role:string,content:string}>} messages  full conversation
 * @param {object} [opts]
 * @param {number} [opts.temperature]
 * @param {string} [opts.stage]  audit label (e.g. "Story Chat")
 * @param {{baseUrl?:string,model?:string,apiKey?:string,type?:string}} [opts.override]
 * @returns {Promise<{content:string, model:string, ms:number}>}
 */
export async function chat(messages, opts = {}) {
  const t0 = Date.now();
  const p = { ...config.llm, ...(opts.override || {}) };
  const stage = opts.stage || 'Story Chat';
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const user = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  const audit = (extra) => recordAiCall({ stage, model: p.model, ms: Date.now() - t0, system, user, ...extra });

  if (!p.apiKey) {
    const msg = 'LLM is not configured. Set a provider/key in Settings → Providers, or LLM_API_KEY in .env.';
    audit({ request: { messages }, response: null, error: msg });
    throw new Error(msg);
  }

  const isAnthropic = p.type === 'anthropic';
  let body;
  let url = p.baseUrl;
  let headers;

  if (isAnthropic) {
    const convo = messages.filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    body = { model: p.model, max_tokens: 4096, messages: convo };
    if (system) body.system = system;
    if (opts.temperature != null) body.temperature = opts.temperature;
    headers = { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' };
  } else {
    body = { model: p.model, messages };
    if (opts.temperature != null) body.temperature = opts.temperature;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` };
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      audit({ request: body, response: text, error: `${res.status}` });
      throw new Error(`LLM ${res.status}: ${text}`);
    }
    const data = await res.json();
    const content = isAnthropic
      ? (data.content || []).map((c) => c.text).join('') || ''
      : data.choices?.[0]?.message?.content ?? '';
    audit({ request: body, response: data });
    return { content, model: p.model, ms: Date.now() - t0 };
  } catch (err) {
    if (!String(err.message).startsWith('LLM ')) audit({ request: body, response: null, error: err.message });
    throw err;
  }
}

/**
 * Streaming chat (OpenAI-compatible only). Calls `onToken(fullSoFar, delta)` for
 * each chunk; returns the final content. Anthropic falls back to the non-stream chat.
 * Every call is recorded to the AI Audit.
 */
export async function chatStream(messages, opts = {}, onToken = () => {}) {
  const p = { ...config.llm, ...(opts.override || {}) };
  if (!p.apiKey || p.type === 'anthropic') {
    const r = await chat(messages, opts);
    onToken(r.content, r.content);
    return r;
  }
  const t0 = Date.now();
  const stage = opts.stage || 'Story Chat';
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const user = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const body = { model: p.model, messages, stream: true };
  if (opts.temperature != null) body.temperature = opts.temperature;

  const res = await fetch(p.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = res.body ? await res.text() : '';
    recordAiCall({ stage, model: p.model, ms: Date.now() - t0, system, user, request: body, response: text, error: `${res.status}` });
    throw new Error(`LLM ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onToken(full, delta); }
      } catch { /* ignore keep-alives */ }
    }
  }
  recordAiCall({ stage, model: p.model, ms: Date.now() - t0, system, user, request: body, response: { streamedChars: full.length, content: full } });
  return { content: full, model: p.model, ms: Date.now() - t0 };
}

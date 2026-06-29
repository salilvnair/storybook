/**
 * Providers — faithful port of sidekick's LLM Provider settings (LlmPanel +
 * CustomPanel), using the same bs-llm-* / bs-custom-provider-* markup & CSS.
 * Data layer adapted to the storybook providers-store (sql.js + /api/providers).
 */
import React, { useState } from 'react';
import { useEffect } from 'react';
import { useProvidersStore } from '../../store/providers-store';
import { useSettingsStore } from '../../store/settings-store';
import { StyledSelect } from './StyledSelect';
import { ImageEngineSettings } from './ImageEngineSettings';
import { AudioEngineSettings } from './AudioEngineSettings';
import {
  LlmIcon, OpenAiProviderIcon, AnthropicProviderIcon, LmStudioProviderIcon, OllamaProviderIcon,
  DeepSeekProviderIcon, GrokProviderIcon, MistralProviderIcon, GeminiProviderIcon, QwenProviderIcon,
} from './provider-icons';

const PROVIDER_META: Record<string, { label: string; color: string; Icon: React.FC<{ size?: number }> }> = {
  openai: { label: 'OpenAI', color: '#10a37f', Icon: OpenAiProviderIcon },
  anthropic: { label: 'Anthropic', color: '#d97706', Icon: AnthropicProviderIcon },
  deepseek: { label: 'DeepSeek', color: '#4D6BFE', Icon: DeepSeekProviderIcon },
  gemini: { label: 'Gemini', color: '#3186FF', Icon: GeminiProviderIcon },
  grok: { label: 'Grok', color: '#a1a1aa', Icon: GrokProviderIcon },
  mistral: { label: 'Mistral', color: '#FF8205', Icon: MistralProviderIcon },
  qwen: { label: 'Qwen', color: '#9333ea', Icon: QwenProviderIcon },
  lmstudio: { label: 'LM Studio', color: '#8b5cf6', Icon: LmStudioProviderIcon },
  ollama: { label: 'Ollama', color: '#64748b', Icon: OllamaProviderIcon },
};

const TYPE_OPTIONS = [
  { id: 'openai', label: 'OpenAI', Icon: OpenAiProviderIcon },
  { id: 'anthropic', label: 'Anthropic', Icon: AnthropicProviderIcon },
  { id: 'gemini', label: 'Gemini', Icon: GeminiProviderIcon },
  { id: 'grok', label: 'Grok', Icon: GrokProviderIcon },
  { id: 'mistral', label: 'Mistral', Icon: MistralProviderIcon },
  { id: 'deepseek', label: 'DeepSeek', Icon: DeepSeekProviderIcon },
  { id: 'qwen', label: 'Qwen', Icon: QwenProviderIcon },
  { id: 'lmstudio', label: 'LM Studio', Icon: LmStudioProviderIcon },
  { id: 'ollama', label: 'Ollama', Icon: OllamaProviderIcon },
];

const DEFAULT_HOSTS: Record<string, string> = {
  openai: 'https://api.openai.com', anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com', grok: 'https://api.x.ai',
  mistral: 'https://api.mistral.ai', deepseek: 'https://api.deepseek.com',
  qwen: 'https://dashscope.aliyuncs.com', lmstudio: 'http://127.0.0.1:1234', ollama: 'http://localhost:11434',
};
const CHAT_PATH: Record<string, string> = {
  openai: '/v1/chat/completions', anthropic: '/v1/messages', gemini: '/v1beta/openai/chat/completions',
  grok: '/v1/chat/completions', mistral: '/v1/chat/completions', deepseek: '/v1/chat/completions',
  qwen: '/compatible-mode/v1/chat/completions', lmstudio: '/v1/chat/completions', ollama: '/api/chat',
};
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', anthropic: 'claude-sonnet-4-6', gemini: 'gemini-1.5-pro', grok: 'grok-2',
  mistral: 'mistral-large-latest', deepseek: 'deepseek-chat', qwen: 'qwen-max', lmstudio: 'local-model', ollama: 'llama3',
};
const chatUrlFor = (host: string, type: string) => host.replace(/\/$/, '') + (CHAT_PATH[type] || CHAT_PATH.openai);
const BLANK = { name: '', type: 'deepseek', host: DEFAULT_HOSTS.deepseek, chatUrl: chatUrlFor(DEFAULT_HOSTS.deepseek, 'deepseek'), model: DEFAULT_MODELS.deepseek, apiKey: '' };

export function Providers() {
  const { providers, loaded, load, add, update, remove, setActive } = useProvidersStore();
  const serverConfig = useSettingsStore((s) => s.serverConfig);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const active = providers.find((p) => p.isActive);
  const [selected, setSelected] = useState<string>('');
  const selKey = selected || active?.key || providers[0]?.key || '';
  const selProvider = providers.find((p) => p.key === selKey);
  const hasChanges = selKey && selKey !== active?.key;

  // Custom-provider form
  const [form, setForm] = useState({ ...BLANK });
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const openAdd = () => { setEditingKey(null); setForm({ ...BLANK }); setFormError(''); setShowForm(true); };
  const openEdit = (key: string) => {
    const p = providers.find((x) => x.key === key); if (!p) return;
    setEditingKey(key);
    setForm({ name: p.name, type: p.type, host: p.baseUrl.replace(CHAT_PATH[p.type] || '', ''), chatUrl: p.baseUrl, model: p.model, apiKey: '' });
    setFormError(''); setShowForm(true);
  };
  const cancelForm = () => { setShowForm(false); setEditingKey(null); setForm({ ...BLANK }); setFormError(''); };
  const saveForm = () => {
    if (!form.name.trim()) return setFormError('Provider name is required');
    if (!form.chatUrl.trim()) return setFormError('Chat URL is required');
    if (!form.model.trim()) return setFormError('Default model is required');
    const payload = { name: form.name.trim(), type: form.type as 'openai' | 'anthropic', baseUrl: form.chatUrl.trim(), model: form.model.trim(), apiKey: form.apiKey.trim() };
    if (editingKey) void update(editingKey, payload); else void add(payload);
    cancelForm();
  };

  return (
    <div className="story-tab-scroll">
      <div className="bs-settings-pane">
        {/* ── LLM Provider Configuration (LlmPanel) ── */}
        <div className="bs-llm-config">
          <div className="bs-settings-section-head"><LlmIcon className="bs-ico-sm" /><h3 className="bs-settings-h3">LLM Provider Configuration</h3></div>

          <div className="bs-llm-config-status">
            <div className="bs-llm-config-status-row">
              <span className="bs-llm-status-label">Available Providers</span>
              <div className="bs-llm-provider-picker">
                {providers.length === 0 && <span className="bs-llm-no-models">None yet — add one below.</span>}
                {providers.map((p) => {
                  const meta = PROVIDER_META[p.type] ?? { label: p.name, color: '#6366f1', Icon: () => null };
                  return (
                    <button key={p.key}
                      className={`bs-llm-provider-btn${selKey === p.key ? ' is-selected' : ''}${active?.key === p.key ? ' is-active-provider' : ''}`}
                      style={{ ['--provider-color' as string]: meta.color }}
                      onClick={() => setSelected(p.key)} title={p.name}>
                      <span className="bs-llm-provider-icon-wrap"><meta.Icon size={18} /></span>
                      <span className="bs-llm-provider-name">{p.name}</span>
                      <span className="bs-llm-provider-active-dot" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bs-llm-config-status-row">
              <span className="bs-llm-status-label">Active Provider</span>
              <span className="bs-llm-status-badge bs-llm-status-model">{active ? active.name : serverConfig?.llmModel ? 'server .env' : '--'}</span>
            </div>
            <div className="bs-llm-config-status-row">
              <span className="bs-llm-status-label">Default Model</span>
              <span className="bs-llm-status-badge bs-llm-status-model">{active?.model || serverConfig?.llmModel || '--'}</span>
            </div>
            <div className="bs-llm-config-status-row bs-llm-models-row">
              <span className="bs-llm-status-label">Available Models{selProvider && <span className="bs-llm-models-count">1</span>}</span>
              <div className="bs-llm-model-chips">
                {selProvider ? (
                  <span className={`bs-llm-model-chip bs-llm-model-chip-btn${active?.key === selProvider.key ? ' bs-llm-model-chip-active' : ' bs-llm-model-chip-pending'}`} title={selProvider.model}>{selProvider.model}</span>
                ) : (
                  <span className="bs-llm-no-models">Select a provider above.</span>
                )}
              </div>
            </div>

            {hasChanges && (
              <div className="bs-llm-config-actions">
                <button className="bs-btn-sm bs-btn-success" onClick={() => { void setActive(selKey); }}>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
                  Save as Default
                </button>
                <button className="bs-btn-sm bs-btn-secondary" onClick={() => setSelected(active?.key || '')}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Custom LLM Providers (CustomPanel) ── */}
        <div className="bs-settings-pane bs-custom-provider-pane">
          <div className="bs-settings-section-head">
            <LlmIcon className="bs-ico-sm" /><h3 className="bs-settings-h3">Custom LLM Providers</h3>
            <button className="bs-btn-sm bs-btn-secondary bs-custom-provider-add-btn" onClick={showForm ? cancelForm : openAdd}>{showForm ? '✕ Cancel' : '+ Add Provider'}</button>
          </div>

          {showForm && (
            <div className="bs-custom-provider-form">
              <div className="bs-custom-provider-form-title">{editingKey ? 'Edit Provider' : 'Add New Provider'}</div>
              <div className="bs-custom-provider-form-grid">
                <label className="bs-custom-provider-label">Provider Name
                  <input className="bs-custom-provider-input" placeholder="My DeepSeek" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="bs-custom-provider-label">Type
                  <StyledSelect value={form.type} options={TYPE_OPTIONS.map((o) => ({ id: o.id, label: o.label, icon: <o.Icon size={15} /> }))}
                    onChange={(id) => setForm((f) => ({ ...f, type: id, host: DEFAULT_HOSTS[id] || f.host, chatUrl: chatUrlFor(DEFAULT_HOSTS[id] || f.host, id), model: DEFAULT_MODELS[id] || f.model }))} />
                </label>
                <label className="bs-custom-provider-label bs-span2">Host
                  <input className="bs-custom-provider-input" placeholder={DEFAULT_HOSTS[form.type]} value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value, chatUrl: chatUrlFor(e.target.value, f.type) }))} />
                </label>
                <label className="bs-custom-provider-label bs-span2">Chat URL
                  <input className="bs-custom-provider-input" value={form.chatUrl} onChange={(e) => setForm((f) => ({ ...f, chatUrl: e.target.value }))} />
                </label>
                <label className="bs-custom-provider-label">Default Model
                  <input className="bs-custom-provider-input" placeholder={DEFAULT_MODELS[form.type]} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                </label>
                <label className="bs-custom-provider-label">API Key
                  <input className="bs-custom-provider-input" type="password" autoComplete="off" placeholder={editingKey ? 'Leave blank to keep existing' : 'sk-…'} value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} />
                </label>
              </div>
              {formError && <div className="bs-custom-provider-form-error">{formError}</div>}
              <div className="bs-custom-provider-form-actions">
                <button className="bs-btn-sm bs-btn-success" onClick={saveForm}>{editingKey ? 'Update Provider' : 'Save Provider'}</button>
              </div>
            </div>
          )}

          {providers.length === 0 ? (
            <div className="bs-custom-provider-empty">No custom providers added yet.</div>
          ) : (
            <ul className="bs-custom-provider-list">
              {providers.map((p) => (
                <li key={p.key} className="bs-custom-provider-item">
                  <div className="bs-custom-provider-item-info">
                    <span className="bs-custom-provider-name">{p.name}</span>
                    <span className="bs-custom-provider-type-badge">{PROVIDER_META[p.type]?.label ?? p.type}</span>
                    <span className="bs-custom-provider-model-count">{p.model}</span>
                  </div>
                  <div className="bs-custom-provider-item-actions">
                    <button className="bs-btn-sm bs-btn-secondary" onClick={() => void setActive(p.key)} disabled={p.isActive}>{p.isActive ? '✓ Active' : 'Set Active'}</button>
                    <button className="bs-btn-sm bs-btn-secondary" onClick={() => openEdit(p.key)}>✎ Edit</button>
                    <button className="bs-btn-sm bs-btn-secondary bs-btn-secondary--danger" onClick={() => void remove(p.key)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Image generation engine (Ideogram 4 / Z-Image Turbo / …) ── */}
        <ImageEngineSettings />

        {/* ── Audio / TTS engine (Kokoro TTS / …) ── */}
        <AudioEngineSettings />
      </div>
    </div>
  );
}

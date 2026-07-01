/**
 * Provider SDK panel — S29.
 * Shows all registered providers (built-in + custom) grouped by capability,
 * with health indicators, active selection, fallback chain config,
 * and a "Add custom provider" JSON-schema form.
 */
import { useState, useEffect } from 'react';
import { ButtonView, TextInputView, SelectInputView } from '@salilvnair/dui';
import { useCustomProvidersStore, type CustomProviderSchema } from '../../store/custom-providers-store';
import { SettingsPanelHeader } from './SettingsPanelHeader';

const CAPABILITIES = ['llm', 'image', 'tts', 'music', 'stt', 'translate', 'moderation'];

const CAP_LABELS: Record<string, string> = {
  llm: 'Chat / LLM', image: 'Image Generation', tts: 'Text-to-Speech',
  music: 'Music', stt: 'Speech-to-Text', translate: 'Translation', moderation: 'Moderation',
};

interface ProviderSummary {
  id: string; label: string; capability: string; blurb?: string; accent?: string; custom?: boolean;
}

const BLANK_SCHEMA: CustomProviderSchema = {
  id: '', label: '', capability: 'image', url: '',
  blurb: '', accent: '#64748b',
  invokeEndpoint: '/generate', invokeMethod: 'POST',
  healthEndpoint: '/health', responseField: 'result',
};

export function ProviderSDK() {
  const { schemas, health, activeProviders, fallbackChains, loaded, load, register, remove, checkHealth, setActive } = useCustomProvidersStore();
  const [allProviders, setAllProviders] = useState<Record<string, ProviderSummary[]>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<CustomProviderSchema>({ ...BLANK_SCHEMA });
  const [addError, setAddError] = useState('');
  const [loading, setLoading] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonSchema, setJsonSchema] = useState('');
  const [localDetect, setLocalDetect] = useState<unknown[]>([]);
  const [detectLoading, setDetectLoading] = useState(false);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  useEffect(() => {
    fetch('/api/providers/sdk')
      .then((r) => r.json())
      .then((d) => setAllProviders(d.grouped || {}))
      .catch(() => {});
  }, [schemas]);

  useEffect(() => { checkHealth(); }, []);

  const healthDot = (id: string) => {
    const h = health[id];
    if (!h) return <span style={{ color: '#64748b', fontSize: 11 }}>?</span>;
    return <span style={{ fontSize: 11 }}>{h.ok ? '🟢' : '🔴'}</span>;
  };

  async function handleAdd() {
    setAddError('');
    setLoading(true);
    try {
      let schema = form;
      if (jsonMode) {
        try { schema = JSON.parse(jsonSchema); } catch { setAddError('Invalid JSON'); setLoading(false); return; }
      }
      if (!schema.id || !schema.label || !schema.url) { setAddError('ID, label, and URL are required'); setLoading(false); return; }
      await register(schema);
      setShowAdd(false);
      setForm({ ...BLANK_SCHEMA });
      setJsonSchema('');
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function detectLocal() {
    setDetectLoading(true);
    const res = await fetch('/api/providers/sdk/detect-local', { method: 'POST' }).then((r) => r.json()).catch(() => ({ detected: [] }));
    setLocalDetect(res.detected || []);
    setDetectLoading(false);
  }

  return (
    <div className="story-tab-scroll" style={{ height: '100%' }}>
      <div style={{ padding: '0 4px' }}>
        <SettingsPanelHeader icon="🔌" title="Universal Provider SDK" subtitle="Swap any model for any capability. One contract for everything." action={<><ButtonView size="sm" variant="ghost" onClick={() => checkHealth()}>↻ Refresh</ButtonView><ButtonView size="sm" variant="ghost" onClick={detectLocal} disabled={detectLoading}>{detectLoading ? 'Detecting…' : '🔍 Detect Local'}</ButtonView><ButtonView size="sm" onClick={() => setShowAdd(!showAdd)}>+ Add Provider</ButtonView></>} />

        {/* Local detection results */}
        {localDetect.length > 0 && (
          <div style={{ background: 'var(--story-surface-2)', border: '1px solid var(--story-border)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>🔍 Detected local engines</div>
            {(localDetect as Array<{ label: string; url: string; capability: string; engine: string }>).map((d) => (
              <div key={d.url} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#22d3ee', flex: 1 }}>{d.label} — {d.url}</span>
                <ButtonView size="sm" variant="ghost" onClick={async () => {
                  await register({ id: d.engine, label: d.label, capability: d.capability as CustomProviderSchema['capability'], url: d.url });
                }}>Use</ButtonView>
              </div>
            ))}
          </div>
        )}

        {/* Add provider form */}
        {showAdd && (
          <div style={{ background: 'var(--story-surface-2)', border: '1px solid var(--story-accent)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Add Custom Provider</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <ButtonView size="sm" variant={!jsonMode ? 'solid' : 'ghost'} onClick={() => setJsonMode(false)}>Form</ButtonView>
              <ButtonView size="sm" variant={jsonMode ? 'solid' : 'ghost'} onClick={() => setJsonMode(true)}>JSON Schema</ButtonView>
            </div>
            {jsonMode ? (
              <div>
                <div style={{ fontSize: 12, color: 'var(--story-text-muted)', marginBottom: 8 }}>Paste a JSON schema (OpenAPI-style or our provider schema)</div>
                <textarea
                  value={jsonSchema}
                  onChange={(e) => setJsonSchema(e.target.value)}
                  placeholder={'{\n  "id": "my-provider",\n  "label": "My Provider",\n  "capability": "image",\n  "url": "http://localhost:7860",\n  "invokeEndpoint": "/generate",\n  "healthEndpoint": "/health"\n}'}
                  style={{ width: '100%', height: 160, fontFamily: 'monospace', fontSize: 12, background: 'var(--story-surface)', border: '1px solid var(--story-border)', borderRadius: 6, padding: 8, color: 'var(--story-text)', resize: 'vertical' }}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([['id', 'Provider ID'], ['label', 'Display Name'], ['url', 'Base URL'], ['blurb', 'Description']] as [keyof CustomProviderSchema, string][]).map(([k, label]) => (
                  <div key={k} style={{ gridColumn: k === 'url' || k === 'blurb' ? '1 / -1' : undefined }}>
                    <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginBottom: 4 }}>{label}</div>
                    <TextInputView value={String(form[k] || '')} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} placeholder={label} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginBottom: 4 }}>Capability</div>
                  <SelectInputView
                    value={form.capability}
                    options={CAPABILITIES.map((c) => ({ value: c, label: CAP_LABELS[c] || c }))}
                    onChange={(v) => setForm((f) => ({ ...f, capability: v as CustomProviderSchema['capability'] }))}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginBottom: 4 }}>Invoke Endpoint</div>
                  <TextInputView value={form.invokeEndpoint || '/generate'} onChange={(v) => setForm((f) => ({ ...f, invokeEndpoint: v }))} />
                </div>
              </div>
            )}
            {addError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{addError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <ButtonView size="sm" onClick={handleAdd} disabled={loading}>{loading ? 'Adding…' : 'Add Provider'}</ButtonView>
              <ButtonView size="sm" variant="ghost" onClick={() => { setShowAdd(false); setAddError(''); }}>Cancel</ButtonView>
            </div>
          </div>
        )}

        {/* Providers by capability */}
        {CAPABILITIES.map((cap) => {
          const providers = allProviders[cap] || [];
          if (!providers.length) return null;
          return (
            <div key={cap} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--story-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{CAP_LABELS[cap]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {providers.map((p) => {
                  const isActive = activeProviders[cap] === p.id;
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: isActive ? 'color-mix(in srgb, var(--story-accent) 12%, var(--story-surface-2))' : 'var(--story-surface-2)', border: `1px solid ${isActive ? 'var(--story-accent)' : 'var(--story-border)'}`, borderRadius: 8, cursor: 'pointer' }}
                      onClick={() => setActive(cap, p.id)}>
                      {p.accent && <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.accent, flexShrink: 0 }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--story-text)' }}>{p.label}</div>
                        {p.blurb && <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginTop: 2 }}>{p.blurb.slice(0, 80)}{p.blurb.length > 80 ? '…' : ''}</div>}
                      </div>
                      {healthDot(p.id)}
                      {p.custom && (
                        <ButtonView size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(p.id.replace('custom::', '')); }}>✕</ButtonView>
                      )}
                      {isActive && <span style={{ fontSize: 11, color: 'var(--story-accent)', fontWeight: 600 }}>ACTIVE</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

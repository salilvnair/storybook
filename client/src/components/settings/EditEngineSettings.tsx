/**
 * EditEngineSettings (S-E2) — pick the image-EDIT (inpaint) engine and point it
 * at a URL. Mirrors ImageEngineSettings: choose FLUX.1-Fill-dev (more later),
 * give it a local Mac URL OR a RunPod proxy URL, tune steps / guidance / seed.
 * Everything persists and drives the 🖌 AI Edit panel's real inpaint.
 */
import { useEffect } from 'react';
import { SelectInputView, TextInputView, ChipView, type SelectOption } from '@salilvnair/dui';
import { useEditEngineStore } from '../../store/edit-engine-store';
import { SaveButton } from '../SaveButton';
import { SettingsPanelHeader } from './SettingsPanelHeader';

export function EditEngineSettings() {
  const { engines, config, loaded, health, init, setEngine, setUrl, setOption, save, current } = useEditEngineStore();

  useEffect(() => { if (!loaded) void init(); }, [loaded, init]);

  const eng = current();
  const opts = eng?.options;
  const engineOptions: SelectOption[] = engines.map((e) => ({ value: e.id, label: e.label }));
  const url = config.urls[config.engine] || '';
  const isCloud = eng?.noUrl ?? false;

  const numField = (
    key: 'steps' | 'guidance' | 'seed',
    label: string,
    desc: string,
    placeholder: string,
  ) => (
    <label className="ie-opt-row ie-opt-inline">
      <div className="ie-opt-text"><div className="ie-opt-label">{label}</div><div className="ie-opt-desc">{desc}</div></div>
      <TextInputView
        value={config.options[key] == null ? '' : String(config.options[key])}
        size="sm"
        placeholder={placeholder}
        onChange={(e) => {
          const raw = (e.target as HTMLInputElement).value.trim();
          setOption(key, raw === '' ? null : Number(raw));
        }}
      />
    </label>
  );

  return (
    <div className="bs-settings-pane ie-pane">
      <SettingsPanelHeader
        icon="🖌️"
        title="Image Editing Engine"
        subtitle="Powers the AI Edit panel — mask-guided inpaint & edit. Cloud (OpenAI/OpenRouter) or local GPU."
        action={eng && <ChipView size="sm" color={eng.accent} label={eng.label} />}
      />

      {/* Engine picker */}
      <label className="bs-custom-provider-label bs-span2 ie-field" style={{ maxWidth: 420 }}>
        Engine
        <SelectInputView options={engineOptions} value={config.engine} onChange={(v) => setEngine(v)} size="md" width="fw" />
      </label>

      {/* Info card */}
      {eng && (
        <div className="ie-card" style={{ ['--ie-accent' as string]: eng.accent }}>
          <div className="ie-card-head">
            <span className="ie-card-dot" style={{ background: eng.accent }} />
            <span className="ie-card-title">{eng.label}</span>
            <div className="ie-card-tags">
              {isCloud && <ChipView size="xs" color="#10b981" label="cloud API" />}
              {opts?.model && <ChipView size="xs" color="#8b5cf6" label="model picker" />}
              {opts?.steps && <ChipView size="xs" color="#22d3ee" label="steps" />}
              {opts?.guidance && <ChipView size="xs" color="#fbbf24" label="guidance" />}
              {opts?.seed && <ChipView size="xs" color="#a855f7" label="seed" />}
              {!isCloud && <ChipView size="xs" color="#ec4899" label="mask inpaint" />}
            </div>
          </div>
          <p className="ie-card-blurb">{eng.blurb}</p>
          {!isCloud && (
            <p className="ie-card-hint">
              Point this at <b>your own machine</b> (e.g. <code>http://localhost:8074</code>) or a <b>RunPod</b> proxy
              URL. The AI Edit panel brushes a mask and this engine repaints only that region.
            </p>
          )}
        </div>
      )}

      {/* Cloud engines: API key field; local engines: URL field */}
      {isCloud ? (
        <label className="bs-custom-provider-label bs-span2 ie-field">
          {eng?.label} API Key
          <TextInputView
            value={url}
            width="fw"
            size="md"
            type="password"
            placeholder={eng?.id === 'openrouter-edit'
              ? 'sk-or-… (or set OPENROUTER_API_KEY in .env)'
              : 'sk-… (or set OPENAI_API_KEY in .env)'}
            onChange={(e) => setUrl(config.engine, (e.target as HTMLInputElement).value)}
          />
          <span className="ie-key-hint">Key is stored locally and sent only to {eng?.label}. Leave blank to use the env var.</span>
        </label>
      ) : (
        <label className="bs-custom-provider-label bs-span2 ie-field">
          {eng ? `${eng.label} URL` : 'Engine URL'}
          <TextInputView
            value={url}
            width="fw"
            size="md"
            placeholder="http://localhost:8074  ·  or  https://xxxxx-8074.proxy.runpod.net"
            onChange={(e) => setUrl(config.engine, (e.target as HTMLInputElement).value)}
          />
        </label>
      )}

      {/* Per-engine options */}
      {eng && (
        <div className="ie-opts">
          {opts?.model && eng.models.length > 0 && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text">
                <div className="ie-opt-label">Model</div>
                <div className="ie-opt-desc">Which model to use for editing. Cheapest model is the default.</div>
              </div>
              <SelectInputView
                options={[
                  { value: '', label: `Default (${eng.model})` },
                  ...eng.models.map((m) => ({ value: m, label: m.includes('/') ? m : m.toUpperCase() })),
                ]}
                value={config.options.model || ''}
                onChange={(v) => setOption('model', v)}
                size="sm"
              />
            </label>
          )}
          {opts?.steps && numField('steps', 'Steps', `Denoising steps (default ${eng.defaults.steps ?? 30}). Higher = sharper, slower.`, String(eng.defaults.steps ?? 30))}
          {opts?.guidance && numField('guidance', 'Guidance', `How strongly the edit follows the prompt (default ${eng.defaults.guidance ?? 30}).`, String(eng.defaults.guidance ?? 30))}
          {opts?.seed && numField('seed', 'Seed', 'Fix a seed for reproducible edits. Leave blank for random.', 'random')}
        </div>
      )}

      {/* Save + health */}
      <div className="ie-save-row">
        <span className="ie-save-hint">
          {isCloud
            ? (url ? `Active: ${eng?.label} (API key set)` : `No API key — set it above or add the env var to .env`)
            : url
              ? `${health.configured ? (health.ok ? '🟢 reachable' : '🔴 unreachable') : ''} Active: ${eng?.label} → ${url}`
              : 'No URL set — edits run in stub mode.'}
        </span>
        <SaveButton onSave={save} label="Save edit engine" />
      </div>
    </div>
  );
}

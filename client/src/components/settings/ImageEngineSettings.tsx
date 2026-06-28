/**
 * ImageEngineSettings — pick the image-generation engine and point it at a URL.
 *
 * Storybook is engine-agnostic: choose Ideogram 4 or Z-Image Turbo (more later),
 * give it a URL (a local Mac URL OR a RunPod proxy URL), and toggle the options
 * that engine actually supports. Everything persists and drives generation.
 */
import { useEffect } from 'react';
import { SelectInputView, TextInputView, ToggleSwitchView, ChipView, type SelectOption } from '@salilvnair/dui';
import { useImageEngineStore } from '../../store/image-engine-store';
import { SaveButton } from '../SaveButton';

export function ImageEngineSettings() {
  const { engines, config, loaded, init, setEngine, setUrl, setOption, save, current } = useImageEngineStore();

  useEffect(() => { if (!loaded) void init(); }, [loaded, init]);

  const eng = current();
  const opts = eng?.options;
  const engineOptions: SelectOption[] = engines.map((e) => ({ value: e.id, label: e.label }));
  const url = config.urls[config.engine] || '';

  return (
    <div className="bs-settings-pane bs-custom-provider-pane ie-pane">
      <div className="bs-settings-section-head">
        <span style={{ fontSize: 15 }}>🖼️</span>
        <h3 className="bs-settings-h3">Image Generation Engine</h3>
        {eng && <ChipView size="sm" color={eng.accent} label={eng.label} />}
      </div>

      {/* Engine picker */}
      <label className="bs-custom-provider-label bs-span2 ie-field" style={{ maxWidth: 420 }}>
        Engine
        <SelectInputView
          options={engineOptions}
          value={config.engine}
          onChange={(v) => setEngine(v)}
          size="md"
          width="fw"
        />
      </label>

      {/* Info card */}
      {eng && (
        <div className="ie-card" style={{ ['--ie-accent' as string]: eng.accent }}>
          <div className="ie-card-head">
            <span className="ie-card-dot" style={{ background: eng.accent }} />
            <span className="ie-card-title">{eng.label}</span>
            <div className="ie-card-tags">
              {opts?.magic && <ChipView size="xs" color="#a855f7" label="magic prompt" />}
              {opts?.steps && <ChipView size="xs" color="#22d3ee" label="steps" />}
              {opts?.negativePrompt && <ChipView size="xs" color="#f472b6" label="negative prompt" />}
              {opts?.preset && <ChipView size="xs" color="#fbbf24" label="presets" />}
            </div>
          </div>
          <p className="ie-card-blurb">{eng.blurb}</p>
          <p className="ie-card-hint">
            💡 Point this at <b>your own machine</b> (e.g. <code>http://localhost:8080</code> on your Mac/Mac&nbsp;Studio)
            or a <b>RunPod</b> proxy URL. Storybook calls the engine's API — it never runs the model itself.
          </p>
        </div>
      )}

      {/* Dynamic URL field — label follows the selected engine */}
      <label className="bs-custom-provider-label bs-span2 ie-field">
        {eng ? `${eng.label} URL` : 'Engine URL'}
        <TextInputView
          value={url}
          width="fw"
          size="md"
          placeholder="http://localhost:8080  ·  or  https://xxxxx-8080.proxy.runpod.net"
          onChange={(e) => setUrl(config.engine, (e.target as HTMLInputElement).value)}
        />
      </label>

      {/* Per-engine options — only what this engine supports */}
      {eng && (
        <div className="ie-opts">
          {opts?.magic && (
            <div className="ie-opt-row">
              <div className="ie-opt-text"><div className="ie-opt-label">Magic prompt</div><div className="ie-opt-desc">Let {eng.label} rewrite each prompt into richer art direction.</div></div>
              <ToggleSwitchView checked={config.options.magic} onChange={(v) => setOption('magic', v)} size="md" accentColor={eng.accent} />
            </div>
          )}
          {opts?.model && eng.models.length > 0 && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text"><div className="ie-opt-label">Model variant</div><div className="ie-opt-desc">Which model size to use.</div></div>
              <SelectInputView
                options={[{ value: '', label: 'Auto (server default)' }, ...eng.models.map((m) => ({ value: m, label: m.toUpperCase() }))]}
                value={config.options.model || ''}
                onChange={(v) => setOption('model', v)}
                size="sm"
              />
            </label>
          )}
          {opts?.preset && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text"><div className="ie-opt-label">Preset</div><div className="ie-opt-desc">Speed / quality trade-off.</div></div>
              <SelectInputView
                options={eng.presets.map((p) => ({ value: p, label: p }))}
                value={config.options.preset}
                onChange={(v) => setOption('preset', v)}
                size="sm"
              />
            </label>
          )}
          {opts?.negativePrompt && (
            <label className="ie-opt-row ie-opt-stack">
              <div className="ie-opt-text"><div className="ie-opt-label">Negative prompt</div><div className="ie-opt-desc">Things to avoid in the image.</div></div>
              <TextInputView value={config.options.negativePrompt} size="sm" width="fw"
                placeholder="blurry, text, watermark…"
                onChange={(e) => setOption('negativePrompt', (e.target as HTMLInputElement).value)} />
            </label>
          )}
        </div>
      )}

      {/* Explicit save — settings auto-apply, but the button confirms + re-syncs the engine to the server. */}
      <div className="ie-save-row">
        <SaveButton onSave={save} label="Save engine settings" />
        <span className="ie-save-hint">{url ? `Active: ${eng?.label} → ${url}` : 'Set a URL above (local Mac or RunPod) to enable generation.'}</span>
      </div>
    </div>
  );
}

/**
 * AudioEngineSettings — pick the TTS engine and point it at a URL.
 *
 * Mirrors ImageEngineSettings exactly: engine selector, URL field,
 * per-engine options (voice, speed, format), SaveButton + health dot.
 */
import { useEffect } from 'react';
import { SelectInputView, TextInputView, ChipView, type SelectOption } from '@salilvnair/dui';
import { useAudioEngineStore } from '../../store/audio-engine-store';
import { useVoicesStore } from '../../store/voices-store';
import { SaveButton } from '../SaveButton';
import { SettingsPanelHeader } from './SettingsPanelHeader';

export function AudioEngineSettings() {
  const { engines, config, loaded, init, setEngine, setUrl, setOption, save, current } = useAudioEngineStore();

  useEffect(() => { if (!loaded) void init(); }, [loaded, init]);

  const { voices, loaded: voicesLoaded, load: loadVoices } = useVoicesStore();
  useEffect(() => { if (!voicesLoaded) void loadVoices(); }, [voicesLoaded, loadVoices]);

  const eng = current();
  const opts = eng?.options;
  const engineOptions: SelectOption[] = engines.map((e) => ({ value: e.id, label: e.label }));
  const cloned = voices.filter((v) => !eng || v.engineId === config.engine);
  const voiceOptions: SelectOption[] = [
    { value: '', label: 'Engine default' },
    ...(eng?.voices || []).map((v) => ({ value: v, label: v })),
    ...(cloned.length > 0 ? [{ value: '__cloned__', label: 'Cloned voices', isHeader: true } as SelectOption] : []),
    ...cloned.map((v) => ({ value: v.cloneVoiceId, label: `⭐ ${v.label}` })),
  ];
  const formatOptions: SelectOption[] = (eng?.formats || ['wav']).map((f) => ({ value: f, label: f.toUpperCase() }));

  return (
    <div className="bs-settings-pane ie-pane">
      <SettingsPanelHeader icon="🔊" title="Voice Engine" subtitle="Configure your TTS server for read-aloud narration." action={eng && <ChipView size="sm" color={eng.accent} label={eng.label} />} />

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
              {eng.capabilities?.includes('instruction-following') && <ChipView size="xs" color="#7c3aed" label="instruction-following" />}
              {eng.capabilities?.includes('voice-clone') && <ChipView size="xs" color="#f97316" label="voice cloning" />}
              {opts?.voice && <ChipView size="xs" color="#a855f7" label="voice" />}
              {opts?.speed && <ChipView size="xs" color="#22d3ee" label="speed" />}
              {opts?.format && <ChipView size="xs" color="#fbbf24" label="format" />}
            </div>
          </div>
          <p className="ie-card-blurb">{eng.blurb}</p>
          <p className="ie-card-hint">
            💡 Point this at <b>your own machine</b> (e.g. <code>http://localhost:8880</code> running your local TTS server)
            or a <b>RunPod</b> proxy URL. iStorybook calls the TTS API — it never runs the model itself.
          </p>
        </div>
      )}

      {/* URL field */}
      <label className="bs-custom-provider-label bs-span2 ie-field">
        {eng ? `${eng.label} URL` : 'Engine URL'}
        <TextInputView
          value={config.url}
          width="fw"
          size="md"
          placeholder="http://localhost:8880  ·  or  https://xxxxx-8880.proxy.runpod.net"
          onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
        />
      </label>

      {/* Per-engine options */}
      {eng && (
        <div className="ie-opts">
          {opts?.voice && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text">
                <div className="ie-opt-label">Voice</div>
                <div className="ie-opt-desc">Narrator voice for read-aloud narration.</div>
              </div>
              <SelectInputView
                options={voiceOptions}
                value={config.options.voice}
                onChange={(v) => setOption('voice', v)}
                size="sm"
              />
            </label>
          )}
          {opts?.speed && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text">
                <div className="ie-opt-label">Speed</div>
                <div className="ie-opt-desc">Narration playback speed (0.5 – 2.0).</div>
              </div>
              <TextInputView
                value={String(config.options.speed)}
                size="sm"
                type="number"
                placeholder="1.0"
                style={{ width: 72 }}
                onChange={(e) => setOption('speed', parseFloat((e.target as HTMLInputElement).value) || 1.0)}
              />
            </label>
          )}
          {opts?.format && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text">
                <div className="ie-opt-label">Format</div>
                <div className="ie-opt-desc">Audio output format.</div>
              </div>
              <SelectInputView
                options={formatOptions}
                value={config.options.format}
                onChange={(v) => setOption('format', v)}
                size="sm"
              />
            </label>
          )}
        </div>
      )}

      <div className="ie-save-row">
        <span className="ie-save-hint">
          {config.url
            ? `Active: ${eng?.label} → ${config.url}`
            : 'Set a URL above (local Mac or RunPod) to enable read-aloud narration.'}
        </span>
        <SaveButton onSave={save} label="Save audio settings" />
      </div>
    </div>
  );
}

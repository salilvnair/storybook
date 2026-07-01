/**
 * MusicEngineSettings — pick music generation engine (MusicGen / AudioLDM2)
 * and configure URL + options (duration, format). Mirrors AudioEngineSettings.
 */
import { useEffect } from 'react';
import { SelectInputView, TextInputView, ChipView, type SelectOption } from '@salilvnair/dui';
import { useMusicEngineStore } from '../../store/music-engine-store';
import { SaveButton } from '../SaveButton';
import { SettingsPanelHeader } from './SettingsPanelHeader';

export function MusicEngineSettings() {
  const { engines, config, loaded, init, setEngine, setUrl, setOption, save, current } = useMusicEngineStore();

  useEffect(() => { if (!loaded) void init(); }, [loaded, init]);

  const eng = current();
  const opts = eng?.options;
  const engineOptions: SelectOption[] = engines.map((e) => ({ value: e.id, label: e.label }));
  const formatOptions: SelectOption[] = (eng?.formats || ['wav']).map((f) => ({ value: f, label: f.toUpperCase() }));

  return (
    <div className="story-tab-scroll">
    <div className="bs-settings-pane ie-pane" style={{ padding: '0 4px' }}>
      <SettingsPanelHeader icon="🎵" title="Music Engine" subtitle="Connect a background music generation service for atmosphere." action={eng && <ChipView size="sm" color={eng.accent} label={eng.label} />} />

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

      {eng && (
        <div className="ie-card" style={{ ['--ie-accent' as string]: eng.accent }}>
          <div className="ie-card-head">
            <span className="ie-card-dot" style={{ background: eng.accent }} />
            <span className="ie-card-title">{eng.label}</span>
            <div className="ie-card-tags">
              {eng.capabilities?.includes('music') && <ChipView size="xs" color="#7c3aed" label="music" />}
              {eng.capabilities?.includes('sfx') && <ChipView size="xs" color="#f97316" label="SFX" />}
              {eng.capabilities?.includes('background-score') && <ChipView size="xs" color="#22d3ee" label="background score" />}
              {opts?.duration && <ChipView size="xs" color="#a855f7" label="duration" />}
              {opts?.format && <ChipView size="xs" color="#fbbf24" label="format" />}
            </div>
          </div>
          <p className="ie-card-blurb">{eng.label} — AI music generation for storybook background scores.</p>
          <p className="ie-card-hint">
            💡 Point this at <b>your own machine</b> running MusicGen or AudioLDM2, or a <b>RunPod</b> proxy URL.
          </p>
        </div>
      )}

      <label className="bs-custom-provider-label bs-span2 ie-field">
        {eng ? `${eng.label} URL` : 'Engine URL'}
        <TextInputView
          value={config.url}
          width="fw"
          size="md"
          placeholder="http://localhost:8990  ·  or  https://xxxxx-8990.proxy.runpod.net"
          onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
        />
      </label>

      {eng && (
        <div className="ie-opts">
          {opts?.duration && (
            <label className="ie-opt-row ie-opt-inline">
              <div className="ie-opt-text">
                <div className="ie-opt-label">Duration (s)</div>
                <div className="ie-opt-desc">Length of generated background score in seconds.</div>
              </div>
              <TextInputView
                value={String(config.options.duration)}
                size="sm"
                type="number"
                placeholder="30"
                onChange={(e) => setOption('duration', parseInt((e.target as HTMLInputElement).value, 10) || 30)}
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
            : 'Set a URL above to enable AI background music generation.'}
        </span>
        <SaveButton onSave={save} label="Save music settings" />
      </div>
    </div>
    </div>
  );
}

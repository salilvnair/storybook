/**
 * VoiceLibrary — manage cloned voice profiles for read-aloud narration.
 * Upload a reference audio sample (≥5 s) → engine clones it → stored locally.
 * Assign a cloned voice to any character in Character Studio.
 */
import { useEffect, useRef, useState } from 'react';
import { ButtonView, TextInputView, ToggleSwitchView, ChipView } from '@salilvnair/dui';
import { useVoicesStore } from '../../store/voices-store';
import { useAudioEngineStore } from '../../store/audio-engine-store';
import { MicIcon, TrashIcon } from '../../icons';

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export function VoiceLibrary() {
  const { voices, loaded, load, add, remove } = useVoicesStore();
  const { config: audioConfig, engines } = useAudioEngineStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [label, setLabel] = useState('');
  const [refText, setRefText] = useState('');
  const [sampleB64, setSampleB64] = useState('');
  const [sampleName, setSampleName] = useState('');
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');
  const [cloneOk, setCloneOk] = useState('');

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const engineLabel = engines.find((e) => e.id === audioConfig.engine)?.label ?? audioConfig.engine;
  const canClone = engines.find((e) => e.id === audioConfig.engine)?.capabilities?.includes('voice-clone');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSampleName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = (ev.target?.result as string) ?? '';
      // Strip data URL prefix if present
      const b64 = raw.includes(',') ? raw.split(',')[1] : raw;
      setSampleB64(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleClone = async () => {
    if (!label.trim()) { setCloneError('Enter a name for this voice.'); return; }
    if (!sampleB64) { setCloneError('Upload a reference audio sample first.'); return; }
    if (!consent) { setCloneError('You must consent before cloning a voice.'); return; }
    if (!audioConfig.url) { setCloneError('No TTS engine URL configured. Set one in Settings → Voice Engine.'); return; }
    setCloning(true); setCloneError(''); setCloneOk('');
    try {
      const res = await fetch('/api/voice/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), sample_b64: sampleB64, ref_text: refText.trim() || undefined, consent_given: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clone failed');
      await add({ label: label.trim(), engineId: data.engine_id || audioConfig.engine, cloneVoiceId: data.clone_voice_id, consentAt: new Date().toISOString() });
      setCloneOk(`Voice "${label.trim()}" cloned successfully.`);
      setLabel(''); setRefText(''); setSampleB64(''); setSampleName(''); setConsent(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="story-tab-scroll">
      <div className="bs-settings-pane bs-custom-provider-pane ie-pane">
        <div className="bs-settings-section-head">
          <MicIcon size={15} style={{ color: '#a78bfa' }} />
          <h3 className="bs-settings-h3">Voice Library</h3>
          {canClone
            ? <ChipView size="sm" color="#a78bfa" label="voice cloning supported" />
            : <ChipView size="sm" color="#64748b" label={`${engineLabel} — no cloning`} />}
        </div>
        <p className="story-settings-lead" style={{ marginTop: 4 }}>
          Clone a voice from a short audio sample (≥5 s). The sample is sent only to your local
          TTS engine — it is never stored on disk by iStorybook. Assign cloned voices to characters
          in <b>Settings → Characters</b>.
        </p>

        {/* ── Cloned voice list ── */}
        {voices.length > 0 && (
          <div className="ie-opts" style={{ marginBottom: 12 }}>
            {voices.map((v) => (
              <div key={v.id} className="ie-opt-row ie-opt-inline">
                <div className="ie-opt-text">
                  <div className="ie-opt-label">🎙 {v.label}</div>
                  <div className="ie-opt-desc">{v.engineId} · cloned {formatDate(v.createdAt)} · id: <code style={{ fontSize: 10 }}>{v.cloneVoiceId.slice(0, 20)}…</code></div>
                </div>
                <ButtonView size="sm" accentColor="#f87171" iconLeft={<TrashIcon size={12} />}
                  onClick={() => void remove(v.id)}>
                  Delete
                </ButtonView>
              </div>
            ))}
          </div>
        )}
        {voices.length === 0 && (
          <div style={{ padding: '12px 0', color: 'var(--color-text-muted)', fontSize: 12 }}>
            No cloned voices yet. Add one below.
          </div>
        )}

        {/* ── Add voice form ── */}
        <div style={{ borderTop: '1px solid var(--story-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="bs-settings-section-head" style={{ marginBottom: 0 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Clone a new voice</h4>
          </div>

          <label className="bs-custom-provider-label ie-field">
            Voice label
            <TextInputView value={label} size="md" width="fw" placeholder="e.g. Grandma, Dad, Friendly Narrator"
              onChange={(e) => setLabel((e.target as HTMLInputElement).value)} />
          </label>

          <label className="bs-custom-provider-label ie-field">
            Reference audio sample
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <ButtonView size="sm" onClick={() => fileRef.current?.click()}>
                {sampleB64 ? '🔄 Change file' : '📎 Upload audio'}
              </ButtonView>
              {sampleName && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{sampleName}</span>}
              <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFile} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              WAV / MP3 / M4A, ≥5 s of clear speech, minimal background noise.
            </span>
          </label>

          <label className="bs-custom-provider-label ie-field">
            Reference transcript <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(optional — improves accuracy)</span>
            <TextInputView value={refText} size="sm" width="fw" placeholder="What the speaker says in the sample…"
              onChange={(e) => setRefText((e.target as HTMLInputElement).value)} />
          </label>

          <div className="ie-opt-row ie-opt-inline" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 8, padding: '10px 12px' }}>
            <div className="ie-opt-text">
              <div className="ie-opt-label" style={{ color: '#a78bfa' }}>Consent to process voice sample</div>
              <div className="ie-opt-desc">
                I consent to sending this audio sample to my configured local TTS engine for voice cloning.
                The sample is not stored on disk by iStorybook and never sent to any third-party service.
              </div>
            </div>
            <ToggleSwitchView checked={consent} onChange={setConsent} size="md" accentColor="#a78bfa" />
          </div>

          {cloneError && <div style={{ fontSize: 12, color: '#f87171', padding: '6px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>{cloneError}</div>}
          {cloneOk && <div style={{ fontSize: 12, color: '#34d399', padding: '6px 10px', background: 'rgba(52,211,153,0.08)', borderRadius: 6 }}>{cloneOk}</div>}

          <div className="ie-save-row">
            <span className="ie-save-hint">
              {!canClone
                ? `${engineLabel} does not support voice cloning. Switch to Qwen3-TTS, Fish Speech, or F5-TTS.`
                : audioConfig.url
                  ? `Will clone via ${engineLabel} at ${audioConfig.url}`
                  : 'Set a TTS engine URL in Settings → Voice Engine first.'}
            </span>
            <ButtonView size="sm" accentColor="#a78bfa" onClick={() => void handleClone()}
              disabled={cloning || !canClone || !audioConfig.url}>
              {cloning ? 'Cloning…' : '🎙 Clone voice'}
            </ButtonView>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Privacy + Self-Host panel — S30.
 */
import { useState, useEffect } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { usePrivacyStore } from '../../store/privacy-store';
import { SettingsPanelHeader } from './SettingsPanelHeader';

export function PrivacyPanel() {
  const { privacyMode, kidsMode, localEngines, setPrivacyMode, setKidsMode, detectLocalEngines, getCostEstimate } = usePrivacyStore();
  const [detecting, setDetecting] = useState(false);
  const [cost, setCost] = useState<{ local: string; cloud: string; recommendation: string } | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => { getCostEstimate().then(setCost); }, [localEngines]);

  async function handleDetect() {
    setDetecting(true);
    await detectLocalEngines();
    const c = await getCostEstimate();
    setCost(c);
    setDetecting(false);
  }

  async function handleKidsMode(enabled: boolean) {
    setPinError('');
    try {
      await setKidsMode(enabled, enabled && pin ? pin : undefined);
      setPin('');
    } catch (e: unknown) {
      setPinError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="story-tab-scroll" style={{ height: '100%' }}>
      <div style={{ padding: '0 4px' }}>
        <SettingsPanelHeader icon="🔒" title="Privacy & Self-Host" subtitle="Run everything on your own machine. Photos and voice never leave your device." />

        {/* Cost estimator */}
        <div style={{ background: 'var(--story-surface-2)', border: '1px solid var(--story-border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>💰 Cost Estimator</div>
          {cost && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ background: 'var(--story-surface)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginBottom: 4 }}>LOCAL ENGINES</div>
                <div style={{ fontSize: 13, color: '#22d3ee', fontWeight: 600 }}>{cost.local}</div>
              </div>
              <div style={{ background: 'var(--story-surface)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginBottom: 4 }}>CLOUD / RUNPOD</div>
                <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>{cost.cloud}</div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--story-text-muted)' }}>{cost?.recommendation}</div>
        </div>

        {/* Auto-detect local engines */}
        <div style={{ background: 'var(--story-surface-2)', border: '1px solid var(--story-border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>🔍 Auto-Detect Local Engines</div>
              <div style={{ fontSize: 12, color: 'var(--story-text-muted)', marginTop: 2 }}>Scan common ports (7860, 8080, 9000…) for running engines</div>
            </div>
            <ButtonView size="sm" onClick={handleDetect} disabled={detecting}>{detecting ? 'Scanning…' : 'Scan Now'}</ButtonView>
          </div>
          {localEngines.length > 0 ? (
            <div>
              {localEngines.map((e) => (
                <div key={e.url} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--story-border)' }}>
                  <span style={{ fontSize: 11, color: '#22d3ee' }}>🟢</span>
                  <span style={{ fontSize: 12, flex: 1 }}>{e.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--story-text-muted)' }}>{e.url}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--story-text-muted)' }}>No local engines detected yet. Run a local engine and click Scan.</div>
          )}
        </div>

        {/* Privacy mode */}
        <div style={{ background: 'var(--story-surface-2)', border: `1px solid ${privacyMode ? 'var(--story-accent)' : 'var(--story-border)'}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>🔒 Privacy Mode</div>
              <div style={{ fontSize: 12, color: 'var(--story-text-muted)', marginTop: 2 }}>Photos and voice samples route to local engines only — never uploaded to cloud</div>
            </div>
            <ButtonView size="sm" variant={privacyMode ? 'solid' : 'ghost'} onClick={() => setPrivacyMode(!privacyMode)}>
              {privacyMode ? 'ON' : 'OFF'}
            </ButtonView>
          </div>
          {privacyMode && (
            <div style={{ background: 'color-mix(in srgb, #22d3ee 8%, var(--story-surface))', borderRadius: 6, padding: 10, fontSize: 12, color: '#22d3ee' }}>
              ✓ Privacy mode active — photos and voice clips stay on this machine
            </div>
          )}
        </div>

        {/* Kids / COPPA mode — S45 */}
        <div style={{ background: 'var(--story-surface-2)', border: `1px solid ${kidsMode ? '#22d3ee' : 'var(--story-border)'}`, borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>👧 Kids / COPPA Mode</div>
              <div style={{ fontSize: 12, color: 'var(--story-text-muted)', marginTop: 2 }}>No PII collection, content safety filters, parental gate (PIN)</div>
            </div>
            <ButtonView size="sm" variant={kidsMode ? 'solid' : 'ghost'} onClick={() => handleKidsMode(!kidsMode)}>
              {kidsMode ? 'ON' : 'OFF'}
            </ButtonView>
          </div>
          {!kidsMode && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--story-text-muted)', marginBottom: 4 }}>Set a parent PIN (optional, required to disable Kids Mode)</div>
              <TextInputView value={pin} onChange={setPin} placeholder="Parent PIN" type="password" />
            </div>
          )}
          {pinError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{pinError}</div>}
          {kidsMode && (
            <div style={{ background: 'color-mix(in srgb, #22d3ee 8%, var(--story-surface))', borderRadius: 6, padding: 10, fontSize: 12, color: '#22d3ee', marginTop: 8 }}>
              ✓ Kids mode active — content filtering on, PII protection on, audit trail active
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** SettingsTab — LLM + RunPod configuration (moved here from the old popup modal). */
import { useSettingsStore } from '../store/settings-store';

export function SettingsTab() {
  const settings = useSettingsStore((s) => s.settings);
  const serverConfig = useSettingsStore((s) => s.serverConfig);
  const setRunpodUrl = useSettingsStore((s) => s.setRunpodUrl);

  return (
    <div className="story-tab-scroll">
      <div className="story-settings-page">
        <h2 className="story-settings-h2">⚙ Settings</h2>
        <p className="story-settings-lead">Connect your language model and your image server.</p>

        {/* Status */}
        <div className="story-settings-status">
          <StatusRow label="Language model" ok={!!serverConfig?.llmConfigured} detail={serverConfig?.llmModel} />
          <StatusRow label="Image server (RunPod)" ok={!!serverConfig?.runpodConfigured || !!settings.runpodUrl} />
        </div>

        {/* RunPod URL */}
        <div className="story-settings-card">
          <div className="story-settings-field">
            <span className="story-settings-label">RunPod Ideogram 4 URL</span>
            <input
              className="story-settings-input"
              placeholder="https://xxxxx-8080.proxy.runpod.net"
              value={settings.runpodUrl}
              onChange={(e) => setRunpodUrl(e.target.value)}
            />
            <span className="story-settings-hint">
              Your deployed image server (experiments/cuda-id4 api_server.py). Overrides the server's RUNPOD_URL.
              Saved in this browser and sent with each generation request.
            </span>
          </div>
        </div>

        {/* LLM note */}
        <div className="story-settings-note">
          <b>Language-model key</b> lives in the server's <code>.env</code>
          (<code>LLM_API_KEY</code> / <code>LLM_BASE_URL</code> / <code>LLM_MODEL</code>).
          The default is DeepSeek — any OpenAI-compatible endpoint works. Restart the server after editing
          <code>.env</code>.
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="story-settings-status-row">
      <span className={`story-status-dot ${ok ? 'ok' : 'bad'}`} />
      <span className="story-settings-status-label">{label}</span>
      <span className="story-settings-status-val">
        {ok ? (detail ? detail : 'connected') : 'not configured'}
      </span>
    </div>
  );
}

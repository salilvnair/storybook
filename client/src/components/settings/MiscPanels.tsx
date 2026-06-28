/** General / Theme / AI Features settings panels (DUI). */
import { ButtonView, ToggleSwitchView, StatsCardView, ChipView } from '@salilvnair/dui';
import { usePrefsStore, type AiFeatures } from '../../store/prefs-store';
import { ThemeCards } from './ThemeCards';
import { useTemplatesStore } from '../../store/templates-store';
import { useProvidersStore } from '../../store/providers-store';
import { usePalettesStore } from '../../store/palettes-store';
import { useThemesStore } from '../../store/themes-store';
import { useImageEngineStore } from '../../store/image-engine-store';
import { BookIcon, CpuIcon, PaletteIcon, SparkleIcon, TrashIcon } from '../../icons';

export function GeneralPanel() {
  const templates = useTemplatesStore((s) => s.saved.length);
  const providers = useProvidersStore((s) => s.providers.length);
  const palettes = usePalettesStore((s) => s.palettes.length);
  const themes = useThemesStore((s) => s.themes.length);
  const engine = useImageEngineStore((s) => s.current());
  const version = '0.1.0';

  const resetDb = () => {
    if (!confirm('Erase the local database (templates, providers, palettes, themes, prompts, audit logs)? This cannot be undone.')) return;
    localStorage.removeItem('storybook.sqlite.v1');
    location.reload();
  };

  return (
    <div className="story-tab-scroll">
      <div className="prov-page gen-page">
        <div className="prov-section-head"><span style={{ fontSize: 15 }}>📖</span><h2 className="story-settings-h2" style={{ margin: 0 }}>General</h2></div>
        <p className="story-settings-lead">Your Storybook Buddy workspace at a glance.</p>

        {/* Live stat cards */}
        <div className="gen-stats">
          <StatsCardView label="Saved templates" value={templates} icon={<BookIcon size={16} />} accentColor="#34d399" />
          <StatsCardView label="LLM providers" value={providers} icon={<CpuIcon size={16} />} accentColor="#22d3ee" />
          <StatsCardView label="Palettes" value={palettes} icon={<PaletteIcon size={16} />} accentColor="#f59e0b" />
          <StatsCardView label="Themes" value={themes} icon={<SparkleIcon size={16} />} accentColor="#a855f7" />
        </div>

        {/* About card */}
        <div className="gen-card">
          <div className="gen-card-title">✨ About</div>
          <div className="gen-rows">
            <div className="gen-row"><span className="gen-k">App</span><ChipView size="sm" color="#f59e0b" label="Storybook Buddy" /></div>
            <div className="gen-row"><span className="gen-k">Version</span><ChipView size="sm" color="#34d399" label={`v${version}`} /></div>
            <div className="gen-row"><span className="gen-k">Image engine</span><ChipView size="sm" color={engine?.accent || '#8b5cf6'} label={engine?.label || '—'} /></div>
            <div className="gen-row"><span className="gen-k">Database</span><ChipView size="sm" color="#22d3ee" label="local sql.js · this browser" /></div>
          </div>
        </div>

        {/* Danger zone — red card with a tip (like the engine card) */}
        <div className="gen-danger">
          <div className="gen-danger-head"><span className="gen-danger-dot" />⚠️ Danger Zone</div>
          <p className="gen-danger-tip">
            Erasing the local database permanently deletes <b>all saved templates, providers, palettes, themes, prompts and audit logs</b> stored in this browser. The app reloads fresh. This cannot be undone.
          </p>
          <ButtonView size="md" accentColor="var(--color-error, #f87171)" iconLeft={<TrashIcon size={14} />} onClick={resetDb}>Erase local database</ButtonView>
        </div>
      </div>
    </div>
  );
}

export function ThemePanel() {
  return (
    <div className="story-tab-scroll">
      <div className="prov-page">
        <div className="prov-section-head"><span style={{ fontSize: 15 }}>🎨</span><h2 className="story-settings-h2" style={{ margin: 0 }}>Theme</h2></div>
        <p className="story-settings-lead">Accent themes apply across the app instantly. Click to apply, right-click to edit colours, or add your own.</p>
        <ThemeCards />
      </div>
    </div>
  );
}

const FEATURES: { key: keyof AiFeatures; label: string; desc: string }[] = [
  { key: 'magicPrompt', label: 'Magic prompt', desc: 'Let Ideogram 4 enhance each image prompt for richer art.' },
  { key: 'speechBubbles', label: 'Speech & thought bubbles', desc: 'Ask the author to include SAYS/THINKS lines in each scene.' },
  { key: 'autoLoadModel', label: 'Warm the model first', desc: 'Pre-load the RunPod model before generating (slower first call, faster pages).' },
];

export function AiFeaturesPanel() {
  const features = usePrefsStore((s) => s.features);
  const setFeature = usePrefsStore((s) => s.setFeature);
  return (
    <div className="story-tab-scroll">
      <div className="prov-page">
        <div className="prov-section-head"><span style={{ fontSize: 15 }}>✨</span><h2 className="story-settings-h2" style={{ margin: 0 }}>AI Features</h2></div>
        <div className="feat-list">
          {FEATURES.map((f) => (
            <div key={f.key} className="feat-row">
              <div className="feat-text"><div className="feat-label">{f.label}</div><div className="feat-desc">{f.desc}</div></div>
              <ToggleSwitchView checked={features[f.key]} onChange={(v) => setFeature(f.key, v)} size="md" accentColor="var(--story-accent)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

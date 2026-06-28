import { useEffect } from 'react';
import { TabBar } from './components/TabBar';
import { StoryTab } from './tabs/StoryTab';
import { TemplatesTab } from './tabs/TemplatesTab';
import { LibraryTab } from './tabs/LibraryTab';
import { SamplePreviewTab } from './tabs/SamplePreviewTab';
import { SettingsPage } from './tabs/SettingsPage';
import { ButtonView, IconButtonView } from '@salilvnair/dui';
import { useTabsStore } from './store/tabs-store';
import { useSettingsStore } from './store/settings-store';
import { usePromptsStore } from './store/prompts-store';
import { useTemplatesStore } from './store/templates-store';
import { useProvidersStore } from './store/providers-store';
import { useImageEngineStore } from './store/image-engine-store';
import { useThemesStore } from './store/themes-store';
import { usePalettesStore } from './store/palettes-store';
import { PaletteIcon, BookIcon, SettingsIcon } from './icons';
import { BrandLogo } from './components/BrandLogo';

export default function App() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const open = useTabsStore((s) => s.open);

  const serverConfig = useSettingsStore((s) => s.serverConfig);
  const fetchServerConfig = useSettingsStore((s) => s.fetchServerConfig);
  const loadTemplates = useTemplatesStore((s) => s.load);
  const loadProviders = useProvidersStore((s) => s.load);
  const activeProvider = useProvidersStore((s) => s.providers.find((p) => p.isActive));
  const imgHealth = useImageEngineStore((s) => s.health);
  const imgEngine = useImageEngineStore((s) => s.engines.find((e) => e.id === s.config.engine));

  // Disable the browser's native context menu app-wide — only our DUI
  // ContextMenuView (wired via onContextMenu handlers) should ever appear.
  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);

  useEffect(() => {
    void fetchServerConfig();
    void loadTemplates();
    void loadProviders();
    void useImageEngineStore.getState().init();
    void useThemesStore.getState().load();
    void usePalettesStore.getState().load();
    const id = setInterval(() => { void fetchServerConfig(); void useImageEngineStore.getState().checkHealth(); }, 15000);
    void usePromptsStore.getState().load();
    return () => clearInterval(id);
    // Mount-once startup loads (stable zustand actions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const llmOk = !!serverConfig?.llmConfigured;

  return (
    <div className="story-app">
      <header className="story-hero">
        <div className="story-hero-badge"><BrandLogo size={26} /></div>
        <div className="story-hero-titles">
          <div className="story-hero-title"><span className="accent">i</span>Storybook</div>
          <div className="story-hero-sub">Chat to dream up a tale · illustrate it with AI · download a printable picture book</div>
        </div>
        <div className="story-hero-actions">
          <ButtonView size="sm" variant="secondary" iconLeft={<PaletteIcon size={14} />} onClick={() => open('templates')}>Templates</ButtonView>
          <ButtonView size="sm" variant="secondary" iconLeft={<BookIcon size={14} />} onClick={() => open('library')}>Library</ButtonView>
          {/* Provider · Model — plain label, no status dot */}
          <span className="story-status-pill is-plain" title="Active LLM provider · model">
            {(activeProvider?.name || (serverConfig?.llmModel ? 'server .env' : 'No provider'))}
            <span className="story-pill-sep">·</span>
            {(activeProvider?.model || serverConfig?.llmModel || '—')}
          </span>
          {/* chat-engine — green dot if an LLM is configured */}
          <span className="story-status-pill" title={llmOk ? 'Chat engine ready' : 'Chat engine not configured'}>
            <span className={`story-status-dot ${llmOk ? 'ok' : 'bad'}`} />
            chat-engine
          </span>
          {/* image-engine — green if the configured URL is reachable, red otherwise */}
          <span
            className="story-status-pill"
            title={imgHealth.ok ? `${imgEngine?.label || 'Image engine'} reachable${imgHealth.status ? ` (${imgHealth.status})` : ''}` : imgHealth.configured ? `${imgEngine?.label || 'Image engine'} URL set but unreachable` : 'Image engine URL not configured — set it in Settings → Providers'}
            onClick={() => open('settings')}
            style={{ cursor: 'pointer' }}
          >
            <span className={`story-status-dot ${imgHealth.ok ? 'ok' : 'bad'}`} />
            image-engine
          </span>
          <IconButtonView size="md" tooltip="Settings" icon={<SettingsIcon size={15} />} onClick={() => open('settings')} />
        </div>
      </header>

      <TabBar />

      <div className="story-tab-host">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          if (tab.type === 'story') {
            return (
              <div key={tab.id} className="story-tab-pane" style={{ display: isActive ? 'flex' : 'none' }}>
                <StoryTab tabId={tab.id} />
              </div>
            );
          }
          if (!isActive) return null;
          return (
            <div key={tab.id} className="story-tab-pane">
              {tab.type === 'templates' && <TemplatesTab />}
              {tab.type === 'library' && <LibraryTab />}
              {tab.type === 'sample-preview' && <SamplePreviewTab />}
              {tab.type === 'settings' && <SettingsPage />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

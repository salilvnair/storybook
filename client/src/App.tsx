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
import { PaletteIcon, BookIcon, SettingsIcon } from './icons';

export default function App() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const open = useTabsStore((s) => s.open);

  const serverConfig = useSettingsStore((s) => s.serverConfig);
  const fetchServerConfig = useSettingsStore((s) => s.fetchServerConfig);
  const loadTemplates = useTemplatesStore((s) => s.load);
  const loadProviders = useProvidersStore((s) => s.load);

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
    const id = setInterval(() => void fetchServerConfig(), 15000);
    void usePromptsStore.getState().load();
    return () => clearInterval(id);
    // Mount-once startup loads (stable zustand actions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const llmOk = !!serverConfig?.llmConfigured;
  const runpodOk = !!serverConfig?.runpodConfigured;

  return (
    <div className="story-app">
      <header className="story-hero">
        <div className="story-hero-badge">📖</div>
        <div className="story-hero-titles">
          <div className="story-hero-title">Story<span className="accent">book</span> Buddy</div>
          <div className="story-hero-sub">Chat to dream up a tale · illustrate it with AI · download a printable picture book</div>
        </div>
        <div className="story-hero-actions">
          <ButtonView size="sm" variant="secondary" iconLeft={<PaletteIcon size={14} />} onClick={() => open('templates')}>Templates</ButtonView>
          <ButtonView size="sm" variant="secondary" iconLeft={<BookIcon size={14} />} onClick={() => open('library')}>Library</ButtonView>
          <span className="story-status-pill" title="Language model status">
            <span className={`story-status-dot ${llmOk ? 'ok' : 'bad'}`} />
            {serverConfig?.llmModel || 'LLM'}
          </span>
          <span className="story-status-pill" title="Image server status">
            <span className={`story-status-dot ${runpodOk ? 'ok' : 'bad'}`} />
            RunPod
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
                <StoryTab />
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

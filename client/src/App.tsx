import { useEffect, useRef, useState } from 'react';
import { TabBar } from './components/TabBar';
import { StoryTab } from './tabs/StoryTab';
import { TemplatesTab } from './tabs/TemplatesTab';
import { CharacterStudioTab } from './tabs/CharacterStudioTab';
import { DesignerStudioTab } from './tabs/DesignerStudioTab';
import { LibraryTab } from './tabs/LibraryTab';
import { SamplePreviewTab } from './tabs/SamplePreviewTab';
import { SettingsPage } from './tabs/SettingsPage';
import { ButtonView, IconButtonView } from '@salilvnair/dui';
import { EngineStatusPopup } from './components/EngineStatusPopup';
import { useTabsStore } from './store/tabs-store';
import { useSettingsStore } from './store/settings-store';
import { usePromptsStore } from './store/prompts-store';
import { useTemplatesStore } from './store/templates-store';
import { useProvidersStore } from './store/providers-store';
import { useImageEngineStore } from './store/image-engine-store';
import { useAudioEngineStore } from './store/audio-engine-store';
import { useThemesStore } from './store/themes-store';
import { usePalettesStore } from './store/palettes-store';
import { useCharactersStore } from './store/characters-store';
import { useMusicEngineStore } from './store/music-engine-store';
import { useWorldsStore } from './store/worlds-store';
import { usePageDesignStore } from './store/page-design-store';
import { usePacksStore } from './store/packs-store';
import { PaletteIcon, BookIcon, SettingsIcon, UsersIcon } from './icons';
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
    void useAudioEngineStore.getState().init();
    void useMusicEngineStore.getState().init();
    void useWorldsStore.getState().load();
    void useThemesStore.getState().load();
    void usePalettesStore.getState().load();
    const id = setInterval(() => {
      void fetchServerConfig();
      void useImageEngineStore.getState().checkHealth();
      void useAudioEngineStore.getState().checkHealth();
    }, 15000);
    void usePromptsStore.getState().load();
    void useCharactersStore.getState().load();
    void usePageDesignStore.getState().load();
    void usePacksStore.getState().load();
    return () => clearInterval(id);
    // Mount-once startup loads (stable zustand actions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audioConfig = useAudioEngineStore((s) => s.config);
  const musicConfig = useMusicEngineStore((s) => s.config);
  const audioEngine = useAudioEngineStore((s) => s.current());
  const musicEngine = useMusicEngineStore((s) => s.current());

  const llmOk = !!serverConfig?.llmConfigured;
  const audioOk = !!audioConfig.url;
  const musicOk = !!musicConfig.url;
  const anyOk = llmOk || imgHealth.ok || audioOk || musicOk;
  const allOk = llmOk && imgHealth.ok && audioOk && musicOk;

  const engineChipRef = useRef<HTMLButtonElement>(null);
  const [enginePopupOpen, setEnginePopupOpen] = useState(false);

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
          <ButtonView size="sm" variant="secondary" iconLeft={<UsersIcon size={14} />} onClick={() => open('character-studio')}>Character Studio</ButtonView>
          <ButtonView size="sm" variant="secondary" iconLeft={<PaletteIcon size={14} />} onClick={() => open('designer')}>Designer</ButtonView>
          <ButtonView size="sm" variant="secondary" iconLeft={<BookIcon size={14} />} onClick={() => open('library')}>Library</ButtonView>
          {/* Provider · Model — plain label */}
          <span className="story-status-pill is-plain" title="Active LLM provider · model">
            {(activeProvider?.name || (serverConfig?.llmModel ? 'server .env' : 'No provider'))}
            <span className="story-pill-sep">·</span>
            {(activeProvider?.model || serverConfig?.llmModel || '—')}
          </span>
          {/* AI Engine chip — single pill that shows all engine statuses on click */}
          <button
            ref={engineChipRef}
            className={`story-ai-engine-chip${allOk ? ' all-ok' : anyOk ? ' some-ok' : ''}`}
            onClick={() => setEnginePopupOpen((o) => !o)}
            title="Click to see engine statuses"
          >
            <span className={`story-status-dot ${allOk ? 'ok' : anyOk ? 'warn' : 'bad'}`} />
            AI Engine
          </button>
          <EngineStatusPopup
            open={enginePopupOpen}
            onClose={() => setEnginePopupOpen(false)}
            anchorEl={engineChipRef.current}
            llmOk={llmOk}
            llmDetail={activeProvider?.name || serverConfig?.llmModel || 'server .env'}
            imgOk={imgHealth.ok}
            imgWarn={!!imgHealth.configured && !imgHealth.ok}
            imgDetail={imgEngine?.label || 'Image engine'}
            audioOk={audioOk}
            audioDetail={`${audioEngine?.label || 'TTS'} · ${audioConfig.url}`}
            musicOk={musicOk}
            musicDetail={`${musicEngine?.label || 'Music'} · ${musicConfig.url}`}
            onOpenSettings={() => open('settings')}
          />
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
              {tab.type === 'character-studio' && <CharacterStudioTab />}
              {tab.type === 'designer' && <DesignerStudioTab />}
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

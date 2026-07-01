/**
 * SettingsPage — Daakia-style settings with a Prompt Library-style left sidebar.
 * Search + collapsible groups with count badges, exactly mirroring PromptLibraryListView.
 */
import { type ReactNode, useState, useMemo } from 'react';
import { SplitPanelView, SearchInputView } from '@salilvnair/dui';
import { useUiStore } from '../store/ui-store';
import { PromptLibraryTab } from './PromptLibraryTab';
import { Providers } from '../components/settings/Providers';
import { ImageEngineSettings } from '../components/settings/ImageEngineSettings';
import { EditEngineSettings } from '../components/settings/EditEngineSettings';
import { AudioEngineSettings } from '../components/settings/AudioEngineSettings';
import { GeneralPanel, ThemePanel, AiFeaturesPanel } from '../components/settings/MiscPanels';
import { DevTools } from '../components/devtools/DevTools';
import {
  BookIcon, CpuIcon, SparkleIcon, PaletteIcon, WandIcon, DatabaseIcon,
  ScrollIcon, DnaIcon, MicIcon, MusicIcon, GlobeIcon, CameraIcon, VolumeIcon,
  ShieldIcon, PlugIcon, UsersIcon, ChevronRightIcon, SearchIcon,
} from '../icons';
import { LibraryConfig } from '../components/settings/LibraryConfig';
import { LanguageConfig } from '../components/settings/LanguageConfig';
import { VoiceLibrary } from '../components/settings/VoiceLibrary';
import { MusicEngineSettings } from '../components/settings/MusicEngineSettings';
import { WorldsManager } from '../components/settings/WorldsManager';
import { BrandKit } from '../components/settings/BrandKit';
import { PackBrowser } from '../components/settings/PackBrowser';
import { ProviderSDK } from '../components/settings/ProviderSDK';
import { PrivacyPanel } from '../components/settings/PrivacyPanel';
import { ProfilesPanel } from '../components/settings/ProfilesPanel';
import { DesignerBlocksSettings } from '../components/settings/DesignerBlocksSettings';

type Section =
  | 'general'
  | 'chat-engine' | 'image-engine' | 'voice-engine' | 'music-engine'
  | 'prompts' | 'theme' | 'features' | 'library-config' | 'language-config'
  | 'characters' | 'voices' | 'universe' | 'brand' | 'packs' | 'designer-blocks' | 'devtools'
  | 'provider-sdk' | 'privacy' | 'profiles';

const NAV: { id: Section; label: string; icon: ReactNode; color: string; group: string }[] = [
  { id: 'general',        label: 'General',              icon: <BookIcon size={14} />,     color: '#94a3b8', group: 'General' },
  { id: 'chat-engine',    label: 'Chat Engine',          icon: <CpuIcon size={14} />,      color: '#34d399', group: 'Engines' },
  { id: 'image-engine',   label: 'Image Engine',            icon: <CameraIcon size={14} />, color: '#8b5cf6', group: 'Engines' },
  { id: 'voice-engine',   label: 'Voice Engine',         icon: <VolumeIcon size={14} />,   color: '#f97316', group: 'Engines' },
  { id: 'music-engine',   label: 'Music Engine',         icon: <MusicIcon size={14} />,    color: '#7c3aed', group: 'Engines' },
  { id: 'prompts',        label: 'Prompt Library',       icon: <SparkleIcon size={14} />,  color: '#ec4899', group: 'Studio' },
  { id: 'theme',          label: 'Theme',                icon: <PaletteIcon size={14} />,  color: '#f59e0b', group: 'Studio' },
  { id: 'features',       label: 'AI Features',          icon: <WandIcon size={14} />,     color: '#22d3ee', group: 'Studio' },
  { id: 'library-config', label: 'Library Config',       icon: <ScrollIcon size={14} />,   color: '#60a5fa', group: 'Studio' },
  { id: 'language-config',label: 'Language Config',      icon: <GlobeIcon size={14} />,    color: '#22d3ee', group: 'Studio' },
  { id: 'voices',         label: 'Voices',               icon: <MicIcon size={14} />,      color: '#a78bfa', group: 'Studio' },
  { id: 'universe',       label: 'Universe',             icon: <GlobeIcon size={14} />,    color: '#a78bfa', group: 'Studio' },
  { id: 'brand',          label: 'Brand Kit',            icon: <PaletteIcon size={14} />,  color: '#f97316', group: 'Studio' },
  { id: 'packs',          label: 'Packs',                icon: <WandIcon size={14} />,     color: '#10b981', group: 'Studio' },
  { id: 'designer-blocks', label: 'Designer Blocks',    icon: <DnaIcon size={14} />,      color: '#a78bfa', group: 'Studio' },
  { id: 'provider-sdk',   label: 'Provider SDK',         icon: <PlugIcon size={14} />,     color: '#06b6d4', group: 'Platform' },
  { id: 'privacy',        label: 'Privacy & Self-Host',  icon: <ShieldIcon size={14} />,   color: '#22d3ee', group: 'Platform' },
  { id: 'profiles',       label: 'Profiles',             icon: <UsersIcon size={14} />,    color: '#a78bfa', group: 'Platform' },
  { id: 'devtools',       label: 'Developer Tools',      icon: <DatabaseIcon size={14} />, color: '#8b5cf6', group: 'Platform' },
];

const GROUP_ORDER = ['General', 'Engines', 'Studio', 'Platform'];

export function SettingsPage() {
  const section = useUiStore((s) => s.settingsSection) as Section;
  const setSection = useUiStore((s) => s.setSettingsSection);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (g: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(g) ? next.delete(g) : next.add(g);
    return next;
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GROUP_ORDER.map((g) => ({
      id: g,
      label: g,
      items: NAV.filter((n) => n.group === g && (!q || n.label.toLowerCase().includes(q) || g.toLowerCase().includes(q))),
    })).filter((g) => g.items.length > 0);
  }, [search]);

  const totalCount = groups.reduce((s, g) => s + g.items.length, 0);

  const sidebar = (
    <aside className="set-sidebar">
      {/* Search bar — exact mirror of PromptLibraryListView */}
      <div className="set-search-wrap">
        <SearchInputView
          value={search}
          onChange={setSearch}
          placeholder="Search settings…"
          size="md"
          prefix={<SearchIcon size={13} />}
          suffix={
            !search && totalCount > 0
              ? <span className="set-search-count">{totalCount}</span>
              : undefined
          }
        />
      </div>

      <div className="set-nav-list">
        {groups.length === 0 && (
          <div className="set-nav-empty">No settings match "{search}"</div>
        )}

        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.id);
          return (
            <div key={g.id}>
              {/* Group header — collapsible, exact mirror of section header in PromptLibraryListView */}
              <button
                type="button"
                className="set-group-btn"
                onClick={() => toggleGroup(g.id)}
              >
                <ChevronRightIcon
                  size={9}
                  style={{
                    flexShrink: 0,
                    color: 'var(--color-text-muted)',
                    opacity: 0.5,
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                    transition: 'transform 140ms ease',
                  }}
                />
                <span className="set-group-label">{g.label}</span>
                <span className="set-group-count">{g.items.length}</span>
              </button>

              {!isCollapsed && g.items.map((n) => (
                <button
                  key={n.id}
                  className={`set-nav${section === n.id ? ' is-active' : ''}`}
                  onClick={() => setSection(n.id)}
                  style={section === n.id ? { ['--set-accent' as string]: n.color } : undefined}
                >
                  <span className="set-nav-icon" style={{ color: n.color }}>{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );

  const content = (
    <div className="set-content">
      {section === 'general'        && <GeneralPanel />}
      {section === 'chat-engine'    && <Providers />}
      {section === 'image-engine'   && <div className="story-tab-scroll"><div style={{ padding: '0 4px' }}><ImageEngineSettings /><div style={{ paddingTop: 20, borderTop: '1px solid var(--story-border)', marginTop: 8 }}><EditEngineSettings /></div></div></div>}
      {section === 'voice-engine'   && <div className="story-tab-scroll"><div style={{ padding: '0 4px' }}><AudioEngineSettings /></div></div>}
      {section === 'music-engine'   && <MusicEngineSettings />}
      {section === 'prompts'        && <PromptLibraryTab />}
      {section === 'theme'          && <ThemePanel />}
      {section === 'features'       && <AiFeaturesPanel />}
      {section === 'library-config' && <LibraryConfig />}
      {section === 'language-config' && <LanguageConfig />}
      {section === 'voices'         && <VoiceLibrary />}
      {section === 'universe'       && <WorldsManager />}
      {section === 'brand'          && <BrandKit />}
      {section === 'packs'          && <PackBrowser />}
      {section === 'designer-blocks' && <div className="story-tab-scroll"><div style={{ padding: '16px' }}><DesignerBlocksSettings /></div></div>}
      {section === 'provider-sdk'   && <ProviderSDK />}
      {section === 'privacy'        && <PrivacyPanel />}
      {section === 'profiles'       && <ProfilesPanel />}
      {section === 'devtools'       && <DevTools />}
    </div>
  );

  return (
    <div className="set-root">
      <SplitPanelView
        direction="horizontal"
        first={sidebar}
        second={content}
        defaultSplit={20}
        minFirstPct={20}
        minSecondPct={20}
        accentColor="var(--story-accent-3)"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
}

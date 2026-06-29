/**
 * SettingsPage — Daakia-style settings with a left sidebar.
 */
import { type ReactNode } from 'react';
import { SplitPanelView } from '@salilvnair/dui';
import { useUiStore } from '../store/ui-store';
import { PromptLibraryTab } from './PromptLibraryTab';
import { Providers } from '../components/settings/Providers';
import { ImageEngineSettings } from '../components/settings/ImageEngineSettings';
import { AudioEngineSettings } from '../components/settings/AudioEngineSettings';
import { GeneralPanel, ThemePanel, AiFeaturesPanel } from '../components/settings/MiscPanels';
import { DevTools } from '../components/devtools/DevTools';
import {
  BookIcon, CpuIcon, SparkleIcon, PaletteIcon, WandIcon, DatabaseIcon,
  ScrollIcon, DnaIcon, MicIcon, MusicIcon, GlobeIcon, CameraIcon, VolumeIcon,
} from '../icons';
import { LibraryConfig } from '../components/settings/LibraryConfig';
import { CharacterStudio } from '../components/settings/CharacterStudio';
import { VoiceLibrary } from '../components/settings/VoiceLibrary';
import { MusicEngineSettings } from '../components/settings/MusicEngineSettings';
import { WorldsManager } from '../components/settings/WorldsManager';
import { BrandKit } from '../components/settings/BrandKit';
import { PackBrowser } from '../components/settings/PackBrowser';

type Section =
  | 'general'
  | 'chat-engine' | 'image-engine' | 'voice-engine' | 'music-engine'
  | 'prompts' | 'theme' | 'features' | 'library-config'
  | 'characters' | 'voices' | 'universe' | 'brand' | 'packs' | 'devtools';

const NAV: { id: Section; label: string; icon: ReactNode; color: string; group?: string }[] = [
  { id: 'general',       label: 'General',        icon: <BookIcon size={15} />,     color: '#94a3b8' },
  { id: 'chat-engine',   label: 'Chat Engine',    icon: <CpuIcon size={15} />,      color: '#34d399', group: 'Engines' },
  { id: 'image-engine',  label: 'Image Engine',   icon: <CameraIcon size={15} />,   color: '#8b5cf6', group: 'Engines' },
  { id: 'voice-engine',  label: 'Voice Engine',   icon: <VolumeIcon size={15} />,   color: '#f97316', group: 'Engines' },
  { id: 'music-engine',  label: 'Music Engine',   icon: <MusicIcon size={15} />,    color: '#7c3aed', group: 'Engines' },
  { id: 'prompts',       label: 'Prompt Library', icon: <SparkleIcon size={15} />,  color: '#ec4899' },
  { id: 'theme',         label: 'Theme',          icon: <PaletteIcon size={15} />,  color: '#f59e0b' },
  { id: 'features',      label: 'AI Features',    icon: <WandIcon size={15} />,     color: '#22d3ee' },
  { id: 'library-config',label: 'Library Config', icon: <ScrollIcon size={15} />,   color: '#60a5fa' },
  { id: 'characters',    label: 'Characters',     icon: <DnaIcon size={15} />,      color: '#34d399' },
  { id: 'voices',        label: 'Voices',         icon: <MicIcon size={15} />,      color: '#a78bfa' },
  { id: 'universe',      label: 'Universe',       icon: <GlobeIcon size={15} />,    color: '#a78bfa' },
  { id: 'brand',         label: 'Brand Kit',      icon: <PaletteIcon size={15} />,  color: '#f97316' },
  { id: 'packs',         label: 'Packs',          icon: <WandIcon size={15} />,     color: '#10b981' },
  { id: 'devtools',      label: 'Developer Tools',icon: <DatabaseIcon size={15} />, color: '#8b5cf6' },
];

export function SettingsPage() {
  const section = useUiStore((s) => s.settingsSection) as Section;
  const setSection = useUiStore((s) => s.setSettingsSection);

  let prevGroup = '';
  const sidebar = (
    <aside className="set-sidebar">
      <div className="set-sidebar-title">⚙ Settings</div>
      {NAV.map((n) => {
        const showGroupLabel = n.group && n.group !== prevGroup;
        if (n.group) prevGroup = n.group;
        return (
          <div key={n.id}>
            {showGroupLabel && <div className="set-nav-group">{n.group}</div>}
            <button
              className={`set-nav${section === n.id ? ' is-active' : ''}`}
              onClick={() => setSection(n.id)}
              style={section === n.id ? { ['--set-accent' as string]: n.color } : undefined}
            >
              <span className="set-nav-icon" style={{ color: n.color }}>{n.icon}</span>
              {n.label}
            </button>
          </div>
        );
      })}
    </aside>
  );

  const content = (
    <div className="set-content">
      {section === 'general'       && <GeneralPanel />}
      {section === 'chat-engine'   && <Providers />}
      {section === 'image-engine'  && <div className="story-tab-scroll"><div style={{ padding: '0 4px' }}><ImageEngineSettings /></div></div>}
      {section === 'voice-engine'  && <div className="story-tab-scroll"><div style={{ padding: '0 4px' }}><AudioEngineSettings /></div></div>}
      {section === 'music-engine'  && <MusicEngineSettings />}
      {section === 'prompts'       && <PromptLibraryTab />}
      {section === 'theme'         && <ThemePanel />}
      {section === 'features'      && <AiFeaturesPanel />}
      {section === 'library-config'&& <LibraryConfig />}
      {section === 'characters'    && <CharacterStudio />}
      {section === 'voices'        && <VoiceLibrary />}
      {section === 'universe'      && <WorldsManager />}
      {section === 'brand'         && <BrandKit />}
      {section === 'packs'         && <PackBrowser />}
      {section === 'devtools'      && <DevTools />}
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

/**
 * SettingsPage — Daakia-style settings with a left sidebar. Everything
 * configurable lives here: General, Providers (LLM + RunPod), Prompt Library,
 * Theme, AI Features, and Developer Tools (DB Explorer / Audit Log / AI Audit).
 */
import { type ReactNode } from 'react';
import { SplitPanelView } from '@salilvnair/dui';
import { useUiStore } from '../store/ui-store';
import { PromptLibraryTab } from './PromptLibraryTab';
import { Providers } from '../components/settings/Providers';
import { GeneralPanel, ThemePanel, AiFeaturesPanel } from '../components/settings/MiscPanels';
import { DevTools } from '../components/devtools/DevTools';
import { BookIcon, CpuIcon, SparkleIcon, PaletteIcon, WandIcon, DatabaseIcon, ScrollIcon } from '../icons';
import { LibraryConfig } from '../components/settings/LibraryConfig';

type Section = 'general' | 'providers' | 'prompts' | 'theme' | 'features' | 'library-config' | 'devtools';

const NAV: { id: Section; label: string; icon: ReactNode; color: string }[] = [
  { id: 'general', label: 'General', icon: <BookIcon size={15} />, color: '#94a3b8' },
  { id: 'providers', label: 'Providers', icon: <CpuIcon size={15} />, color: '#34d399' },
  { id: 'prompts', label: 'Prompt Library', icon: <SparkleIcon size={15} />, color: '#ec4899' },
  { id: 'theme', label: 'Theme', icon: <PaletteIcon size={15} />, color: '#f59e0b' },
  { id: 'features', label: 'AI Features', icon: <WandIcon size={15} />, color: '#22d3ee' },
  { id: 'library-config', label: 'Library Config', icon: <ScrollIcon size={15} />, color: '#60a5fa' },
  { id: 'devtools', label: 'Developer Tools', icon: <DatabaseIcon size={15} />, color: '#8b5cf6' },
];

export function SettingsPage() {
  const section = useUiStore((s) => s.settingsSection) as Section;
  const setSection = useUiStore((s) => s.setSettingsSection);

  const sidebar = (
    <aside className="set-sidebar">
      <div className="set-sidebar-title">⚙ Settings</div>
      {NAV.map((n) => (
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
    </aside>
  );

  const content = (
    <div className="set-content">
      {section === 'general' && <GeneralPanel />}
      {section === 'providers' && <Providers />}
      {section === 'prompts' && <PromptLibraryTab />}
      {section === 'theme' && <ThemePanel />}
      {section === 'features' && <AiFeaturesPanel />}
      {section === 'library-config' && <LibraryConfig />}
      {section === 'devtools' && <DevTools />}
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

/**
 * CharacterStudioTab — design reusable characters two ways, side by side:
 *   • LEFT  — "describe to AI": a ConvEngineChat that infers a character spec and
 *             fills the studio form (with a "Create Character" suggestion card).
 *   • RIGHT — the Character Studio form/list (manual editing).
 * Mirrors the Templates tab (SplitPanelView + ConvEngineChat + custom renderers).
 */
import { useMemo } from 'react';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import { SplitPanelView } from '@salilvnair/dui';
import { CharacterStudioContent } from '../components/settings/CharacterStudio';
import { CHARACTER_RENDERERS } from '../components/character/characterRenderers';

export function CharacterStudioTab() {
  const config = useMemo(() => ({
    apiHost: '',
    conversationId: 'character-studio',
    apiEndpoints: { message: '/api/character/message' },
    title: '', subtitle: '',
    placeholder: 'Describe a character — look, personality…',
    showFeedback: false, showAudit: false, showNewChat: true, showLayoutPicker: false,
    showMaximize: false, showMinimize: false, showEngineStatus: false, showHeaderDot: false,
    defaultDark: true, composerShape: 'round' as const,
    landingChips: [
      { chipText: '🐰 A shy silver rabbit', chatText: 'a shy little silver rabbit with a purple bow who loves stargazing' },
      { chipText: '🦊 A brave young fox', chatText: 'a brave young fox explorer in a red scarf, curious and clever' },
    ],
    stream: { enabled: true, transport: 'sse' as const },
    renderers: CHARACTER_RENDERERS,
  }), []);

  const theme = useMemo(() => ({
    'color-accent': 'var(--story-accent-3)', 'bg-panel': 'var(--story-panel)', 'bg-header': 'transparent',
    'border-color': 'var(--story-border)', 'shadow-panel': 'none', 'bg-composer': 'var(--story-panel)',
    'bg-composer-surface': 'rgba(255,255,255,0.03)', 'text-primary': 'var(--color-text-primary)',
    'text-secondary': 'var(--color-text-muted)', 'text-placeholder': 'var(--color-text-muted)',
    'bg-bubble-agent': 'color-mix(in srgb, var(--story-border) 55%, var(--story-panel))',
    'text-bubble-agent': 'var(--color-text-primary)',
    'bg-bubble-user': 'linear-gradient(135deg, var(--story-accent-3), var(--story-accent-2))', 'text-bubble-user': '#fff',
  }), []);

  return (
    <div className="tc-outer">
      <div className="tc-modebar">
        <span className="tc-modebar-label">🧬 Character Studio — describe a character to the AI, or build one by hand.</span>
      </div>

      <SplitPanelView
        direction="horizontal"
        first={<div className="tc-chat-pane"><ConvEngineChat mode="fullscreen" config={config} theme={theme} /></div>}
        second={<CharacterStudioContent header={false} />}
        defaultSplit={42}
        minFirstPct={28}
        minSecondPct={34}
        accentColor="var(--story-accent-3)"
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      />
    </div>
  );
}

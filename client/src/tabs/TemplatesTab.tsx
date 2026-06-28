/**
 * TemplatesTab — the Template Creator with THREE ways to build a template:
 *   1. Manual  — a visual builder (controls bound live to the preview).
 *   2. Prompt  — describe it to the AI; it asks follow-ups and builds it.
 *   3. PDF     — attach a reference picture-book; the AI copies its layout.
 * Prompt & PDF use a ConvEngineChat with interactive custom renderers. All three
 * share the live preview on the right and end with "generate sample → approve".
 */
import { useMemo, useState } from 'react';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import { ButtonView, SplitPanelView } from '@salilvnair/dui';
import { TemplateBuilder } from '../components/template/TemplateBuilder';
import { TemplatePreview } from '../components/template/TemplatePreview';
import { TEMPLATE_RENDERERS } from '../components/template/templateRenderers';

type Mode = 'manual' | 'prompt' | 'pdf';

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: 'manual', icon: '🧩', label: 'Manual builder' },
  { id: 'prompt', icon: '💬', label: 'Describe to AI' },
  { id: 'pdf', icon: '📄', label: 'Copy a PDF' },
];

export function TemplatesTab() {
  const [mode, setMode] = useState<Mode>('manual');

  const config = useMemo(() => ({
    apiHost: '',
    conversationId: mode === 'pdf' ? 'template-pdf' : 'template-prompt',
    apiEndpoints: { message: '/api/template/message' },
    title: '', subtitle: '',
    placeholder: mode === 'pdf' ? 'Attach a PDF or describe the layout…' : 'Describe the layout you want…',
    showFeedback: false, showAudit: false, showNewChat: true, showLayoutPicker: false,
    showMaximize: false, showMinimize: false, showEngineStatus: false, showHeaderDot: false,
    defaultDark: true, composerShape: 'round' as const,
    landingChips: mode === 'pdf'
      ? [{ chipText: '📄 Attach a picture-book PDF', chatText: 'Import a PDF and copy its layout' }]
      : [{ chipText: '🧩 Open the layout editor', chatText: 'Open the layout editor' }, { chipText: '🌙 A calm bedtime layout', chatText: 'I want a calm bedtime template, soft pastel pages' }],
    stream: { enabled: false },
    renderers: TEMPLATE_RENDERERS,
  }), [mode]);

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
        <span className="tc-modebar-label">Create a template by:</span>
        {MODES.map((m) => (
          <ButtonView key={m.id} size="sm" borderRadius={9999}
            accentColor={mode === m.id ? 'var(--story-accent-3)' : 'var(--color-text-muted)'}
            onClick={() => setMode(m.id)}>{m.icon} {m.label}</ButtonView>
        ))}
      </div>

      <SplitPanelView
        direction="horizontal"
        first={
          mode === 'manual'
            ? <div className="tc-builder-pane"><TemplateBuilder /></div>
            : <div className="tc-chat-pane"><ConvEngineChat key={mode} mode="fullscreen" config={config} theme={theme} /></div>
        }
        second={<TemplatePreview />}
        defaultSplit={44}
        minFirstPct={30}
        minSecondPct={30}
        accentColor="var(--story-accent-3)"
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      />
    </div>
  );
}

/**
 * StorybookChat — the conversation panel.
 *
 * Wraps ConvEngineChat (talking to our Express /api/v1/conversation/message,
 * which proxies DeepSeek). A custom renderer matches our { type:'story', rawText,
 * story } payloads: it renders rawText as markdown and, when a finished `story`
 * is attached, shows a "Generate Storybook" card that pushes the story into the
 * story-store and kicks off image generation on the canvas.
 */
import { useMemo, useCallback, useState, useEffect } from 'react';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import { MarkdownView } from '@salilvnair/dui';
import { useStoryStore, type Story } from '../store/story-store';
import { useSettingsStore } from '../store/settings-store';
import { useTemplatesStore } from '../store/templates-store';
import { useCharactersStore } from '../store/characters-store';
import { useWorldsStore } from '../store/worlds-store';
import { TemplateSchematic } from './template/TemplateSchematic';
import { ConvHistoryBox } from './chat/ConvHistoryBox';

const CONTINUITY_TPL =
  "SERIES CONTEXT — This is a continuation of the «{{worldName}}» universe.\n" +
  "Returning characters: {{characters}}\n" +
  "Prior story summaries:\n{{summaries}}\n" +
  "Keep the same hero(es), setting, and established lore. Build naturally on what happened before.";

const LANDING_CHIPS = [
  { chipText: '🦊 Fox & the grapes', chatText: 'Tell the classic Aesop fable of the Fox and the Grapes as a 5-scene cartoon storybook for a 5 year old, with speech and thought bubbles.' },
  { chipText: '🐢 Brave little turtle', chatText: 'Write a story about a brave little turtle who learns to swim, 5 scenes, simple words, for a 4 year old.' },
  { chipText: '🌙 Bedtime adventure', chatText: 'A gentle bedtime story about a sleepy bunny who counts the stars. 5 short scenes for a 3 year old.' },
  { chipText: '🦁 Sharing is caring', chatText: 'A funny story about a lion cub who learns to share his toys. 5 scenes with a warm moral.' },
];

function CastPicker() {
  const { characters, selectedIds, toggleSelected, load } = useCharactersStore();

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (characters.length === 0) return null;

  return (
    <div style={{
      margin: '8px 0', padding: '8px 10px',
      background: 'rgba(52,211,153,0.06)', borderRadius: 8,
      border: '1px solid rgba(52,211,153,0.15)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#34d399', marginBottom: 6, letterSpacing: '0.04em' }}>
        🧬 CAST — characters in this story
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {characters.map((c) => {
          const on = selectedIds.includes(c.id);
          return (
            <button key={c.id} onClick={() => toggleSelected(c.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: on ? 600 : 400,
              background: on ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${on ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: on ? '#34d399' : 'var(--color-text-secondary)',
              transition: 'all 0.15s',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: on ? '#34d399' : 'rgba(255,255,255,0.2)', flexShrink: 0,
              }} />
              {c.name}
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 5 }}>
          {selectedIds.length} character{selectedIds.length > 1 ? 's' : ''} selected — look descriptions will be injected into every scene prompt
        </div>
      )}
    </div>
  );
}

function StoryReadyCard({ story }: { story: Story }) {
  const setStory = useStoryStore((s) => s.setStory);
  const generate = useStoryStore((s) => s.generate);
  const phase = useStoryStore((s) => s.phase);
  const progress = useStoryStore((s) => s.progress);
  const activeTitle = useStoryStore((s) => s.story?.title);
  const runpodUrl = useSettingsStore((s) => s.settings.runpodUrl);

  // Local editable copy of the story (S2.03 — tweak text before generating).
  const [draft, setDraft] = useState<Story>(story);
  const [editing, setEditing] = useState(false);
  const editScene = (i: number, field: 'title' | 'narration' | 'says', value: string) =>
    setDraft((d) => ({ ...d, scenes: d.scenes.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)) }));

  // This card drives generation only when it's the story currently in the store.
  const isMine = activeTitle === draft.title;
  const generating = isMine && phase === 'generating';
  const done = isMine && phase === 'done';

  const onGenerate = useCallback(() => {
    setStory(draft);
    void generate(runpodUrl ? { runpodUrl } : undefined);
  }, [draft, setStory, generate, runpodUrl]);

  return (
    <div className="story-ready-card">
      <div className="story-ready-head">
        <span className="story-ready-emoji">📖</span>
        <span className="story-ready-title">{draft.title}</span>
        <span className="story-ready-count">{draft.scenes.length} pages</span>
        {!generating && !done && (
          <button className="story-edit-toggle" onClick={() => setEditing((e) => !e)} title="Edit the words before generating">
            {editing ? '✓ Done' : '✏️ Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="story-edit-scenes">
          <input className="story-edit-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Book title" />
          {draft.scenes.map((sc, i) => (
            <div key={sc.index} className="story-edit-scene">
              <div className="story-edit-n">{sc.index}</div>
              <div className="story-edit-fields">
                <input className="story-edit-f" value={sc.title} onChange={(e) => editScene(i, 'title', e.target.value)} placeholder="Scene title" />
                <textarea className="story-edit-f" rows={2} value={sc.narration} onChange={(e) => editScene(i, 'narration', e.target.value)} placeholder="Page text" />
                <input className="story-edit-f says" value={sc.says} onChange={(e) => editScene(i, 'says', e.target.value)} placeholder="Speech bubble" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="story-ready-scenes">
          {draft.scenes.map((sc) => (
            <div key={sc.index} className="story-ready-scene">
              <b>{sc.index}.</b>
              <span>{sc.title}</span>
            </div>
          ))}
        </div>
      )}

      {!generating && !done && <CastPicker />}

      {/* ck8t/cuda-id4-style progress card while generating */}
      {generating && (
        <div className="story-chat-progress">
          <div className="story-chat-progress-row">
            <span className="story-progress-spinner" />
            <span className="story-chat-progress-label">{progress.label || 'Working…'}</span>
            <span className="story-chat-progress-pct">{progress.pct}%</span>
          </div>
          <div className="story-progress-track">
            <div className="story-progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
          {progress.total > 0 && (
            <div className="story-chat-progress-step">step {progress.step} / {progress.total}</div>
          )}
        </div>
      )}

      <div className="story-ready-foot">
        {done ? (
          <div className="story-chat-done">🎉 Storybook ready — see it on the right →</div>
        ) : (
          <button className="story-generate-btn" onClick={onGenerate} disabled={generating}>
            {generating ? '🎨 Illustrating…' : '✨ Generate Storybook'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline live template preview (shown for the "show current template" intent). */
function ChatTemplatePreview() {
  const spec = useTemplatesStore((s) => s.defaultSpec());
  return (
    <div className="story-chat-template">
      <TemplateSchematic spec={spec} labels />
    </div>
  );
}

function StoryRenderer({ payload }: { payload: unknown }) {
  const p = (payload || {}) as { rawText?: string; story?: Story | null };
  const rawText = p.rawText ?? '';
  const showTemplate = rawText.includes('[[show-template]]');
  const text = rawText.replace('[[show-template]]', '').trim();
  const story = p.story ?? null;
  return (
    <div>
      {text && (
        <div className="story-chat-md">
          <MarkdownView content={text} />
        </div>
      )}
      {showTemplate && <ChatTemplatePreview />}
      {story && story.scenes?.length > 0 && <StoryReadyCard story={story} />}
    </div>
  );
}

const RENDERERS = [
  {
    key: 'storybook-story',
    priority: 200,
    // Catch every assistant message so ALL text renders through DUI MarkdownView
    // (never the built-in <pre> default, which preserves blank lines as big gaps).
    match: () => true,
    Component: StoryRenderer,
    hideBubble: false,
  },
];

interface Props { tabId: string }

export function StorybookChat({ tabId }: Props) {
  const resetServerHistory = useCallback(async () => {
    await fetch(`/api/v1/conversation/reset/${tabId}`, { method: 'POST' }).catch(() => {});
  }, [tabId]);

  // S24 — push world continuity context to server when active world changes
  const activeWorldId = useWorldsStore((s) => s.activeWorldId);
  useEffect(() => {
    const pushCtx = async () => {
      let worldContinuity = '';
      if (activeWorldId) {
        const state = useWorldsStore.getState();
        const world = state.worlds.find((w) => w.id === activeWorldId);
        if (world) {
          const { characters, summaries } = state.continuityContext(activeWorldId);
          if (summaries) {
            worldContinuity = CONTINUITY_TPL
              .replace('{{worldName}}', world.name)
              .replace('{{characters}}', characters || 'same hero(es) as before')
              .replace('{{summaries}}', summaries);
          }
        }
      }
      await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldContinuity }),
      }).catch(() => {});
    };
    void pushCtx();
  }, [activeWorldId]);

  const config = useMemo(
    () => ({
      apiHost: '',
      conversationId: tabId,
      onMessage: () => {},
      title: '',
      subtitle: '',
      placeholder: 'Describe the story you want to make for your little one…',
      showFeedback: false,
      showAudit: false,
      showNewChat: true,
      showLayoutPicker: false,
      showMaximize: false,
      showMinimize: false,
      showEngineStatus: false,
      showHeaderDot: false,
      defaultDark: true,
      composerShape: 'round' as const,
      landingChips: LANDING_CHIPS,
      stream: { enabled: true, transport: 'sse' as const },
      renderers: RENDERERS,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabId],
  );

  const theme = useMemo(
    () => ({
      'color-accent': 'var(--story-accent)',
      'bg-panel': 'var(--story-panel)',
      'bg-header': 'transparent',
      'border-color': 'var(--story-border)',
      'shadow-panel': 'none',
      'bg-composer': 'var(--story-panel)',
      'bg-composer-surface': 'rgba(255,255,255,0.03)',
      'text-primary': 'var(--color-text-primary)',
      'text-secondary': 'var(--color-text-muted)',
      'text-placeholder': 'var(--color-text-muted)',
      'bg-bubble-agent': 'color-mix(in srgb, var(--story-border) 55%, var(--story-panel))',
      'text-bubble-agent': 'var(--color-text-primary)',
      'bg-bubble-user': 'linear-gradient(135deg, var(--story-accent-3), var(--story-accent-2))',
      'text-bubble-user': '#fff',
    }),
    [],
  );

  return (
    <div className="story-pane-chat">
      <ConvHistoryBox conversationId={tabId} onClear={resetServerHistory} />
      <div className="story-chat-inner">
        <ConvEngineChat mode="fullscreen" config={config} theme={theme} />
      </div>
    </div>
  );
}

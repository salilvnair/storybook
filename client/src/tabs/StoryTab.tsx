/** StoryTab — the core experience: chat (left) co-writes a story, canvas (right) illustrates it. */
import { SplitPanelView } from '@salilvnair/dui';
import { StorybookChat } from '../components/StorybookChat';
import { StorybookCanvas } from '../components/StorybookCanvas';

export function StoryTab() {
  return (
    <div className="story-split">
      <SplitPanelView
        direction="horizontal"
        first={<StorybookChat />}
        second={<StorybookCanvas />}
        defaultSplit={44}
        minFirstPct={20}
        minSecondPct={20}
        accentColor="var(--story-accent)"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
}

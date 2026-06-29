/**
 * LibraryConfig — reader / flip-book settings.
 * Configures which page-turn experience to use when opening a book.
 */
import { SelectInputView, ToggleSwitchView } from '@salilvnair/dui';
import { usePrefsStore } from '../../store/prefs-store';
import { SaveButton } from '../SaveButton';

export function LibraryConfig() {
  const { prefs, set, save } = usePrefsStore();

  return (
    <div className="story-tab-scroll">
    <div className="bs-settings-pane bs-custom-provider-pane ie-pane">
      <div className="bs-settings-section-head">
        <span style={{ fontSize: 15 }}>📚</span>
        <h3 className="bs-settings-h3">Library Reader Config</h3>
      </div>
      <p className="story-settings-lead">
        Choose how storybooks open when you click them in the Library.
        The Page Flip mode uses a realistic page-turn animation.
      </p>

      <div className="ie-opts">
        <label className="ie-opt-row ie-opt-inline">
          <div className="ie-opt-text">
            <div className="ie-opt-label">Reader mode</div>
            <div className="ie-opt-desc">Classic uses our built-in 3D flip. Page Flip uses react-pageflip for a physical page-curl effect.</div>
          </div>
          <SelectInputView
            options={[
              { value: 'classic', label: 'Classic (built-in 3D)' },
              { value: 'pageflip', label: 'Page Flip (physical curl)' },
            ]}
            value={prefs.readerMode || 'classic'}
            onChange={(v) => set('readerMode', v)}
            size="sm"
          />
        </label>

        <label className="ie-opt-row ie-opt-inline">
          <div className="ie-opt-text">
            <div className="ie-opt-label">Show cover alone</div>
            <div className="ie-opt-desc">Display the front cover as a single page before the spread opens (Page Flip mode).</div>
          </div>
          <ToggleSwitchView
            checked={prefs.showCover !== false}
            onChange={(v) => set('showCover', v)}
            size="md"
            accentColor="#60a5fa"
          />
        </label>

        <label className="ie-opt-row ie-opt-inline">
          <div className="ie-opt-text">
            <div className="ie-opt-label">Draw page shadows</div>
            <div className="ie-opt-desc">Render drop shadows during the flip animation.</div>
          </div>
          <ToggleSwitchView
            checked={prefs.flipShadow !== false}
            onChange={(v) => set('flipShadow', v)}
            size="md"
            accentColor="#60a5fa"
          />
        </label>

        <label className="ie-opt-row ie-opt-inline">
          <div className="ie-opt-text">
            <div className="ie-opt-label">Flip animation speed</div>
            <div className="ie-opt-desc">How fast the page turns (ms).</div>
          </div>
          <SelectInputView
            options={[
              { value: '600', label: 'Fast (600ms)' },
              { value: '900', label: 'Normal (900ms)' },
              { value: '1200', label: 'Slow (1200ms)' },
            ]}
            value={String(prefs.flipSpeed || 900)}
            onChange={(v) => set('flipSpeed', Number(v))}
            size="sm"
          />
        </label>
      </div>

      <div className="ie-save-row">
        <SaveButton onSave={save} label="Save reader settings" />
      </div>
    </div>
    </div>
  );
}

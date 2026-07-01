/**
 * LibraryConfig — reader / flip-book settings.
 * Configures which page-turn experience to use when opening a book.
 */
import { SelectInputView, ToggleSwitchView } from '@salilvnair/dui';
import { SettingsPanelHeader } from './SettingsPanelHeader';
import { usePrefsStore } from '../../store/prefs-store';
import { SaveButton } from '../SaveButton';

export function LibraryConfig() {
  const { prefs, set, save } = usePrefsStore();

  return (
    <div className="story-tab-scroll">
    <div className="bs-settings-pane ie-pane">
      <SettingsPanelHeader icon="📚" title="Library Config" subtitle="Choose how storybooks open — classic 3D flip or realistic page-curl animation." />

      <div className="ie-opts">
        <label className="ie-opt-row ie-opt-inline">
          <div className="ie-opt-text">
            <div className="ie-opt-label">Reader mode</div>
            <div className="ie-opt-desc">Both use the physical page-flip book. 3D turns every page rigidly (like the cover); Page Flip lets the inner pages curl softly.</div>
          </div>
          <SelectInputView
            options={[
              { value: 'pageflip', label: 'Page Flip (physical curl)' },
              { value: 'classic', label: '3D (rigid page turn)' },
            ]}
            value={prefs.readerMode || 'pageflip'}
            onChange={(v) => set('readerMode', v as 'classic' | 'pageflip')}
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
            <div className="ie-opt-desc">Render drop shadows during the flip animation (Page Flip mode).</div>
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
            <div className="ie-opt-desc">How fast the page turns in Page Flip mode (ms).</div>
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

        <label className="ie-opt-row ie-opt-inline">
          <div className="ie-opt-text">
            <div className="ie-opt-label">Max image variants per page</div>
            <div className="ie-opt-desc">How many generated image variants to keep per page in the Variant Gallery (stored in DB).</div>
          </div>
          <SelectInputView
            options={[
              { value: '1', label: '1 variant' },
              { value: '2', label: '2 variants' },
              { value: '3', label: '3 variants' },
              { value: '4', label: '4 variants' },
            ]}
            value={String(prefs.maxVariants ?? 4)}
            onChange={(v) => set('maxVariants', Number(v))}
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

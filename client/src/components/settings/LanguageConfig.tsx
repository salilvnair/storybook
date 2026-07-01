/**
 * Language Config — enable/disable + drag-reorder the translation target
 * languages shown in the reader's Language panel. Indian languages lead the
 * defaults. Uses the DUI RearrangeView.
 */
import { ButtonView, RearrangeView, type RearrangeItem } from '@salilvnair/dui';
import { useLanguageConfigStore, type LangOption } from '../../store/language-config-store';
import { SettingsPanelHeader } from './SettingsPanelHeader';

export function LanguageConfig() {
  const { languages, setAll, reset } = useLanguageConfigStore();
  const enabledCount = languages.filter((l) => l.enabled).length;

  const items: RearrangeItem[] = languages.map((l) => ({
    id: l.id,
    label: l.translateAs ? `${l.label}  ·  ${l.translateAs.length > 48 ? l.translateAs.slice(0, 46) + '…' : l.translateAs}` : l.label,
    icon: '🌐',
    enabled: l.enabled,
  }));

  const onChange = (next: RearrangeItem[]) => {
    // Map back to LangOption order + enabled flags (preserve translateAs etc.).
    const byId = new Map(languages.map((l) => [l.id, l]));
    const out: LangOption[] = next.map((i) => ({ ...(byId.get(i.id) as LangOption), enabled: i.enabled !== false }));
    setAll(out);
  };

  return (
    <div className="story-tab-scroll">
      <div className="prov-page">
        <SettingsPanelHeader
          icon="🌍"
          title="Language Config"
          subtitle="Choose which translation languages appear in the reader (and their order). Drag to reorder, toggle to enable/disable. Indian languages lead the list."
          action={<ButtonView size="sm" variant="secondary" onClick={reset}>Reset to defaults</ButtonView>}
        />

        <div className="story-settings-card" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="gen-card-title" style={{ margin: 0 }}>Translation languages</span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{enabledCount} of {languages.length} enabled</span>
          </div>

          <RearrangeView
            items={items}
            onChange={onChange}
            selectable
            accentColor="var(--story-accent-3)"
            size="md"
          />

          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 12, lineHeight: 1.5 }}>
            <b>Manglish</b> = Malayalam written in English letters (romanised transliteration), not Malayalam script.
            Enabled languages appear — in this order — in the reader's <b>🌍 Language</b> panel.
          </p>
        </div>
      </div>
    </div>
  );
}

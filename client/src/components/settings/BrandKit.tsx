/**
 * S25.04 — Brand Kit settings panel. Full-width redesign.
 */
import { useBrandKitStore, FONT_OPTIONS } from '../../store/brandkit-store';
import { SelectInputView, ButtonView } from '@salilvnair/dui';

const FONT_PREVIEWS: Record<string, string> = {
  'Georgia, serif': 'Georgia',
  '"Palatino Linotype", Palatino, serif': 'Palatino',
  '"Times New Roman", Times, serif': 'Times New Roman',
  'Arial, Helvetica, sans-serif': 'Arial',
  '"Trebuchet MS", sans-serif': 'Trebuchet',
  '"Comic Sans MS", cursive': 'Comic Sans',
  'Verdana, sans-serif': 'Verdana',
  '"Courier New", Courier, monospace': 'Courier New',
};

export function BrandKit() {
  const { kit, set, reset } = useBrandKitStore();

  return (
    <div className="story-tab-scroll bk2-root">
      {/* ── Header ── */}
      <div className="bk2-header">
        <div className="bk2-header-left">
          <div className="bk2-title">🎨 Brand Kit</div>
          <p className="bk2-subtitle">Visual identity defaults for the Page Designer — fonts, colours, and shape settings.</p>
        </div>
        <ButtonView size="sm" variant="secondary" onClick={reset}>Reset to defaults</ButtonView>
      </div>

      {/* ── Main grid ── */}
      <div className="bk2-grid">

        {/* ── Typography ── */}
        <div className="bk2-card">
          <div className="bk2-card-title">Aa Typography</div>

          <div className="bk2-font-grid">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                className={`bk2-font-chip${kit.bodyFont === f.value ? ' is-body' : ''}${kit.headingFont === f.value ? ' is-heading' : ''}`}
                style={{ fontFamily: f.value }}
                onClick={() => {
                  if (kit.bodyFont === f.value) set({ bodyFont: kit.headingFont });
                  else set({ bodyFont: f.value });
                }}
                title={`Set as body font: ${FONT_PREVIEWS[f.value] ?? f.label}`}
              >
                <span className="bk2-font-name">{FONT_PREVIEWS[f.value] ?? f.label}</span>
                <span className="bk2-font-sample" style={{ fontFamily: f.value }}>Aa</span>
                <span className="bk2-font-badges">
                  {kit.bodyFont === f.value && <span className="bk2-badge body">body</span>}
                  {kit.headingFont === f.value && <span className="bk2-badge heading">heading</span>}
                </span>
              </button>
            ))}
          </div>

          <div className="bk2-font-selects">
            <label className="bk2-label">
              Body font
              <SelectInputView value={kit.bodyFont} options={FONT_OPTIONS} onChange={(v) => set({ bodyFont: v })} />
            </label>
            <label className="bk2-label">
              Heading font
              <SelectInputView value={kit.headingFont} options={FONT_OPTIONS} onChange={(v) => set({ headingFont: v })} />
            </label>
          </div>
        </div>

        {/* ── Colours ── */}
        <div className="bk2-card">
          <div className="bk2-card-title">🎨 Colours</div>

          <div className="bk2-color-grid">
            <div className="bk2-color-swatch-wrap">
              <div className="bk2-swatch-preview" style={{ background: kit.accentColor }} />
              <div className="bk2-swatch-info">
                <span className="bk2-swatch-label">Accent</span>
                <span className="bk2-swatch-hex">{kit.accentColor}</span>
              </div>
              <input type="color" className="bk2-color-input" value={kit.accentColor}
                onChange={(e) => set({ accentColor: e.target.value })} />
            </div>

            <div className="bk2-color-swatch-wrap">
              <div className="bk2-swatch-preview" style={{ background: kit.textColor }} />
              <div className="bk2-swatch-info">
                <span className="bk2-swatch-label">Text</span>
                <span className="bk2-swatch-hex">{kit.textColor}</span>
              </div>
              <input type="color" className="bk2-color-input"
                value={kit.textColor.startsWith('#') ? kit.textColor : '#2e2426'}
                onChange={(e) => set({ textColor: e.target.value })} />
            </div>

            <div className="bk2-color-swatch-wrap">
              <div className="bk2-swatch-preview" style={{ background: kit.backgroundColor }} />
              <div className="bk2-swatch-info">
                <span className="bk2-swatch-label">Fill / BG</span>
                <span className="bk2-swatch-hex">{kit.backgroundColor.startsWith('rgba') ? 'Custom' : kit.backgroundColor}</span>
              </div>
              <input type="color" className="bk2-color-input"
                value={kit.backgroundColor.startsWith('rgba') ? '#fffded' : kit.backgroundColor}
                onChange={(e) => set({ backgroundColor: e.target.value })} />
            </div>
          </div>

          {/* Sliders */}
          <div className="bk2-slider-group">
            <div className="bk2-slider-row">
              <div className="bk2-slider-meta">
                <span className="bk2-slider-label">Border radius</span>
                <span className="bk2-slider-val">{kit.borderRadius}px</span>
              </div>
              <input type="range" min="0" max="40" step="1" value={kit.borderRadius}
                onChange={(e) => set({ borderRadius: Number(e.target.value) })}
                style={{ '--bk-accent': kit.accentColor } as React.CSSProperties} />
            </div>
            <div className="bk2-slider-row">
              <div className="bk2-slider-meta">
                <span className="bk2-slider-label">Default opacity</span>
                <span className="bk2-slider-val">{Math.round(kit.defaultOpacity * 100)}%</span>
              </div>
              <input type="range" min="0.1" max="1" step="0.05" value={kit.defaultOpacity}
                onChange={(e) => set({ defaultOpacity: Number(e.target.value) })}
                style={{ '--bk-accent': kit.accentColor } as React.CSSProperties} />
            </div>
          </div>

          {/* ── Live Preview (inline, below sliders) ── */}
          <div className="bk2-preview-inner">
            <div className="bk2-preview-label">Live Preview</div>
            <div
              className="bk2-preview-box"
              style={{
                fontFamily: kit.bodyFont,
                color: kit.textColor,
                background: kit.backgroundColor,
                borderRadius: kit.borderRadius,
                opacity: kit.defaultOpacity,
                borderColor: kit.accentColor,
              }}
            >
              <div className="bk2-preview-heading" style={{ fontFamily: kit.headingFont, color: kit.accentColor }}>
                Storybook Title
              </div>
              <p className="bk2-preview-body">The quick brown fox jumped over the lazy dog. A storybook page would appear here with narration text.</p>
              <div className="bk2-preview-bubble" style={{ borderColor: kit.accentColor, color: kit.textColor }}>
                💬 "Did you see that?" said the fox.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * S26 — Template & Style Sharing. Full-width redesign.
 */
import { useRef, useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { useTemplatesStore } from '../../store/templates-store';
import { usePalettesStore } from '../../store/palettes-store';
import { useBrandKitStore } from '../../store/brandkit-store';
import { usePacksStore, type StorybuddyFile, type StorybuddyPack } from '../../store/packs-store';
import { STYLE_PRESETS } from '../../constants/style-presets';
import { DownloadIcon, TrashIcon } from '../../icons';

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('My Pack');
  const [desc, setDesc] = useState('');
  const [author, setAuthor] = useState('');
  const [includeTemplates, setIncludeTemplates] = useState(true);
  const [includePalettes, setIncludePalettes] = useState(true);
  const [includeBrandKit, setIncludeBrandKit] = useState(true);
  const [includeStyles, setIncludeStyles] = useState(false);

  const { saved: templates } = useTemplatesStore();
  const { palettes } = usePalettesStore();
  const { kit } = useBrandKitStore();

  const exportPack = () => {
    const pack: StorybuddyFile = {
      type: 'storybuddy-pack',
      version: '1.0',
      name,
      description: desc,
      author: author || undefined,
      exportedAt: new Date().toISOString(),
      templates: includeTemplates ? templates.map((t) => ({ name: t.name, spec: t.spec })) : undefined,
      palettes: includePalettes ? palettes.map((p) => ({ name: p.name, colors: p.colors })) : undefined,
      artStyles: includeStyles ? STYLE_PRESETS : undefined,
      brandKit: includeBrandKit ? kit : undefined,
    };
    const json = JSON.stringify(pack, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, '_')}.storybuddy`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div className="pb2-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pb2-modal">
        <div className="pb2-modal-head">
          <span className="pb2-modal-title">📦 Export Pack</span>
          <button className="pb2-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pb2-modal-body">
          <div className="pb2-field"><label className="pb2-label">Pack name</label><TextInputView value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} placeholder="My Pack" /></div>
          <div className="pb2-field"><label className="pb2-label">Description</label><TextInputView value={desc} onChange={(e) => setDesc((e.target as HTMLInputElement).value)} placeholder="A short description of this pack" /></div>
          <div className="pb2-field"><label className="pb2-label">Author (optional)</label><TextInputView value={author} onChange={(e) => setAuthor((e.target as HTMLInputElement).value)} placeholder="Your name" /></div>

          <div className="pb2-include-head">What to include</div>
          <div className="pb2-checks">
            <label className="pb2-check"><input type="checkbox" checked={includeTemplates} onChange={(e) => setIncludeTemplates(e.target.checked)} /> <span>Templates</span> <span className="pb2-check-count">{templates.length}</span></label>
            <label className="pb2-check"><input type="checkbox" checked={includePalettes} onChange={(e) => setIncludePalettes(e.target.checked)} /> <span>Palettes</span> <span className="pb2-check-count">{palettes.length}</span></label>
            <label className="pb2-check"><input type="checkbox" checked={includeBrandKit} onChange={(e) => setIncludeBrandKit(e.target.checked)} /> <span>Brand Kit</span></label>
            <label className="pb2-check"><input type="checkbox" checked={includeStyles} onChange={(e) => setIncludeStyles(e.target.checked)} /> <span>Art styles</span> <span className="pb2-check-count">{STYLE_PRESETS.length}</span></label>
          </div>
        </div>
        <div className="pb2-modal-foot">
          <ButtonView size="sm" variant="secondary" onClick={onClose}>Cancel</ButtonView>
          <ButtonView size="sm" accentColor="#10b981" iconLeft={<DownloadIcon size={13} />} onClick={exportPack}>Download .storybuddy</ButtonView>
        </div>
      </div>
    </div>
  );
}

function ApplyModal({ pack, onClose }: { pack: StorybuddyPack; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const templates = useTemplatesStore();
  const palettes = usePalettesStore();
  const { set: setBrandKit } = useBrandKitStore();
  const { addCustomStyle } = usePacksStore();

  const apply = async () => {
    setBusy(true);
    if (pack.templates) for (const t of pack.templates) await templates.save(t.name, t.spec);
    if (pack.palettes) for (const p of pack.palettes) await palettes.add(p.name, p.colors);
    if (pack.brandKit) setBrandKit(pack.brandKit);
    if (pack.artStyles) for (const s of pack.artStyles) addCustomStyle(s);
    setBusy(false);
    setDone(true);
  };

  return (
    <div className="pb2-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pb2-modal">
        <div className="pb2-modal-head">
          <span className="pb2-modal-title">📦 Apply — {pack.name}</span>
          <button className="pb2-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pb2-modal-body">
          {done ? (
            <div className="pb2-done">
              <div className="pb2-done-icon">✅</div>
              <div className="pb2-done-msg">Pack applied! Templates, palettes, and brand kit updated.</div>
            </div>
          ) : (
            <>
              <p className="pb2-apply-desc">{pack.description || 'No description.'}</p>
              {pack.author && <p className="pb2-meta">By {pack.author} · Exported {formatDate(pack.exportedAt)}</p>}
              <div className="pb2-include-head">This pack includes</div>
              <div className="pb2-items">
                {pack.templates && <div className="pb2-item">📐 {pack.templates.length} template(s)</div>}
                {pack.palettes && <div className="pb2-item">🎨 {pack.palettes.length} palette(s)</div>}
                {pack.brandKit && <div className="pb2-item">🖌 Brand kit overrides</div>}
                {pack.artStyles && <div className="pb2-item">🎭 {pack.artStyles.length} art style(s)</div>}
              </div>
            </>
          )}
        </div>
        <div className="pb2-modal-foot">
          {done ? (
            <ButtonView size="sm" accentColor="#10b981" onClick={onClose}>Done</ButtonView>
          ) : (
            <>
              <ButtonView size="sm" variant="secondary" onClick={onClose}>Cancel</ButtonView>
              <ButtonView size="sm" accentColor="#10b981" onClick={() => void apply()} disabled={busy}>
                {busy ? 'Applying…' : '✅ Apply pack'}
              </ButtonView>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PackBrowser() {
  const { packs, install, remove } = usePacksStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);
  const [applyPack, setApplyPack] = useState<StorybuddyPack | null>(null);
  const [importError, setImportError] = useState('');

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as StorybuddyFile;
        if (json.type !== 'storybuddy-pack') { setImportError('Not a valid .storybuddy file.'); return; }
        const id = install(json);
        const installed = usePacksStore.getState().packs.find((p) => p.id === id);
        if (installed) setApplyPack(installed);
        setImportError('');
      } catch {
        setImportError('Could not parse file — make sure it is a valid .storybuddy JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="story-tab-scroll pb2-root">
      {/* ── Hero ── */}
      <div className="pb2-hero">
        <div className="pb2-hero-left">
          <div className="pb2-hero-title">📦 Pack Gallery</div>
          <p className="pb2-hero-sub">Export your templates, palettes, and brand kit as a shareable <code>.storybuddy</code> file. Import packs from others and apply in one click.</p>
        </div>
        <div className="pb2-hero-actions">
          <ButtonView size="sm" variant="secondary" iconLeft={<span>⬆</span>} onClick={() => setShowExport(true)}>Export pack</ButtonView>
          <ButtonView size="sm" accentColor="#10b981" iconLeft={<span>⬇</span>} onClick={() => fileRef.current?.click()}>Import pack</ButtonView>
          <input ref={fileRef} type="file" accept=".storybuddy,.json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>

      {importError && <div className="pb2-error">{importError}</div>}

      {/* ── Grid or empty ── */}
      {packs.length === 0 ? (
        <div className="pb2-empty">
          <div className="pb2-empty-icon">📭</div>
          <div className="pb2-empty-title">No packs installed yet</div>
          <p className="pb2-empty-sub">Import a <code>.storybuddy</code> file from the community or export your own to share.</p>
        </div>
      ) : (
        <div className="pb2-grid">
          {packs.map((pack) => (
            <div key={pack.id} className="pb2-card">
              <div className="pb2-card-glow" />
              <div className="pb2-card-top">
                <div className="pb2-card-icon">📦</div>
                <div className="pb2-card-info">
                  <div className="pb2-card-name">{pack.name}</div>
                  {pack.author && <div className="pb2-card-author">by {pack.author}</div>}
                </div>
              </div>
              <p className="pb2-card-desc">{pack.description || 'No description.'}</p>
              <div className="pb2-card-tags">
                {pack.templates && <span className="pb2-tag">📐 {pack.templates.length}</span>}
                {pack.palettes && <span className="pb2-tag">🎨 {pack.palettes.length}</span>}
                {pack.brandKit && <span className="pb2-tag">🖌 Kit</span>}
                {pack.artStyles && <span className="pb2-tag">🎭 {pack.artStyles.length}</span>}
              </div>
              <div className="pb2-card-foot">
                <span className="pb2-card-date">Installed {formatDate(pack.installedAt)}</span>
                <div className="pb2-card-actions">
                  <ButtonView size="sm" accentColor="#10b981" onClick={() => setApplyPack(pack)}>Apply</ButtonView>
                  <ButtonView size="sm" variant="secondary" iconLeft={<TrashIcon size={12} />} onClick={() => remove(pack.id)} accentColor="#f87171" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {applyPack && <ApplyModal pack={applyPack} onClose={() => setApplyPack(null)} />}
    </div>
  );
}

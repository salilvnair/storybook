/**
 * PhotoHeroModal — Sprint 15: upload a photo, generate cartoon variants via
 * the local image engine (privacy-first), pick one as the character's reference.
 *
 * The photo is sent to the local engine (localhost/LAN only) in memory — it is
 * never written to disk server-side, and raw photos never leave the device.
 */
import { useState, useRef } from 'react';
import { ModalView, ButtonView, CheckboxView } from '@salilvnair/dui';
import { CameraIcon } from '../../icons';
import { usePromptsStore, promptDefault } from '../../store/prompts-store';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms a variant — passes the chosen image_b64 */
  onSelect: (image_b64: string) => void;
  characterName?: string;
}

type Step = 'upload' | 'generating' | 'pick';

export function PhotoHeroModal({ open, onClose, onSelect, characterName }: Props) {
  const sceneStyle = usePromptsStore((s) => s.values['sceneStyle'] || promptDefault('sceneStyle'));
  const [step, setStep] = useState<Step>('upload');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [consent, setConsent] = useState(false);
  const [variants, setVariants] = useState<{ image_b64: string; seed?: number }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setStep('upload');
    setPhoto(null);
    setPhotoName('');
    setConsent(false);
    setVariants([]);
    setChosen(null);
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setPhoto((e.target?.result as string) ?? null);
    reader.readAsDataURL(file);
    setError(null);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  const generate = async () => {
    if (!photo || !consent) return;
    setStep('generating');
    setError(null);
    try {
      const res = await fetch('/api/storybook/photo-to-hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_b64: photo.split(',')[1] ?? photo,
          consentGiven: true,
          variantCount: 4,
          artStyle: sceneStyle || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresLocal) {
          setError('Photo → Hero requires a local image engine (localhost / LAN). Set a local engine URL in Settings → Image Engine.');
        } else {
          setError(data.error || 'Generation failed.');
        }
        setStep('upload');
        return;
      }
      setVariants(data.variants || []);
      setChosen(null);
      setStep('pick');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setStep('upload');
    }
  };

  const confirm = () => {
    if (!chosen) return;
    onSelect(chosen);
    handleClose();
  };

  return (
    <ModalView
      open={open}
      onClose={handleClose}
      title="📸 Photo → Hero"
      subtitle={characterName ? `Generate a cartoon likeness for ${characterName}` : 'Generate a cartoon likeness from a photo'}
      size="md"
      headerColor="#34d399"
      footerRight={
        step === 'pick' && chosen ? (
          <ButtonView size="md" accentColor="#34d399" onClick={confirm}>
            Use as Reference Image
          </ButtonView>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Privacy badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
          borderRadius: 8, padding: '8px 12px',
        }}>
          <span style={{ fontSize: 16 }}>🔒</span>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            <b style={{ color: '#34d399' }}>Privacy-first.</b> Photos are sent only to your local engine
            (localhost / LAN), processed in memory, and never written to disk.
            The raw photo never leaves this machine.
          </div>
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <>
            {/* Drop zone */}
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !photo && fileRef.current?.click()}
              style={{
                border: `2px dashed ${photo ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 10, padding: 20,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, minHeight: 140, cursor: photo ? 'default' : 'pointer',
                background: photo ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.02)',
                transition: 'border-color 200ms, background 200ms',
              }}
            >
              {photo ? (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <img src={photo} alt="uploaded"
                    style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '2px solid rgba(52,211,153,0.4)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                      {photoName || 'Photo ready'}
                    </span>
                    <ButtonView size="sm" onClick={() => { setPhoto(null); fileRef.current?.click(); }}>
                      Change photo
                    </ButtonView>
                  </div>
                </div>
              ) : (
                <>
                  <CameraIcon size={32} style={{ color: 'rgba(255,255,255,0.25)' }} />
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    <div>Drop a photo here, or click to browse</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG, WEBP</div>
                  </div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileInput} />

            {/* Consent */}
            {photo && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <CheckboxView
                  checked={consent}
                  onChange={(v) => setConsent(v)}
                  size="sm"
                />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, paddingTop: 2 }}>
                  I consent to this photo being sent to my local image engine to generate a cartoon likeness.
                  I confirm this is a photo of my child or that I have permission to use it.
                </span>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '8px 10px' }}>
                {error}
              </div>
            )}

            {photo && (
              <ButtonView
                size="md"
                accentColor="#34d399"
                disabled={!consent}
                onClick={generate}
              >
                ✨ Generate Hero
              </ButtonView>
            )}
          </>
        )}

        {/* Generating */}
        {step === 'generating' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
            <span className="story-progress-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Generating cartoon variants from your photo…
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              This may take 20–60s per variant depending on your local engine.
            </div>
          </div>
        )}

        {/* Variants picker */}
        {step === 'pick' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Pick the best likeness — it becomes the character's reference image.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {variants.map((v, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setChosen(v.image_b64)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setChosen(v.image_b64); }}
                  style={{
                    borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    border: `2px solid ${chosen === v.image_b64 ? '#34d399' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'border-color 150ms',
                    boxShadow: chosen === v.image_b64 ? '0 0 0 3px rgba(52,211,153,0.25)' : 'none',
                  }}
                >
                  <img
                    src={`data:image/png;base64,${v.image_b64}`}
                    alt={`Variant ${i + 1}`}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ))}
            </div>
            <ButtonView size="sm" variant="secondary" onClick={reset} style={{ marginTop: 4 }}>
              Start over
            </ButtonView>
          </>
        )}
      </div>
    </ModalView>
  );
}

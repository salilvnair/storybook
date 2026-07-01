/**
 * S25.03 — Per-page variant gallery.
 * Shows up to 4 previously-generated image variants for a page.
 * "Generate variant" regenerates the page and stores the result as a variant.
 * Clicking a thumbnail applies it as the active page image.
 */
import { ModalView, ButtonView } from '@salilvnair/dui';
import { usePageDesignStore } from '../../store/page-design-store';
import { useStoryStore } from '../../store/story-store';
import { usePrefsStore } from '../../store/prefs-store';

interface Props {
  storyId: string;
  pageIdx: number;     // 0=cover, 1..N=scene pages
  currentImage: string;
  onClose: () => void;
}

export function VariantGallery({ storyId, pageIdx, currentImage, onClose }: Props) {
  const store = usePageDesignStore();
  const variants = store.getVariants(storyId, pageIdx);
  const maxVariants = usePrefsStore((s) => s.prefs.maxVariants ?? 4);
  const { regeneratePage, regenerateCover, regenerating, regeneratingCover, pages } = useStoryStore();

  const isRegen = pageIdx === 0 ? regeneratingCover : regenerating === pageIdx - 1;

  const generateVariant = async () => {
    // Capture the current image before regen
    const before = pageIdx === 0 ? currentImage : (pages[pageIdx - 1]?.image_b64 || '');
    if (before) store.addVariant(storyId, pageIdx, before);

    // Regenerate with fresh seed
    if (pageIdx === 0) {
      await regenerateCover();
    } else {
      await regeneratePage(pageIdx - 1);
    }
    // After regen, the store's pages array is updated; grab it
    const after = useStoryStore.getState().pages[pageIdx - 1]?.image_b64 ?? '';
    if (after && after !== before) store.addVariant(storyId, pageIdx, after);
  };

  const applyVariant = (img: string) => {
    // Swap the selected variant in as the active page image
    if (pageIdx === 0) {
      useStoryStore.setState({ cover: img });
    } else {
      const pages = useStoryStore.getState().pages;
      const next = pages.map((p, i) => i === pageIdx - 1 ? { ...p, image_b64: img } : p);
      useStoryStore.setState({ pages: next });
    }
    // Also capture current image as a variant
    if (currentImage && !variants.includes(currentImage)) {
      store.addVariant(storyId, pageIdx, currentImage);
    }
  };

  const allVariants = [currentImage, ...variants].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, maxVariants);

  return (
    <ModalView
      open
      onClose={onClose}
      title={`🖼 Image Variants — Page ${pageIdx === 0 ? 'Cover' : pageIdx}`}
      subtitle="Click a variant to set it as the active image."
      size="md"
      headerColor="var(--story-accent-3)"
      headerGradient
      footerRight={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {allVariants.length >= maxVariants && (
            <ButtonView size="md" variant="secondary" onClick={() => store.clearVariants(storyId, pageIdx)}>Clear all</ButtonView>
          )}
          <ButtonView
            size="md" accentColor="var(--story-accent-3)"
            disabled={isRegen || allVariants.length >= maxVariants}
            loading={isRegen}
            onClick={() => void generateVariant()}
          >
            {allVariants.length >= maxVariants ? `${maxVariants} / ${maxVariants} variants` : '✨ Generate variant'}
          </ButtonView>
        </div>
      }
    >
        <div className="vg-grid">
          {Array.from({ length: maxVariants }).map((_, i) => {
            const img = allVariants[i];
            const isCurrent = img === currentImage;
            return (
              <div key={i} className={`vg-thumb${isCurrent ? ' vg-thumb-active' : ''}`} onClick={() => img && applyVariant(img)}>
                {img ? (
                  <>
                    <img src={img} alt={`Variant ${i + 1}`} />
                    {isCurrent && <div className="vg-current-badge">Current</div>}
                  </>
                ) : (
                  <div className="vg-empty-slot">—</div>
                )}
              </div>
            );
          })}
        </div>

    </ModalView>
  );
}

/**
 * BookFlip — the Library reader entry point. The old custom CSS leaf-flip
 * ("classic 3D") is gone; both reader modes now run on react-pageflip via the
 * shared FlipBook. This is kept as a thin alias so LibraryTab's import is stable.
 */
import { PageFlipBook } from './PageFlipBook';

interface Props { storyId: string; pageCount: number; title: string }

export function BookFlip({ storyId, pageCount, title }: Props) {
  return <PageFlipBook storyId={storyId} pageCount={pageCount} title={title} />;
}

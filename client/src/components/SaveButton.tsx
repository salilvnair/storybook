/**
 * SaveButton — a DUI ButtonView that runs a save action and then flips to a
 * green "Saved ✓" state with a little pop animation for ~1.6s. Reusable across
 * settings so persisting feels explicit and satisfying.
 */
import { useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { SaveIcon, CheckIcon } from '../icons';

interface Props {
  onSave: () => void | Promise<void>;
  label?: string;
  savedLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  accentColor?: string;
}

export function SaveButton({ onSave, label = 'Save', savedLabel = 'Saved', size = 'md', accentColor = 'var(--story-accent-3)' }: Props) {
  const [saved, setSaved] = useState(false);

  const click = async () => {
    try { await onSave(); } catch { /* surfaced by caller */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <span className={`save-btn-wrap${saved ? ' is-saved' : ''}`}>
      <ButtonView
        size={size}
        accentColor={saved ? '#34d399' : accentColor}
        iconLeft={saved ? <CheckIcon size={14} /> : <SaveIcon size={14} />}
        onClick={click}
      >
        {saved ? savedLabel : label}
      </ButtonView>
    </span>
  );
}

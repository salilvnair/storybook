/** BrandLogo — the iStorybook mark: an open book with a sparkle, sized by prop. */
type Props = { size?: number; className?: string };

export function BrandLogo({ size = 28, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-label="iStorybook">
      {/* open book — two pages meeting at the spine */}
      <path
        d="M16 9.2C12.7 7.4 8.3 6.9 5 7.4v15.9c3.3-.5 7.7 0 11 1.9V9.2Z"
        fill="#fff" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round"
      />
      <path
        d="M16 9.2C19.3 7.4 23.7 6.9 27 7.4v15.9c-3.3-.5-7.7 0-11 1.9V9.2Z"
        fill="#ffffff" fillOpacity="0.92" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round"
      />
      {/* spine */}
      <path d="M16 9.4v15.6" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.1" strokeLinecap="round" />
      {/* text lines on the pages */}
      <g stroke="currentColor" strokeOpacity="0.34" strokeWidth="1" strokeLinecap="round">
        <path d="M8 12.4c2 -.3 4 -.1 5.4 .6" />
        <path d="M8 15.6c2 -.3 4 -.1 5.4 .6" />
        <path d="M18.6 13c1.4 -.7 3.4 -.9 5.4 -.6" />
        <path d="M18.6 16.2c1.4 -.7 3.4 -.9 5.4 -.6" />
      </g>
      {/* sparkle (the magic) */}
      <path
        d="M24.5 3.4l.86 2.04 2.04.86-2.04.86-.86 2.04-.86-2.04L21.6 6.3l2.04-.86.86-2.04Z"
        fill="#fff"
      />
    </svg>
  );
}

/** Lightweight stroke icon set (daakia-style), currentColor, sized by prop. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

export const BookIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M18 17H6a2 2 0 0 0-2 2" /></Svg>
);
// Panel show/hide toggles (ported from DUI daakia-icons: SidebarLeftIcon / SidebarRightIcon)
export const SidebarLeftIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><rect x="3" y="3" width="6" height="18" rx="2" fill="currentColor" stroke="none" fillOpacity={0.35} /></Svg>
);
export const SidebarRightIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /><rect x="15" y="3" width="6" height="18" rx="2" fill="currentColor" stroke="none" fillOpacity={0.35} /></Svg>
);
// Layer/context-menu icons (ported from DUI daakia-icons)
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></Svg>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Svg>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Svg>
);
export const MoreHorizontalIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></Svg>
);
export const PasteIcon = (p: IconProps) => (
  <Svg {...p}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></Svg>
);
export const DuplicateIcon = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
);
export const PaletteIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.5-2 4-4 4h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 21z" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" /><circle cx="12" cy="7.5" r="1" fill="currentColor" /><circle cx="16.5" cy="10.5" r="1" fill="currentColor" /></Svg>
);
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 14H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6h.09A1.65 1.65 0 0 0 12 3a2 2 0 0 1 4 0v.09c.6.24 1.27.1 1.73-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.6.86 1 1.5 1H21a2 2 0 0 1 0 4h-.09c-.64 0-1.26.4-1.5 1z" /></Svg>
);
export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>
);
export const DatabaseIcon = (p: IconProps) => (
  <Svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /></Svg>
);
export const ScrollIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 3h11a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2z" /><path d="M8 7h8M8 11h8M8 15h5" /></Svg>
);
export const CpuIcon = (p: IconProps) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></Svg>
);
export const WandIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 4V2M15 10V8M12.5 5.5h-2M19.5 5.5h-2M5 19l9-9M17 7l2-2" /></Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>
);
export const PlusIcon = (p: IconProps) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>);
export const CloseIcon = (p: IconProps) => (<Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Svg>
);
export const StarIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l2.9 5.9 6.1.9-4.4 4.3 1 6.1L12 17.8 6.4 20.2l1-6.1L3 9.8l6.1-.9z" /></Svg>
);
export const ChevronRightIcon = (p: IconProps) => (<Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>);
export const SearchIcon = (p: IconProps) => (<Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></Svg>);
export const ChevronLeftIcon = (p: IconProps) => (<Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>);
export const CheckIcon = (p: IconProps) => (<Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
);
export const CloseCircleIcon = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></Svg>);
export const ArrowToRightIcon = (p: IconProps) => (<Svg {...p}><path d="M4 12h12M11 7l5 5-5 5M20 5v14" /></Svg>);
export const ArrowToLeftIcon = (p: IconProps) => (<Svg {...p}><path d="M20 12H8M13 7l-5 5 5 5M4 5v14" /></Svg>);
export const SaveIcon = (p: IconProps) => (
  <Svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></Svg>
);
export const DownloadIcon = (p: IconProps) => (<Svg {...p}><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></Svg>);
export const RefreshIcon = (p: IconProps) => (<Svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 7M21 3v4h-4" /></Svg>);
export const MoreVertIcon = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" /></Svg>);
export const ArchiveIcon = (p: IconProps) => (<Svg {...p}><path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z" /><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" /><path d="M10 13h4" /></Svg>);
export const PrintIcon = (p: IconProps) => (<Svg {...p}><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" /><path d="M6 14h12v6H6z" /></Svg>);
export const UnarchiveIcon = (p: IconProps) => (<Svg {...p}><path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z" /><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" /><path d="M12 13v4M10 15l2-2 2 2" /></Svg>);
export const UserIcon = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></Svg>);
export const UsersIcon = (p: IconProps) => (<Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M21 20c0-2.5-1.8-4.5-4-4.5" /></Svg>);
export const LockIcon = (p: IconProps) => (<Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>);
export const DnaIcon = (p: IconProps) => (<Svg {...p}><path d="M2 15c6.667-6 13.333 0 20-6M2 9c6.667 6 13.333 0 20 6M5 12h.01M19 12h.01" /></Svg>);
export const CameraIcon = (p: IconProps) => (<Svg {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></Svg>);
export const MicIcon = (p: IconProps) => (<Svg {...p}><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3M9 22h6" /></Svg>);
export const VolumeIcon = (p: IconProps) => (<Svg {...p}><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" /></Svg>);
export const MusicIcon = (p: IconProps) => (<Svg {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>);
export const GlobeIcon = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Svg>);
export const PlugIcon = (p: IconProps) => (<Svg {...p}><path d="M7 2v4M17 2v4M8 10h8M7 6h10a2 2 0 0 1 2 2v2a6 6 0 0 1-12 0V8a2 2 0 0 1 2-2z" /><path d="M12 16v4" /></Svg>);
export const WorkflowIcon = (p: IconProps) => (<Svg {...p}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="9" y="15" width="6" height="6" rx="1" /><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9" /></Svg>);
export const BarChartIcon = (p: IconProps) => (<Svg {...p}><path d="M18 20V10M12 20V4M6 20v-6" /></Svg>);
export const CodeIcon = (p: IconProps) => (<Svg {...p}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></Svg>);
export const HeartIcon = (p: IconProps) => (<Svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></Svg>);
export const InfinityIcon = (p: IconProps) => (<Svg {...p}><path d="M12 12c-2-2.5-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.5 6-4zM12 12c2 2.5 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.5-6 4z" /></Svg>);
export const PencilIcon  = (p: IconProps) => (<Svg {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></Svg>);
export const EraserIcon  = (p: IconProps) => (<Svg {...p}><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></Svg>);
export const UndoIcon    = (p: IconProps) => (<Svg {...p}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></Svg>);
export const ZoomInIcon  = (p: IconProps) => (<Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /><path d="M8 11h6M11 8v6" /></Svg>);
export const ZoomOutIcon = (p: IconProps) => (<Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M8 11h6" /></Svg>);
export const ExpandIcon  = (p: IconProps) => (<Svg {...p}><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 1-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" /></Svg>);
export const AgentIcon    = (p: IconProps) => (<Svg {...p}><path d="M6 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6z" /><path d="M12 2v2" /><path d="M9 12v9" /><path d="M15 12v9" /><path d="M5 16l4-2" /><path d="M15 14l4 2" /><path d="M9 18h6" /><path d="M10 8v.01" /><path d="M14 8v.01" /></Svg>);
export const RotateCWIcon  = (p: IconProps) => (<Svg {...p}><path d="M21 2v6h-6" /><path d="M21 8a9 9 0 1 1-9-9" /></Svg>);
export const FlipHIcon     = (p: IconProps) => (<Svg {...p}><path d="M3 12h18" /><path d="M7 8l5-4 5 4" /><path d="M7 16l5 4 5-4" /></Svg>);
export const FlipVIcon     = (p: IconProps) => (<Svg {...p}><path d="M12 3v18" /><path d="M8 7 4 12l4 5" /><path d="M16 7l4 5-4 5" /></Svg>);
export const ResetIcon     = (p: IconProps) => (<Svg {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></Svg>);

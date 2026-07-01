import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CameraIcon, MicIcon, MusicIcon } from '../icons';

interface EngineRow {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  status: 'ok' | 'warn' | 'off';
  detail: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  llmOk: boolean;
  llmDetail: string;
  imgOk: boolean;
  imgWarn: boolean;
  imgDetail: string;
  audioOk: boolean;
  audioDetail: string;
  musicOk: boolean;
  musicDetail: string;
  onOpenSettings: () => void;
}

export function EngineStatusPopup({
  open, onClose, anchorEl,
  llmOk, llmDetail,
  imgOk, imgWarn, imgDetail,
  audioOk, audioDetail,
  musicOk, musicDetail,
  onOpenSettings,
}: Props) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorEl && !anchorEl.contains(e.target as Node)
      ) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, anchorEl, onClose]);

  // Position below the anchor
  const anchorRect = anchorEl?.getBoundingClientRect();
  const top = anchorRect ? anchorRect.bottom + 8 : 0;
  const right = anchorRect ? window.innerWidth - anchorRect.right : 0;

  const engines: EngineRow[] = [
    {
      id: 'llm',
      label: 'Chat Engine',
      icon: <SparkleIcon size={13} />,
      color: '#a78bfa',
      status: llmOk ? 'ok' : 'off',
      detail: llmOk ? llmDetail : 'Not configured',
    },
    {
      id: 'image',
      label: 'Image Engine',
      icon: <CameraIcon size={13} />,
      color: '#38bdf8',
      status: imgOk ? 'ok' : imgWarn ? 'warn' : 'off',
      detail: imgOk ? imgDetail : imgWarn ? 'URL set · unreachable' : 'Not configured',
    },
    {
      id: 'voice',
      label: 'Voice Engine',
      icon: <MicIcon size={13} />,
      color: '#34d399',
      status: audioOk ? 'ok' : 'off',
      detail: audioOk ? audioDetail : 'Not configured',
    },
    {
      id: 'music',
      label: 'Music Engine',
      icon: <MusicIcon size={13} />,
      color: '#f59e0b',
      status: musicOk ? 'ok' : 'off',
      detail: musicOk ? musicDetail : 'Not configured',
    },
  ];

  const STATUS_LABEL = { ok: 'Online', warn: 'Degraded', off: 'Offline' } as const;
  const STATUS_COLOR = { ok: '#34d399', warn: '#f59e0b', off: '#f87171' } as const;
  const STATUS_BG = {
    ok: 'rgba(52,211,153,0.12)',
    warn: 'rgba(245,158,11,0.12)',
    off: 'rgba(248,113,113,0.1)',
  } as const;

  if (!open) return null;

  return createPortal(
    <div
      ref={popupRef}
      className="esp-popup"
      style={{ top, right }}
      role="dialog"
      aria-label="AI Engine Status"
    >
      {/* Header */}
      <div className="esp-header">
        <div className="esp-header-dot-group">
          {engines.map((e) => (
            <span
              key={e.id}
              className="esp-header-mini-dot"
              style={{
                background: e.status !== 'off' ? STATUS_COLOR[e.status] : 'rgba(255,255,255,0.15)',
                boxShadow: e.status !== 'off' ? `0 0 6px ${STATUS_COLOR[e.status]}` : 'none',
              }}
            />
          ))}
        </div>
        <span className="esp-title">AI Engines</span>
        <button type="button" className="dui_modal__close-btn" onClick={onClose} title="Close" style={{ width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, fontWeight: 400, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>✕</button>
      </div>

      {/* Engine rows */}
      <div className="esp-body">
        {engines.map((e) => (
          <div key={e.id} className="esp-row">
            {/* Icon badge */}
            <div className="esp-icon-badge" style={{ background: `color-mix(in srgb, ${e.color} 18%, transparent)`, color: e.color }}>
              {e.icon}
            </div>

            {/* Label + detail */}
            <div className="esp-row-text">
              <span className="esp-row-label">{e.label}</span>
              <span className="esp-row-detail" title={e.detail}>{e.detail}</span>
            </div>

            {/* Status pill */}
            <div
              className="esp-status-pill"
              style={{
                background: STATUS_BG[e.status],
                color: STATUS_COLOR[e.status],
                borderColor: `color-mix(in srgb, ${STATUS_COLOR[e.status]} 35%, transparent)`,
              }}
            >
              <span
                className="esp-status-dot"
                style={{
                  background: STATUS_COLOR[e.status],
                  boxShadow: e.status !== 'off' ? `0 0 5px ${STATUS_COLOR[e.status]}` : 'none',
                }}
              />
              {STATUS_LABEL[e.status]}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="esp-footer">
        <button className="esp-settings-link" onClick={() => { onClose(); onOpenSettings(); }}>
          Configure engines in Settings →
        </button>
      </div>
    </div>,
    document.body,
  );
}

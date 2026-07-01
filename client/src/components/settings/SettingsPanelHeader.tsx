import type { ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}

export function SettingsPanelHeader({ icon, title, subtitle, action }: Props) {
  return (
    <div className="sp-header">
      <div className="sp-header-left">
        <div className="sp-title">{icon} {title}</div>
        <p className="sp-subtitle">{subtitle}</p>
      </div>
      {action && <div className="sp-header-action">{action}</div>}
    </div>
  );
}

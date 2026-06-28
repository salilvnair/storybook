/** Developer Tools — DB Explorer / Audit Log / Audit Config / AI Audit sub-tabs. */
import { useState } from 'react';
import { DbExplorer } from './DbExplorer';
import { AuditLog } from './AuditLog';
import { AuditConfig } from './AuditConfig';
import { AiAudit } from './AiAudit';
import { DatabaseIcon, ScrollIcon, ShieldIcon, SettingsIcon } from '../../icons';

export function DevTools() {
  const [tab, setTab] = useState<'db' | 'audit' | 'auditcfg' | 'aiaudit'>('db');
  const TABS = [
    { id: 'db' as const, label: 'DB Explorer', icon: <DatabaseIcon size={13} /> },
    { id: 'audit' as const, label: 'Audit Log', icon: <ScrollIcon size={13} /> },
    { id: 'auditcfg' as const, label: 'Audit Config', icon: <SettingsIcon size={13} /> },
    { id: 'aiaudit' as const, label: 'AI Audit', icon: <ShieldIcon size={13} /> },
  ];
  return (
    <div className="dt-root">
      <div className="dt-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`dt-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div className="dt-body">
        {tab === 'db' && <DbExplorer />}
        {tab === 'audit' && <AuditLog />}
        {tab === 'auditcfg' && <AuditConfig />}
        {tab === 'aiaudit' && <AiAudit />}
      </div>
    </div>
  );
}

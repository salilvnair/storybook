/**
 * AuditConfig — 100% ditto daakia's Audit Config. Toggle which app/UI event
 * types get recorded in the Audit Log. Events are grouped by module (collapsible),
 * with per-event + per-module toggles, Enable/Disable All, and Reset. Config
 * persists to localStorage and gates db `audit()` logging.
 */
import { useState, useCallback } from 'react';
import { ButtonView, ToggleSwitchView, ChipView } from '@salilvnair/dui';
import {
  AUDIT_EVENT_DEFS, AUDIT_MODULE_ORDER, MODULE_COLORS,
  isAuditEventEnabled, setAuditEventEnabled, resetAuditConfig,
} from '../../store/audit-config';
import { ChevronRightIcon } from '../../icons';

export function AuditConfig() {
  const [, force] = useState(0);
  const refresh = useCallback(() => force((n) => n + 1), []);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (m: string) => setCollapsed((prev) => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });

  const groups = AUDIT_MODULE_ORDER
    .map((module) => ({ module, defs: AUDIT_EVENT_DEFS.filter((d) => d.module === module) }))
    .filter((g) => g.defs.length > 0);

  const total = AUDIT_EVENT_DEFS.length;
  const enabledCount = AUDIT_EVENT_DEFS.filter((d) => isAuditEventEnabled(d.id)).length;

  const setAll = (on: boolean) => { AUDIT_EVENT_DEFS.forEach((d) => setAuditEventEnabled(d.id, on)); refresh(); };
  const setModule = (m: string, on: boolean) => { AUDIT_EVENT_DEFS.filter((d) => d.module === m).forEach((d) => setAuditEventEnabled(d.id, on)); refresh(); };

  return (
    <div className="acfg-root">
      <div className="acfg-toolbar">
        <span className="acfg-title">Audit Config</span>
        <ChipView size="xs" color="var(--story-accent-3)" label={`${enabledCount}/${total} active`} />
        <div className="acfg-toolbar-actions">
          <ButtonView size="sm" accentColor="var(--color-success, #34d399)" onClick={() => setAll(true)}>Enable All</ButtonView>
          <ButtonView size="sm" accentColor="var(--color-error, #f87171)" onClick={() => setAll(false)}>Disable All</ButtonView>
          <ButtonView size="sm" variant="secondary" onClick={() => { resetAuditConfig(); refresh(); }}>Reset</ButtonView>
        </div>
      </div>

      <div className="acfg-desc">
        Control which events get recorded in the Audit Log. Each event is
        <span className="acfg-pill">module · button · action</span>
        — disable noisy ones to keep the log focused.
      </div>

      <div className="acfg-list">
        {groups.map(({ module, defs }) => {
          const color = MODULE_COLORS[module] || '#94a3b8';
          const on = defs.filter((d) => isAuditEventEnabled(d.id)).length;
          const allOn = on === defs.length;
          const isCol = collapsed.has(module);
          return (
            <div key={module} className="acfg-group">
              <div className="acfg-group-head">
                <button className="acfg-group-toggle" onClick={() => toggleCollapse(module)}>
                  <ChevronRightIcon size={12} style={{ color, transform: isCol ? 'none' : 'rotate(90deg)', transition: 'transform .15s', opacity: 0.8 }} />
                  <span className="acfg-group-badge" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{module}</span>
                </button>
                <span className="acfg-group-line" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }} />
                <span className="acfg-group-count">{on}/{defs.length}</span>
                <ToggleSwitchView checked={allOn} onChange={(v) => setModule(module, v)} size="sm" accentColor={color} />
              </div>
              {!isCol && (
                <div className="acfg-rows" style={{ borderColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                  {defs.map((d) => {
                    const enabled = isAuditEventEnabled(d.id);
                    return (
                      <div key={d.id} className="acfg-row">
                        <div className="acfg-row-text">
                          <div className="acfg-row-desc" style={{ color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{d.description}</div>
                          <div className="acfg-row-meta">
                            <span className="acfg-mono" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>{d.button}</span>
                            <span className="acfg-dot">·</span><span className="acfg-mono-muted">{d.action}</span>
                            <span className="acfg-dot">·</span><span className="acfg-mono-muted">{d.id}</span>
                          </div>
                        </div>
                        <ToggleSwitchView checked={enabled} onChange={(v) => { setAuditEventEnabled(d.id, v); refresh(); }} size="md" accentColor={color} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

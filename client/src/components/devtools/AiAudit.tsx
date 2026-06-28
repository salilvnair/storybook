/**
 * AI Audit — 100% ditto daakia's AiAuditPanel. A table of every LLM call
 * (#, Stage, Model, Duration, Created At). Clicking a row replaces the panel
 * with a full detail *view* (Back button + tabs: System Prompt / User Prompt /
 * Request / Response / Full Audit), exactly like daakia — not a modal.
 */
import { useEffect, useState, useCallback } from 'react';
import { JsonTreeView, CopyButtonView, IconButtonView, ButtonView } from '@salilvnair/dui';
import { ChevronLeftIcon, RefreshIcon, TrashIcon, SparkleIcon } from '../../icons';

interface Row { id: number; stage: string; model: string; ms: number; createdAt: string; error: boolean }
interface Detail extends Row { system: string; user: string; request: unknown; response: unknown }

const STAGE_COLOR: Record<string, string> = {
  'Story Chat': '#34d399',
  'Template Chat': '#8b5cf6',
};
function stageColor(s: string) { return STAGE_COLOR[s] || '#60a5fa'; }

const DETAIL_TABS = [
  { id: 'system', label: 'System Prompt' },
  { id: 'user', label: 'User Prompt' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'full', label: 'Full Audit' },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['id'];

/** Pretty content: JSON → tree, strings → mono pre, empty → italic em-dash. */
function AuditContent({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="aa-empty">— empty —</span>;
  if (typeof value === 'object') return <JsonTreeView data={value} defaultExpandDepth={3} />;
  const str = String(value);
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') return <JsonTreeView data={parsed} defaultExpandDepth={3} />;
  } catch { /* not JSON — show as text */ }
  return <pre className="aa-pre">{str}</pre>;
}

function EntryDetail({ detail, onBack }: { detail: Detail; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>('system');
  const fullObj = {
    audit_id: detail.id, stage: detail.stage, model: detail.model,
    duration_ms: detail.ms, error: detail.error, created_at: detail.createdAt,
    system: detail.system, user: detail.user, request: detail.request, response: detail.response,
  };
  const tabValue: Record<DetailTab, unknown> = {
    system: detail.system, user: detail.user, request: detail.request,
    response: detail.response, full: fullObj,
  };
  const color = stageColor(detail.stage);

  return (
    <div className="aa-detail-view">
      <div className="aa-detail-head">
        <button className="aa-back" onClick={onBack}><ChevronLeftIcon size={13} />Back</button>
        <span className="aa-detail-id">#{detail.id}</span>
        <span className="aa-stage" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{detail.stage}</span>
        <span className="aa-detail-model">{detail.model}</span>
        {!detail.error && <span className="aa-detail-ms">{detail.ms}ms</span>}
        <div className="aa-detail-spacer" />
        <CopyButtonView text={JSON.stringify(fullObj, null, 2)} size="sm" accentColor="var(--story-accent-3)" title="Copy full audit" />
      </div>
      <div className="aa-detail-tabs">
        {DETAIL_TABS.map((t) => (
          <button key={t.id} className={`aa-detail-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="aa-detail-content">
        {tab === 'full' ? (
          <div className="aa-full-stack">
            {DETAIL_TABS.filter((t) => t.id !== 'full').map((t) => (
              <div key={t.id} className="aa-full-section">
                <div className="aa-full-label">{t.label}</div>
                <AuditContent value={tabValue[t.id]} />
              </div>
            ))}
          </div>
        ) : (
          <AuditContent value={tabValue[tab]} />
        )}
      </div>
    </div>
  );
}

export function AiAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/ai-audit').then((r) => r.json()).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const open = (id: number) => {
    fetch(`/api/ai-audit/${id}`).then((r) => r.json()).then(setDetail).catch(() => {});
  };
  const del = (id: number) => fetch(`/api/ai-audit/${id}`, { method: 'DELETE' }).then(refresh);
  const clearAll = () => fetch('/api/ai-audit', { method: 'DELETE' }).then(refresh);

  if (detail) return <EntryDetail detail={detail} onBack={() => setDetail(null)} />;

  return (
    <div className="aa-root">
      <div className="aa-head">
        <SparkleIcon size={14} style={{ color: 'var(--story-accent-3)' }} />
        <span className="aa-title">AI Audit</span>
        <span className="aa-count">{rows.length} records</span>
        <ButtonView size="sm" variant="secondary" iconLeft={<RefreshIcon size={12} />} onClick={refresh}>Refresh</ButtonView>
        {rows.length > 0 && <ButtonView size="sm" accentColor="var(--color-error, #f87171)" iconLeft={<TrashIcon size={12} />} onClick={clearAll}>Clear All</ButtonView>}
      </div>

      <div className="aa-table-wrap">
        {rows.length === 0 ? (
          <div className="aa-empty-state">
            <SparkleIcon size={24} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
            <span>No AI audit records yet</span>
            <span className="aa-empty-sub">Chat with Storybook Buddy to record LLM calls here.</span>
          </div>
        ) : (
          <table className="aa-grid">
            <thead>
              <tr><th>#</th><th>Stage</th><th>Model</th><th>Duration</th><th>Created At</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="aa-row" onClick={() => open(r.id)}>
                  <td className="aa-id">{r.id}</td>
                  <td><span className="aa-stage" style={{ color: stageColor(r.stage), background: `color-mix(in srgb, ${stageColor(r.stage)} 16%, transparent)` }}>{r.stage}</span></td>
                  <td className="aa-model">{r.model}</td>
                  <td className="aa-ms" style={{ color: r.error ? 'var(--color-error,#f87171)' : '#fbbf24' }}>{r.error ? 'error' : `${r.ms}ms`}</td>
                  <td className="aa-time">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="aa-actions" onClick={(e) => e.stopPropagation()}>
                    <IconButtonView size="sm" tooltip="Delete" icon={<TrashIcon size={12} />} accentColor="var(--color-error, #f87171)" onClick={() => del(r.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * Audit Log — 100% ditto daakia's unified log. One stream of:
 *   • AI calls (server /api/ai-audit) — module from the stage
 *   • App/UI events (sql.js audit_log) — module from the kind
 * Module-coloured badges, a search box, and expandable rows that reveal the
 * full detail (System / User / Request / Response for AI; metadata for app).
 */
import { useCallback, useEffect, useState, Fragment } from 'react';
import { ButtonView, JsonTreeView } from '@salilvnair/dui';
import { all } from '../../db/sqldb';
import { moduleForKind, MODULE_COLORS } from '../../store/audit-config';
import { RefreshIcon, TrashIcon, SparkleIcon, ChevronRightIcon } from '../../icons';

interface AiRow { kind: 'ai'; id: number; stage: string; model: string; ms: number; createdAt: string; error: boolean }
interface AppRow { kind: 'app'; id: number; ts: string; evt: string; summary: string; detail: string | null }
type Row = AiRow | AppRow;

interface AiDetail { system: string; user: string; request: unknown; response: unknown }

function aiModule(stage: string): { label: string; color: string } {
  if (/^image/i.test(stage)) return { label: 'Engine', color: MODULE_COLORS.Engine };
  return { label: 'AI', color: MODULE_COLORS.AI };
}

function PayloadBlock({ label, value, color }: { label: string; value: unknown; color: string }) {
  if (value == null || value === '') return null;
  let parsed: unknown = value;
  if (typeof value === 'string') { try { const p = JSON.parse(value); if (p && typeof p === 'object') parsed = p; } catch { /* not JSON */ } }
  return (
    <div className="alx-block">
      <span className="alx-block-label" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{label}</span>
      {typeof parsed === 'object'
        ? <div className="alx-block-body"><JsonTreeView data={parsed} defaultExpandDepth={2} /></div>
        : <pre className="alx-block-pre">{String(parsed)}</pre>}
    </div>
  );
}

export function AuditLog() {
  const [aiRows, setAiRows] = useState<AiRow[]>([]);
  const [appRows, setAppRows] = useState<AppRow[]>([]);
  const [search, setSearch] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [aiDetail, setAiDetail] = useState<Record<number, AiDetail>>({});

  const refresh = useCallback(() => {
    fetch('/api/ai-audit').then((r) => r.json())
      .then((rows: Omit<AiRow, 'kind'>[]) => setAiRows(rows.map((r) => ({ ...r, kind: 'ai' as const }))))
      .catch(() => setAiRows([]));
    void all<{ id: number; ts: string; kind: string; summary: string; detail_json: string | null }>(
      'SELECT * FROM audit_log ORDER BY id DESC LIMIT 500',
    ).then((rows) => setAppRows(rows.map((r) => ({ kind: 'app' as const, id: r.id, ts: r.ts, evt: r.kind, summary: r.summary, detail: r.detail_json }))));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const clearAll = async () => {
    await fetch('/api/ai-audit', { method: 'DELETE' });
    await all('DELETE FROM audit_log');
    refresh(); setOpenKey(null);
  };

  const toggle = (key: string, row: Row) => {
    setOpenKey(openKey === key ? null : key);
    if (row.kind === 'ai' && !aiDetail[row.id]) {
      fetch(`/api/ai-audit/${row.id}`).then((r) => r.json()).then((d) => setAiDetail((m) => ({ ...m, [row.id]: d }))).catch(() => {});
    }
  };

  const merged: Row[] = [...aiRows, ...appRows].sort((a, b) => {
    const ta = a.kind === 'ai' ? a.createdAt : a.ts;
    const tb = b.kind === 'ai' ? b.createdAt : b.ts;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  const q = search.toLowerCase().trim();
  const rows = !q ? merged : merged.filter((r) => {
    if (r.kind === 'ai') return r.stage.toLowerCase().includes(q) || r.model.toLowerCase().includes(q) || aiModule(r.stage).label.toLowerCase().includes(q);
    return r.evt.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q) || moduleForKind(r.evt).label.toLowerCase().includes(q);
  });

  return (
    <div className="alx-root">
      <div className="alx-toolbar">
        <span className="alx-search">
          <span className="alx-search-ico">⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by module, event, model…" />
          <span className="alx-count">{rows.length}</span>
        </span>
        <ButtonView size="sm" variant="secondary" iconLeft={<RefreshIcon size={12} />} onClick={refresh}>Refresh</ButtonView>
        <ButtonView size="sm" accentColor="var(--color-error, #f87171)" iconLeft={<TrashIcon size={12} />} onClick={clearAll}>Clear All</ButtonView>
      </div>

      <div className="alx-table-wrap">
        {rows.length === 0 ? (
          <div className="aa-empty-state"><SparkleIcon size={24} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} /><span>No audit entries yet</span><span className="aa-empty-sub">AI calls and app actions appear here.</span></div>
        ) : (
          <table className="alx-grid">
            <thead><tr><th>#</th><th>Module</th><th>Event / Stage</th><th>Detail</th><th>Duration</th><th>Time</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const key = `${r.kind}-${r.id}`;
                const isOpen = openKey === key;
                const mod = r.kind === 'ai' ? aiModule(r.stage) : moduleForKind(r.evt);
                const eventLabel = r.kind === 'ai' ? r.stage : r.evt;
                const detail = r.kind === 'ai' ? (r.model || '—') : r.summary;
                const num = rows.length - i;
                return (
                  <Fragment key={key}>
                    <tr className={`alx-row${isOpen ? ' is-open' : ''}`} onClick={() => toggle(key, r)} style={isOpen ? { background: `color-mix(in srgb, ${mod.color} 7%, transparent)` } : undefined}>
                      <td className="alx-id">{num}</td>
                      <td><span className="alx-badge" style={{ color: mod.color, background: `color-mix(in srgb, ${mod.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${mod.color} 26%, transparent)` }}>{mod.label}</span></td>
                      <td><span className="alx-evt" style={{ color: mod.color }}>{eventLabel}</span></td>
                      <td className="alx-detail" title={detail}>{detail}</td>
                      <td className="alx-ms" style={{ color: r.kind === 'ai' && r.error ? 'var(--color-error,#f87171)' : '#fbbf24' }}>{r.kind === 'ai' && !r.error ? `${r.ms}ms` : r.kind === 'ai' ? 'error' : '—'}</td>
                      <td className="alx-time">{new Date(r.kind === 'ai' ? r.createdAt : r.ts).toLocaleString()}</td>
                      <td className="alx-chev"><ChevronRightIcon size={12} style={{ color: mod.color, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} /></td>
                    </tr>
                    {isOpen && (
                      <tr className="alx-detail-row"><td colSpan={7}>
                        <div className="alx-detail-pane" style={{ background: `color-mix(in srgb, ${mod.color} 4%, transparent)` }}>
                          {r.kind === 'ai' ? (
                            aiDetail[r.id] ? (
                              <>
                                <PayloadBlock label="System Prompt" value={aiDetail[r.id].system} color="#818cf8" />
                                <PayloadBlock label="User Prompt" value={aiDetail[r.id].user} color="#06b6d4" />
                                <PayloadBlock label="Request" value={aiDetail[r.id].request} color="#fbbf24" />
                                <PayloadBlock label="Response" value={aiDetail[r.id].response} color="#10b981" />
                              </>
                            ) : <span className="alx-loading">Loading…</span>
                          ) : (
                            <>
                              <PayloadBlock label="Summary" value={r.summary} color={mod.color} />
                              {r.detail && <PayloadBlock label="Metadata" value={r.detail} color={mod.color} />}
                            </>
                          )}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

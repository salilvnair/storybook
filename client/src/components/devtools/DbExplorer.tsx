/**
 * DB Explorer — 100% ditto sidekick/daakia. Tables sidebar + rows table; clicking
 * a row opens a Row Detail *view* (Back button + per-column tabs) with the value
 * rendered as a JSON tree when it parses, exactly like sidekick's DbExplorerPanel.
 */
import { useEffect, useState } from 'react';
import { JsonTreeView } from '@salilvnair/dui';
import { tables, all } from '../../db/sqldb';
import type { SqlValue } from 'sql.js';
import { ChevronLeftIcon, RefreshIcon } from '../../icons';

const TABLE_COLORS: Record<string, string> = {
  templates: '#6366f1',
  providers: '#22c55e',
  audit_log: '#f59e0b',
};
function tableColor(name: string): string { return TABLE_COLORS[name] ?? '#8b5cf6'; }

function isJsonString(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

function CellDetail({ value }: { value: SqlValue }) {
  if (value == null) return <span className="dx-null">NULL</span>;
  if (isJsonString(value)) return <JsonTreeView data={JSON.parse(String(value))} defaultExpandDepth={3} />;
  if (typeof value === 'number') return <span className="dx-num">{String(value)}</span>;
  return <pre className="dx-cell-pre">{String(value)}</pre>;
}

export function DbExplorer() {
  const [tableList, setTableList] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string>('');
  const [rows, setRows] = useState<Record<string, SqlValue>[]>([]);
  const [viewRow, setViewRow] = useState<Record<string, SqlValue> | null>(null);
  const [rowTab, setRowTab] = useState<string>('__row__');

  const loadRows = (t: string) => void all(`SELECT * FROM ${t} LIMIT 500`).then((r) => setRows(r as Record<string, SqlValue>[]));

  useEffect(() => {
    void tables().then(async (ts) => {
      setTableList(ts);
      const c: Record<string, number> = {};
      for (const t of ts) {
        const r = await all(`SELECT COUNT(*) AS n FROM ${t}`);
        c[t] = Number((r[0] as { n: number })?.n ?? 0);
      }
      setCounts(c);
      if (ts[0]) { setActive(ts[0]); loadRows(ts[0]); }
    });
  }, []);

  const select = (t: string) => { setActive(t); setViewRow(null); loadRows(t); };
  const cols = rows[0] ? Object.keys(rows[0]) : [];

  // ── Row detail view (ditto sidekick) ──
  if (viewRow) {
    const detailTabs = ['__row__', ...Object.keys(viewRow)];
    const color = tableColor(active);
    return (
      <div className="db-explorer dx-col">
        <div className="dx-detail-head">
          <button className="aa-back" onClick={() => { setViewRow(null); setRowTab('__row__'); }}><ChevronLeftIcon size={13} />Back</button>
          <span className="dx-detail-title">
            <span className="dx-table-icon" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>⛁</span>
            {active}<span className="dx-detail-sub">— Row Detail</span>
          </span>
        </div>
        <div className="dx-detail-tabs">
          {detailTabs.map((t) => (
            <button key={t} className={`dx-detail-tab${rowTab === t ? ' is-active' : ''}`} onClick={() => setRowTab(t)}>
              {t === '__row__' ? 'Row' : t}
            </button>
          ))}
        </div>
        <div className="dx-detail-content">
          {rowTab === '__row__' ? (
            <JsonTreeView data={viewRow} defaultExpandDepth={3} />
          ) : (
            <div className="dx-col-detail"><div className="dx-col-label">{rowTab}</div><CellDetail value={viewRow[rowTab]} /></div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="db-explorer dx-root">
      <div className="dx-tables">
        {tableList.map((t) => {
          const color = tableColor(t);
          return (
            <button key={t} className={`dx-table${active === t ? ' is-active' : ''}`} onClick={() => select(t)}>
              <span className="dx-table-icon" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>⛁</span>
              <span className="dx-table-meta">
                <span className="dx-table-name">{t}</span>
                <span className="dx-table-count">{counts[t] ?? 0} row{counts[t] !== 1 ? 's' : ''}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="dx-content">
        <div className="dx-content-head">
          <span className="dx-table-name">{active || '—'}</span>
          <span className="dx-row-count">{rows.length} row{rows.length !== 1 ? 's' : ''}, {cols.length} col{cols.length !== 1 ? 's' : ''}</span>
          <button className="aa-head-btn" onClick={() => active && loadRows(active)}><RefreshIcon size={11} />Refresh</button>
        </div>
        <div className="dx-table-wrap">
          {rows.length === 0 ? (
            <div className="dx-empty">Table is empty.</div>
          ) : (
            <table className="dx-grid">
              <thead>
                <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="dx-clickable-row" onClick={() => { setViewRow(row); setRowTab('__row__'); }}>
                    {cols.map((c) => (
                      <td key={c} title={String(row[c] ?? '')}>
                        {row[c] == null ? <span className="dx-null">NULL</span> : truncate(String(row[c]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n = 100) { return s.length > n ? s.slice(0, n) + '…' : s; }

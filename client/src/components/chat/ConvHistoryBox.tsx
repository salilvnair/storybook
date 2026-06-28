/**
 * ConvHistoryBox — collapsible inline conversation-history panel (#9).
 * Sits above ConvEngineChat, collapsed by default (a small pill showing turn count).
 * On expand: fetches /api/v1/conversation/audit/:id and lists turns with truncated
 * content; clicking a turn expands its full text.
 */
import { useState, useCallback } from 'react';

interface Message { id: string; role: 'user' | 'assistant'; content: string; ts: number }

interface Props { conversationId: string; onClear?: () => Promise<void> }

function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

export function ConvHistoryBox({ conversationId, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/conversation/audit/${conversationId}`);
      const d = await r.json();
      setMessages(d.messages || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [conversationId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchHistory();
    else setExpanded(null);
  };

  const toggleExpand = (id: string) => setExpanded((e) => (e === id ? null : id));

  return (
    <div className={`chb-root${open ? ' chb-open' : ''}`}>
      <button className="chb-toggle" onClick={toggle}>
        <span className="chb-icon">📋</span>
        <span className="chb-label">
          Conversation history
          {messages.length > 0 && ` · ${messages.length} turn${messages.length !== 1 ? 's' : ''}`}
        </span>
        <span
          className="chb-refresh"
          role="button"
          tabIndex={0}
          title="Refresh"
          onClick={(e) => { e.stopPropagation(); if (open) fetchHistory(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); if (open) fetchHistory(); } }}
          style={{ display: open ? undefined : 'none' }}
        >↺</span>
        {open && onClear && (
          <span
            className="chb-clear"
            role="button"
            tabIndex={0}
            title="Clear history"
            onClick={async (e) => {
              e.stopPropagation();
              setClearing(true);
              await onClear();
              setMessages([]);
              setClearing(false);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
          >{clearing ? '…' : '🗑'}</span>
        )}
        <span className="chb-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="chb-body">
          {loading && <div className="chb-empty">Loading…</div>}
          {!loading && messages.length === 0 && (
            <div className="chb-empty">No history yet — start chatting to see turns here.</div>
          )}
          {!loading && messages.map((m) => {
            const isOpen = expanded === m.id;
            const clean = stripMd(m.content);
            const preview = clean.length > 180 ? clean.slice(0, 180) + '…' : clean;
            return (
              <button
                key={m.id}
                className={`chb-turn chb-turn-${m.role}${isOpen ? ' chb-turn-expanded' : ''}`}
                onClick={() => toggleExpand(m.id)}
              >
                <span className="chb-role-badge">{m.role === 'user' ? '👤 You' : '🤖 AI'}</span>
                <span className="chb-turn-time">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <p className="chb-turn-text">{isOpen ? m.content : preview}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

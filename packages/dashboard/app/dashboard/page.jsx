'use client';

// packages/dashboard/app/dashboard/page.jsx

import { useEffect, useRef } from 'react';
import useStore from '../../lib/store';

const SEVERITY = {
  critical: {
    label: 'Critical',
    bg:    'bg-red-950',
    border:'border-red-600',
    badge: 'bg-red-600 text-white',
  },
  warning: {
    label: 'Warning',
    bg:    'bg-yellow-950',
    border:'border-yellow-600',
    badge: 'bg-yellow-500 text-black',
  },
  hallucination: {
    label: 'Hallucination',
    bg:    'bg-purple-950',
    border:'border-purple-600',
    badge: 'bg-purple-600 text-white',
  },
  good: {
    label: 'Good',
    bg:    'bg-green-950',
    border:'border-green-700',
    badge: 'bg-green-600 text-white',
  },
  info: {
    label: 'Info',
    bg:    'bg-zinc-900',
    border:'border-zinc-700',
    badge: 'bg-zinc-600 text-white',
  },
  context: {
    label: 'Context',
    bg:    'bg-zinc-900',
    border:'border-zinc-800',
    badge: 'bg-zinc-700 text-zinc-300',
  },
};

function FeedCard({ item }) {
  const s = SEVERITY[item.severity] || SEVERITY.info;

  return (
    <div className={`rounded-lg border ${s.bg} ${s.border} p-4 mb-3`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
          {s.label}
        </span>
        <span className="text-xs text-zinc-400 font-mono truncate max-w-xs">
          {item.filePath}
        </span>
        <span className="text-xs text-zinc-600 ml-auto">
          {new Date(item.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
      <p className="text-sm text-zinc-300 leading-relaxed">{item.body}</p>

      {item.fix && (
        <div className="mt-3 p-2 rounded bg-zinc-800 border border-zinc-700">
          <p className="text-xs font-semibold text-zinc-400 mb-1">🔧 Suggested fix:</p>
          <p className="text-xs text-zinc-300 font-mono leading-relaxed">{item.fix}</p>
        </div>
      )}

      {item.fileRelevance && item.fileRelevance !== 'Unknown' && (
        <p className="text-xs text-zinc-500 mt-2 italic">{item.fileRelevance}</p>
      )}
    </div>
  );
}

function StatBadge({ label, count, color }) {
  return (
    <div className={`rounded-lg p-3 ${color} flex flex-col items-center`}>
      <span className="text-2xl font-bold text-white">{count}</span>
      <span className="text-xs text-zinc-300 mt-1">{label}</span>
    </div>
  );
}

function QuotaBanner({ quota }) {
  if (quota.mode === 'checkpoint') {
    return (
      <div className="bg-red-900 border border-red-600 rounded-lg p-3 mb-4 text-sm text-white">
        🔴 <strong>Checkpoint mode</strong> — quota reached ({quota.used}/{quota.limit}).
      </div>
    );
  }
  if (quota.mode === 'warning') {
    return (
      <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-3 mb-4 text-sm text-white">
        ⚠️ <strong>Quota warning</strong> — {quota.used}/{quota.limit} used (
        {Math.round((quota.used / quota.limit) * 100)}%)
      </div>
    );
  }
  return null;
}

export default function DashboardPage() {
  const {
    feedItems, sessionStats, quotaState, wsConnected, sessionId,
    addFeedItem, updateQuota, setWsConnected, setSessionId,
  } = useStore();

  const wsRef   = useRef(null);
  const feedRef = useRef(null);

  useEffect(() => {
    const existing = sessionStorage.getItem('overseer_session_id');
    if (existing) {
      setSessionId(existing);
    } else {
      const newId = crypto.randomUUID();
      sessionStorage.setItem('overseer_session_id', newId);
      setSessionId(newId);
    }
  }, [setSessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    const ws    = new WebSocket(`${wsUrl}/?session=${sessionId}`);
    wsRef.current = ws;

    ws.onopen  = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'analysis_complete' && msg.result) {
          addFeedItem({
            id:            crypto.randomUUID(),
            severity:      msg.result.severity,
            title:         msg.result.title,
            body:          msg.result.body,
            fix:           msg.result.fix || null,
            fileRelevance: msg.result.file_relevance,
            filePath:      msg.filePath || '',
            timestamp:     Date.now(),
          });
        }
        if (msg.type === 'quota_update') updateQuota(msg.quota);
      } catch {}
    };

    return () => ws.close();
  }, [sessionId, addFeedItem, updateQuota, setWsConnected]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [feedItems.length]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-4">
        <span className="text-lg font-bold tracking-tight">Overseer</span>
        <span className="text-xs text-zinc-500">Know what your AI is building.</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-zinc-400">{wsConnected ? 'Live' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6" ref={feedRef}>
          <QuotaBanner quota={quotaState} />
          {feedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-zinc-600">
              <div className="text-5xl mb-4">👁</div>
              <p className="text-lg font-medium">Watching for file changes...</p>
              <p className="text-sm mt-2">
                Run <code className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">overseer watch</code> in your project to start.
              </p>
            </div>
          ) : (
            feedItems.map((item) => <FeedCard key={item.id} item={item} />)
          )}
        </main>

        <aside className="w-72 border-l border-zinc-800 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Session Stats</h2>
            <div className="grid grid-cols-2 gap-2">
              <StatBadge label="Critical" count={sessionStats.criticalCount} color="bg-red-900"    />
              <StatBadge label="Warnings" count={sessionStats.warningCount}  color="bg-yellow-900" />
              <StatBadge label="Good"     count={sessionStats.goodCount}     color="bg-green-900"  />
              <StatBadge label="Total"    count={sessionStats.analysisCount} color="bg-zinc-800"   />
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Quota</h2>
            <div className="bg-zinc-900 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">Used</span>
                <span className="font-mono">{quotaState.used} / {quotaState.limit}</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    quotaState.mode === 'checkpoint' ? 'bg-red-500' :
                    quotaState.mode === 'warning'    ? 'bg-yellow-400' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min((quotaState.used / quotaState.limit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-2">Plan: {quotaState.plan} · Mode: {quotaState.mode}</p>
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Files Touched ({sessionStats.filesTouched.length})
            </h2>
            <div className="space-y-1">
              {sessionStats.filesTouched.length === 0 ? (
                <p className="text-xs text-zinc-600">None yet</p>
              ) : (
                sessionStats.filesTouched.map((f) => (
                  <p key={f} className="text-xs font-mono text-zinc-400 truncate" title={f}>{f}</p>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

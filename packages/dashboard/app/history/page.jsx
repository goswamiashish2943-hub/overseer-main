'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [filter, setFilter] = useState('all'); // all, today, week, month
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSessions();
  }, [filter]);

  const fetchSessions = async () => {
    setLoading(true);

    let query = supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    const now = new Date();
    if (filter === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query = query.gte('created_at', today.toISOString());
    } else if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (filter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', monthAgo.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching sessions:', error);
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setSessions(data || []);
    setErrorMsg(null);
    setLoading(false);
  };

  const filteredSessions = sessions.filter(session =>
    session.file_path?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-blue-500">Overseer</span>
        </div>
        <nav className="flex gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Live Analysis</Link>
          <Link href="/history" className="text-sm font-medium text-white transition-colors">History</Link>
        </nav>
      </header>

      <div className="p-6 max-w-5xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6 text-zinc-100">Analysis History</h1>

        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="Search by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-zinc-700 bg-zinc-800 rounded-lg flex-1 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border border-zinc-700 bg-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none min-w-[150px]"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>

        {loading ? (
          <p className="text-zinc-500">Loading history...</p>
        ) : errorMsg ? (
          <p className="text-red-400 bg-red-950/50 border border-red-800 px-4 py-8 rounded-lg text-center">
            Error loading history: {errorMsg}
          </p>
        ) : filteredSessions.length === 0 ? (
          <p className="text-zinc-500 bg-zinc-900 border border-zinc-800 px-4 py-8 rounded-lg text-center">No analyses found for these filters.</p>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map(session => (
              <HistoryCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryCard({ session }) {
  const [expanded, setExpanded] = useState(false);
  const alignmentScore = session.alignment?.score ?? 0;

  return (
    <div 
      className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg shadow-sm cursor-pointer hover:border-zinc-600 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-mono text-sm font-semibold text-blue-400 mb-1">{session.file_path}</h3>
          <p className="text-xs text-zinc-500">
            {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex gap-2">
          {session.reviewed && (
            <span className="px-2 py-1 flex items-center rounded text-xs font-bold uppercase tracking-wider bg-zinc-900 border border-green-800/50 text-green-500">
              ✓ Reviewed
            </span>
          )}
          <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider
            ${alignmentScore >= 80 ? 'bg-green-950/50 text-green-400 border border-green-800' :
              alignmentScore >= 50 ? 'bg-yellow-950/50 text-yellow-400 border border-yellow-800' :
              'bg-red-950/50 text-red-400 border border-red-800'}`}>
            {alignmentScore}% aligned
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
          {session.suggestion && (
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Suggestion</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{session.suggestion.title}</p>
              <p className="text-xs text-zinc-400 mt-1">{session.suggestion.body}</p>
            </div>
          )}

          {session.better_approach?.exists && (
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
              <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-1">Better Approach</p>
              <p className="text-sm text-zinc-300">{session.better_approach.description}</p>
            </div>
          )}

          {session.alignment?.issues?.length > 0 && (
            <div className="bg-zinc-950 p-3 rounded border border-red-900/40">
              <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Issues</p>
              <ul className="text-xs text-zinc-300 space-y-1">
                {session.alignment.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2"><span className="text-red-500">•</span> {issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded text-xs font-medium transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                const json = JSON.stringify(session, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${session.file_path.split('/').pop().split('\\').pop()}-analysis.json`;
                a.click();
              }}
            >
              Download JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import Sidebar from '../../components/Sidebar';
import { FileCode2, Download, Search, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://overseer-main.onrender.com';

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      
      const res = await fetch(`${API_URL}/api/sessions/history?filter=${filter}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      setSessions(data || []);
      setErrorMsg(null);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter(session =>
    session.file_path?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex bg-surface-l0 text-on-surface">
      <Sidebar />

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <div className="h-14 border-b border-outline-variant/40 bg-surface-l1 flex items-center px-5 gap-4 flex-shrink-0">
          <h1 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            Analysis History
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto w-full">
            <div className="mb-6 flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
                <input
                  type="text"
                  placeholder="Search by filename..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-surface-l1 border border-outline-variant/40 rounded-lg text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-accent-primary text-sm transition-colors"
                />
              </div>

              <div className="relative">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-4 pr-10 py-2 bg-surface-l1 border border-outline-variant/40 rounded-lg text-on-surface focus:outline-none focus:border-accent-primary text-sm appearance-none min-w-[150px] transition-colors cursor-pointer"
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                </select>
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-on-surface-variant/40">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-accent-primary/40 border-t-accent-primary animate-spin" />
                  <p>Loading history...</p>
                </div>
              </div>
            ) : errorMsg ? (
              <p className="text-critical bg-critical/10 border border-critical/20 px-4 py-8 rounded-lg text-center text-sm">
                Error loading history: {errorMsg}
              </p>
            ) : filteredSessions.length === 0 ? (
              <p className="text-on-surface-variant/40 bg-surface-l1 border border-outline-variant/30 px-4 py-8 rounded-lg text-center text-sm">
                No analyses found for these filters.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredSessions.map(session => (
                  <HistoryCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ session }) {
  const [expanded, setExpanded] = useState(false);
  const alignmentScore = session.alignment?.score ?? 0;

  return (
    <div 
      className="bg-surface-l1 border border-outline-variant/30 p-4 rounded-lg shadow-sm cursor-pointer hover:border-outline-variant/60 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 flex items-start gap-3">
          <FileCode2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-mono text-sm text-on-surface truncate" title={session.file_path}>
              {session.file_path}
            </h3>
            <p className="text-[11px] text-on-surface-variant/60 mt-1 font-mono">
              {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {session.reviewed && (
            <span className="px-2 py-0.5 flex items-center rounded-full text-[10px] font-bold uppercase tracking-wider bg-stable/10 border border-stable/20 text-stable">
              ✓ Reviewed
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            alignmentScore >= 80 ? 'bg-stable/10 text-stable border-stable/20' :
            alignmentScore >= 50 ? 'bg-warning/10 text-warning border-warning/20' :
            'bg-critical/10 text-critical border-critical/20'
          }`}>
            {alignmentScore}% aligned
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant/40" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant/40" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-outline-variant/20 space-y-3" onClick={(e) => e.stopPropagation()}>
          {session.suggestion && (
            <div className="bg-surface-l2 p-3 rounded-md border border-outline-variant/30">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Suggestion</p>
              <p className="text-xs text-on-surface font-semibold leading-relaxed">{session.suggestion.title}</p>
              <p className="text-xs text-on-surface-variant mt-1">{session.suggestion.body}</p>
            </div>
          )}

          {session.better_approach?.exists && (
            <div className="bg-surface-l2 p-3 rounded-md border border-outline-variant/30">
              <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Better Approach</p>
              <p className="text-xs text-on-surface-variant">{session.better_approach.description}</p>
            </div>
          )}

          {session.alignment?.issues?.length > 0 && (
            <div className="bg-surface-l2 p-3 rounded-md border border-critical/20">
              <p className="text-[10px] font-bold text-critical uppercase tracking-widest mb-1">Issues</p>
              <ul className="text-xs text-on-surface-variant space-y-1">
                {session.alignment.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2"><span className="text-critical">•</span> {issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-l2 hover:bg-surface-l3 text-on-surface-variant hover:text-on-surface border border-outline-variant/40 rounded text-xs font-medium transition-colors"
              onClick={() => {
                const json = JSON.stringify(session, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${session.file_path.split('/').pop().split('\\').pop()}-analysis.json`;
                a.click();
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Download JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

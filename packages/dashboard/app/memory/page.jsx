'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { FileCode2, BarChart3, Search, GitCommit, Layers, Database, RefreshCw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://overseer-main.onrender.com';

const TABS = [
  { key: 'summary',   label: 'Summary',   icon: Database },
  { key: 'history',   label: 'History',    icon: GitCommit },
  { key: 'evolution', label: 'Evolution',  icon: BarChart3 },
  { key: 'graph',     label: 'Graph',      icon: Layers },
  { key: 'search',    label: 'Search',     icon: Search },
];

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState('summary');
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects]   = useState([]);
  const [summary, setSummary]     = useState(null);
  const [history, setHistory]     = useState([]);
  const [evolution, setEvolution] = useState([]);
  const [graph, setGraph]         = useState({ nodes: [], edges: [] });
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/memory/projects`)
      .then(r => r.json())
      .then(rows => { setProjects(rows); if (rows.length > 0) setProjectId(rows[0].project_id); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { if (projectId) { fetchSummary(); fetchHistory(); fetchEvolution(); fetchGraph(); } }, [projectId]);

  const fetchSummary   = async () => { try { const r = await fetch(`${API_URL}/api/codebase/summary?project_id=${projectId}`);   if (r.ok) setSummary(await r.json()); } catch {} };
  const fetchHistory   = async () => { try { const r = await fetch(`${API_URL}/api/changes/history?project_id=${projectId}`);   if (r.ok) setHistory(await r.json()); } catch {} };
  const fetchEvolution = async () => { try { const r = await fetch(`${API_URL}/api/codebase/evolution?project_id=${projectId}`); if (r.ok) setEvolution(await r.json()); } catch {} };
  const fetchGraph     = async () => { try { const r = await fetch(`${API_URL}/api/graph/dependencies?project_id=${projectId}`); if (r.ok) setGraph(await r.json()); } catch {} };

  const handleSearch = async (e) => {
    e.preventDefault(); if (!searchQuery || !projectId) return;
    try { const r = await fetch(`${API_URL}/api/search/changes?project_id=${projectId}&q=${encodeURIComponent(searchQuery)}`); if (r.ok) setSearchResults(await r.json()); } catch {}
  };

  const refreshAll = () => { if (!projectId) return; fetchSummary(); fetchHistory(); fetchEvolution(); fetchGraph(); };

  return (
    <div className="min-h-screen flex bg-surface-l0 text-on-surface">
      <Sidebar />

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <div className="h-14 border-b border-outline-variant/40 bg-surface-l1 flex items-center px-5 gap-4 flex-shrink-0">
          <h1 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="text-lg">🧠</span> Codebase Memory
          </h1>

          {projects.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">Project</span>
                <select
                  value={projectId || ''}
                  onChange={e => setProjectId(e.target.value)}
                  className="text-xs bg-surface-l2 border border-outline-variant/40 rounded px-2.5 py-1 text-on-surface focus:outline-none focus:border-accent-primary transition-colors"
                >
                  {projects.map(p => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_id.slice(0, 8)}… ({new Date(p.last_seen).toLocaleTimeString()})
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={refreshAll}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-surface-l2 hover:bg-surface-l3 border border-outline-variant/40 rounded transition-colors text-on-surface-variant hover:text-on-surface">
                <RefreshCw className="w-3 h-3"/>Refresh
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto w-full">

            {loading && (
              <div className="flex items-center justify-center h-40 text-on-surface-variant/40">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-accent-primary/40 border-t-accent-primary animate-spin"/>
                  <p>Detecting project from memory database…</p>
                </div>
              </div>
            )}

            {!loading && !projectId && (
              <div className="bg-[#2a1d00] border border-[#FFB300]/30 rounded-lg p-6 text-warning mt-4">
                <p className="font-semibold mb-1">⚠️ No changes recorded yet</p>
                <p className="text-sm text-on-surface-variant">
                  Start the daemon with <code className="bg-surface-l2 px-1.5 rounded text-on-surface">overseer watch</code> and save a file to populate memory.
                </p>
              </div>
            )}

            {!loading && projectId && (
              <>
                {/* Tabs */}
                <div className="flex gap-1 mb-8 border-b border-outline-variant/30 pb-0">
                  {TABS.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-[1px] ${
                        activeTab === key
                          ? 'border-accent-primary text-on-surface bg-surface-l1 rounded-t-md'
                          : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-l1/50'
                      }`}>
                      <Icon className="w-3.5 h-3.5"/>{label}
                    </button>
                  ))}
                </div>

                {/* SUMMARY */}
                {activeTab === 'summary' && (
                  <div className="space-y-4">
                    <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">Codebase Overview</h2>
                    {summary ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-surface-l1 p-6 rounded-lg border border-outline-variant/40 text-center group hover:border-purple-500/40 transition-colors">
                          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-3">Total Changes Tracked</p>
                          <p className="text-5xl font-bold text-purple-400 font-mono">{summary.total_changes ?? 0}</p>
                        </div>
                        <div className="bg-surface-l1 p-6 rounded-lg border border-outline-variant/40 text-center group hover:border-blue-500/40 transition-colors">
                          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-3">Unique Files Touched</p>
                          <p className="text-5xl font-bold text-blue-400 font-mono">{summary.unique_files ?? 0}</p>
                        </div>
                      </div>
                    ) : <p className="text-on-surface-variant/40 text-sm">Loading summary…</p>}
                  </div>
                )}

                {/* HISTORY */}
                {activeTab === 'history' && (
                  <div className="space-y-3">
                    <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
                      Change Timeline · {history.length} entries
                    </h2>
                    {history.length === 0 ? (
                      <p className="text-on-surface-variant/40 text-sm">No history yet.</p>
                    ) : history.map(item => (
                      <div key={item.id}
                        className="bg-surface-l1 p-4 rounded-lg border border-outline-variant/30 flex justify-between items-start gap-4 hover:border-outline-variant/60 transition-colors">
                        <div className="min-w-0 flex items-start gap-3">
                          <FileCode2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"/>
                          <div>
                            <h3 className="font-mono text-sm text-on-surface truncate">{item.file_path}</h3>
                            <p className="text-[11px] text-on-surface-variant/60 mt-1 font-mono">
                              {new Date(item.timestamp || item.created_at || Date.now()).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] bg-purple-500/15 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/20 font-mono">
                            Impact: {item.impact_radius} nodes
                          </span>
                          <span className="text-[10px] text-on-surface-variant/30 font-mono">#{item.id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* EVOLUTION — big chart */}
                {activeTab === 'evolution' && (
                  <div className="space-y-4">
                    <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
                      Architectural Evolution
                    </h2>
                    {evolution.length === 0 ? (
                      <p className="text-on-surface-variant/40 text-sm">No data yet.</p>
                    ) : (
                      <div className="bg-surface-l1 p-6 rounded-xl border border-outline-variant/30">
                        {/* Chart area */}
                        <div className="relative">
                          {/* Y-axis grid lines */}
                          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
                            {[0,1,2,3,4].map(i => (
                              <div key={i} className="w-full border-t border-outline-variant/15"/>
                            ))}
                          </div>

                          {/* Bars */}
                          <div className="flex items-end gap-[3px] h-80 relative z-10">
                            {evolution.slice(0, 40).map((ev, i) => {
                              const maxImpact = Math.max(...evolution.slice(0, 40).map(e => e.impactRadius || 0), 1);
                              const pct = Math.max(3, ((ev.impactRadius || 0) / maxImpact) * 100);
                              const hue = 240 + (i / Math.max(evolution.slice(0, 40).length - 1, 1)) * 80; // blue 240 → pink 320
                              return (
                                <div key={i} className="flex-1 group relative flex flex-col justify-end h-full">
                                  <div
                                    className="rounded-t-md transition-all duration-300 cursor-pointer group-hover:opacity-100 opacity-80 group-hover:shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                                    style={{
                                      height: `${pct}%`,
                                      background: `linear-gradient(to top, hsl(${hue}, 70%, 45%), hsl(${hue}, 80%, 65%))`,
                                      minHeight: '4px',
                                    }}
                                  />
                                  {/* Tooltip */}
                                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                                    <div className="bg-surface-l3 border border-outline-variant/60 rounded-md px-3 py-2 text-[10px] whitespace-nowrap shadow-xl">
                                      <p className="font-mono text-on-surface font-semibold truncate max-w-[200px]">{ev.filePath || 'Unknown file'}</p>
                                      <p className="text-on-surface-variant mt-0.5">Impact: <span className="text-purple-300 font-bold">{ev.impactRadius}</span> files</p>
                                      <p className="text-on-surface-variant/60 mt-0.5">{ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* X-axis legend */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/20">
                          <span className="text-[10px] text-on-surface-variant/50 font-mono">Oldest</span>
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-3.5 h-3.5 text-on-surface-variant/40"/>
                            <span className="text-[10px] text-on-surface-variant/60">
                              Impact radius over time · {evolution.slice(0, 40).length} changes shown
                            </span>
                          </div>
                          <span className="text-[10px] text-on-surface-variant/50 font-mono">Newest</span>
                        </div>

                        {/* Summary row */}
                        <div className="grid grid-cols-3 gap-3 mt-4">
                          {[
                            { label: 'Avg Impact', value: (evolution.reduce((s,e) => s + (e.impactRadius||0), 0) / evolution.length).toFixed(1), color: 'text-blue-400' },
                            { label: 'Max Impact', value: Math.max(...evolution.map(e => e.impactRadius||0)), color: 'text-purple-400' },
                            { label: 'Total Changes', value: evolution.length, color: 'text-pink-400' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-surface-l2 rounded-lg p-3 border border-outline-variant/20 text-center">
                              <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">{label}</p>
                              <p className={`text-lg font-bold font-mono ${color} mt-1`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* GRAPH */}
                {activeTab === 'graph' && (
                  <div className="space-y-4">
                    <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">Dependency Impact Map</h2>
                    <div className="bg-surface-l1 p-6 rounded-lg border border-outline-variant/30">
                      <p className="text-on-surface-variant text-sm mb-4">
                        {graph.nodes.length} file nodes · {graph.edges.length} dependency edges
                      </p>
                      {graph.nodes.length === 0 ? (
                        <p className="text-on-surface-variant/40 text-sm">No dependencies detected yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {graph.nodes.map(n => (
                            <span key={n.id}
                              className="px-3 py-1.5 bg-surface-l2 border border-outline-variant/30 rounded-full text-xs font-mono text-on-surface-variant hover:border-purple-500/50 hover:text-purple-300 transition-all cursor-default"
                              title={n.id}>
                              {n.label.split('/').pop().split('\\').pop()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SEARCH */}
                {activeTab === 'search' && (
                  <div className="space-y-4">
                    <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">Search Past Changes</h2>
                    <form onSubmit={handleSearch} className="flex gap-2">
                      <input type="text" placeholder="Search by filename or code content…"
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-surface-l1 border border-outline-variant/40 rounded-lg focus:outline-none focus:border-accent-primary text-sm text-on-surface placeholder:text-on-surface-variant/40 transition-colors"/>
                      <button type="submit"
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors text-sm text-white">
                        Search
                      </button>
                    </form>
                    <div className="space-y-2 mt-4">
                      {searchResults.length > 0 ? searchResults.map(res => (
                        <div key={res.id} className="bg-surface-l1 p-4 rounded-lg border border-outline-variant/30 hover:border-outline-variant/60 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-mono text-sm text-on-surface flex items-center gap-2">
                              <FileCode2 className="w-3.5 h-3.5 text-blue-400"/>{res.file_path}
                            </h3>
                            <span className="text-[11px] bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20">Impact: {res.impact_radius}</span>
                          </div>
                          <p className="text-[11px] text-on-surface-variant/60 font-mono">{new Date(res.timestamp || res.created_at || Date.now()).toLocaleString()}</p>
                        </div>
                      )) : searchQuery ? (
                        <p className="text-on-surface-variant/40 text-sm">No matches found for "{searchQuery}".</p>
                      ) : (
                        <p className="text-on-surface-variant/40 text-sm">Enter a search term above.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

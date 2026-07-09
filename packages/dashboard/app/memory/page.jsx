'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://overseer-main.onrender.com';

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState('summary');
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);

  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [evolution, setEvolution] = useState([]);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // Step 1: auto-detect project ID from memory DB
  useEffect(() => {
    fetch(`${API_URL}/api/memory/projects`)
      .then(r => r.json())
      .then(rows => {
        setProjects(rows);
        if (rows.length > 0) setProjectId(rows[0].project_id); // most-recent project
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Step 2: load all data once we have a project ID
  useEffect(() => {
    if (!projectId) return;
    fetchSummary();
    fetchHistory();
    fetchEvolution();
    fetchGraph();
  }, [projectId]);

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${API_URL}/api/codebase/summary?project_id=${projectId}`);
      if (res.ok) setSummary(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/changes/history?project_id=${projectId}`);
      if (res.ok) setHistory(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchEvolution = async () => {
    try {
      const res = await fetch(`${API_URL}/api/codebase/evolution?project_id=${projectId}`);
      if (res.ok) setEvolution(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchGraph = async () => {
    try {
      const res = await fetch(`${API_URL}/api/graph/dependencies?project_id=${projectId}`);
      if (res.ok) setGraph(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery || !projectId) return;
    try {
      const res = await fetch(`${API_URL}/api/search/changes?project_id=${projectId}&q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) setSearchResults(await res.json());
    } catch (e) { console.error(e); }
  };

  const refreshAll = () => {
    if (!projectId) return;
    fetchSummary();
    fetchHistory();
    fetchEvolution();
    fetchGraph();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-blue-500">Overseer</span>
        </div>
        <nav className="flex gap-4">
          <Link href="/dashboard"    className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Live Analysis</Link>
          <Link href="/decision-map" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">🗺 Decision Map</Link>
          <Link href="/memory"       className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors">🧠 Memory</Link>
        </nav>

        {/* Project selector */}
        {projects.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-500">Project:</span>
            <select
              value={projectId || ''}
              onChange={e => setProjectId(e.target.value)}
              className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-purple-500"
            >
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_id.slice(0, 8)}… (last: {new Date(p.last_seen).toLocaleTimeString()})
                </option>
              ))}
            </select>
            <button
              onClick={refreshAll}
              className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors"
            >
              ↺ Refresh
            </button>
          </div>
        )}
      </header>

      <div className="p-6 max-w-5xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-2 text-zinc-100 flex items-center gap-3">
          🧠 Codebase Memory
        </h1>
        {projectId && (
          <p className="text-xs text-zinc-500 mb-6 font-mono">Project: {projectId}</p>
        )}

        {loading && (
          <div className="flex items-center justify-center h-40 text-zinc-500">
            <p>Detecting project from memory database…</p>
          </div>
        )}

        {!loading && !projectId && (
          <div className="bg-yellow-950/50 border border-yellow-800 rounded-lg p-6 text-yellow-300 mt-4">
            <p className="font-semibold mb-1">⚠️ No changes recorded yet</p>
            <p className="text-sm">Start the daemon with <code className="bg-zinc-800 px-1 rounded">overseer watch</code> and save a file to populate memory.</p>
          </div>
        )}

        {!loading && projectId && (
          <>
            <div className="flex gap-2 mb-8 border-b border-zinc-800 pb-2">
              {['summary', 'history', 'evolution', 'graph', 'search'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-zinc-800 text-white border-b-2 border-purple-500'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* SUMMARY TAB */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-zinc-200">Codebase Summary</h2>
                {summary ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800 text-center">
                      <p className="text-sm text-zinc-400 mb-2">Total Changes Tracked</p>
                      <p className="text-5xl font-bold text-purple-400">{summary.total_changes ?? 0}</p>
                    </div>
                    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800 text-center">
                      <p className="text-sm text-zinc-400 mb-2">Unique Files Touched</p>
                      <p className="text-5xl font-bold text-blue-400">{summary.unique_files ?? 0}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-500">Loading summary…</p>
                )}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-zinc-200">Change Timeline ({history.length} entries)</h2>
                {history.length === 0 ? (
                  <p className="text-zinc-500">No history yet.</p>
                ) : history.map(item => (
                  <div key={item.id} className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-mono text-sm text-blue-400 truncate">{item.file_path}</h3>
                      <p className="text-xs text-zinc-500 mt-1">{new Date(item.timestamp || item.created_at || Date.now()).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded border border-purple-800">
                        Impact: {item.impact_radius} nodes
                      </span>
                      <span className="text-xs text-zinc-600 font-mono">#{item.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* EVOLUTION TAB */}
            {activeTab === 'evolution' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-zinc-200">Architectural Evolution</h2>
                {evolution.length === 0 ? (
                  <p className="text-zinc-500">No data yet.</p>
                ) : (
                  <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                    <div className="flex items-end gap-1 h-48">
                      {evolution.slice(0, 30).map((ev, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-purple-500/60 hover:bg-purple-400 rounded-t transition-colors cursor-pointer"
                          style={{ minHeight: '4px', height: `${Math.max(4, (ev.impactRadius || 0) * 20 + 4)}px`, maxHeight: '100%' }}
                          title={`${ev.filePath}\nImpact: ${ev.impactRadius}\n${ev.timestamp}`}
                        />
                      ))}
                    </div>
                    <p className="text-center text-xs text-zinc-500 mt-3">
                      Impact Radius Over Time (each bar = one change, height = # files affected)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* GRAPH TAB */}
            {activeTab === 'graph' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-zinc-200">Dependency Impact Map</h2>
                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                  <p className="text-zinc-400 text-sm mb-4">
                    {graph.nodes.length} file nodes · {graph.edges.length} dependency edges
                  </p>
                  {graph.nodes.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No dependencies detected yet. Dependency analysis runs on each file save.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {graph.nodes.map(n => (
                        <span
                          key={n.id}
                          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs font-mono text-zinc-300 hover:border-purple-500 hover:text-purple-300 transition-colors"
                          title={n.id}
                        >
                          {n.label.split('/').pop().split('\\').pop()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SEARCH TAB */}
            {activeTab === 'search' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-zinc-200">Search Past Changes</h2>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by filename or code content…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:border-purple-500 text-sm"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors text-sm"
                  >
                    Search
                  </button>
                </form>
                <div className="space-y-2 mt-4">
                  {searchResults.length > 0 ? searchResults.map(res => (
                    <div key={res.id} className="bg-zinc-900 p-4 rounded-lg border border-zinc-800">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-mono text-sm text-blue-400">{res.file_path}</h3>
                        <span className="text-xs bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded">Impact: {res.impact_radius}</span>
                      </div>
                      <p className="text-xs text-zinc-500">{new Date(res.timestamp || res.created_at || Date.now()).toLocaleString()}</p>
                    </div>
                  )) : searchQuery ? (
                    <p className="text-zinc-500 text-sm">No matches found for "{searchQuery}".</p>
                  ) : (
                    <p className="text-zinc-500 text-sm">Enter a search term above.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

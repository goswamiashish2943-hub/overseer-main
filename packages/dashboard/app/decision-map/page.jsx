// packages/dashboard/app/decision-map/page.jsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { mockNodes, mockConnections } from '../../lib/mockData';
import RootNode      from '../../components/decision-map/RootNode';
import FileNode      from '../../components/decision-map/FileNode';
import ChangeNode    from '../../components/decision-map/ChangeNode';
import SVGConnectors from '../../components/decision-map/SVGConnectors';
import SelectionPanel from '../../components/decision-map/SelectionPanel';
import { Network } from 'lucide-react';

export default function DecisionMapPage() {
  const [nodes]         = useState(mockNodes);
  const [connections]   = useState(mockConnections);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId,  setHoveredId]  = useState(null);

  // Escape key to deselect
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

  /** Dim change-nodes that don't belong to the hovered/selected file */
  const isDimmed = (node) => {
    if (node.type !== 'change') return false;
    const focusId = hoveredId || selectedId;
    if (!focusId) return false;
    const focus = nodes.find(n => n.id === focusId);
    if (!focus) return false;
    if (focus.type === 'file')   return node.parentId !== focusId;
    if (focus.type === 'change') return node.id !== focusId;
    return false;
  };

  const handleCanvasBg = (e) => {
    if (e.currentTarget === e.target) setSelectedId(null);
  };

  return (
    <div className="min-h-screen bg-surface-l0 text-on-surface flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Header ── */}
      <header className="border-b border-outline-variant/60 px-6 py-3 flex flex-wrap items-center gap-6 bg-surface-l1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-blue-500">Overseer</span>
          <span className="text-xs text-on-surface-variant hidden sm:block">Know what your AI is building.</span>
        </div>

        <nav className="flex gap-5">
          <Link href="/dashboard"    className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Live Analysis</Link>
          <Link href="/decision-map" className="text-sm font-medium text-on-surface border-b border-accent-primary pb-0.5">🗺 Decision Map</Link>
          <Link href="/memory"       className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors">🧠 Memory</Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 bg-surface-l2 px-2.5 py-1 rounded border border-outline-variant/30">
          <span className="w-1.5 h-1.5 rounded-full bg-stable animate-pulse" />
          <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Active Workspace</span>
        </div>
      </header>

      {/* ── Canvas + Panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          className="flex-1 relative canvas-grid overflow-auto cursor-default"
          onClick={handleCanvasBg}
        >
          {/* Legend overlay */}
          <div className="absolute top-5 left-5 z-30 bg-surface-l1/90 backdrop-blur border border-outline-variant rounded p-3 max-w-xs space-y-2 pointer-events-auto">
            <div className="flex items-center gap-1.5 border-b border-outline-variant/30 pb-1.5">
              <Network className="w-4 h-4 text-accent-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">Dependency Tree Map</span>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Hover to trace connections. Click a node to inspect details.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 border-t border-outline-variant/20">
              {[['bg-stable','Stable'],['bg-warning','Warning'],['bg-critical','Critical']].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1 text-[9px] font-mono text-on-surface-variant">
                  <span className={`w-1.5 h-1.5 rounded-full ${c}`} /> {l}
                </span>
              ))}
            </div>
          </div>

          {/* Keyboard hint */}
          {selectedId && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-surface-l2/80 backdrop-blur border border-outline-variant/40 rounded px-3 py-1.5 text-[10px] font-mono text-on-surface-variant pointer-events-none">
              Press <span className="bg-surface-l3 px-1.5 py-0.5 rounded text-on-surface mx-1">Esc</span> or click canvas to deselect
            </div>
          )}

          {/* SVG connector layer */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <SVGConnectors
              connections={connections}
              nodes={nodes}
              hoveredNodeId={hoveredId}
              selectedNodeId={selectedId}
            />
          </div>

          {/* Nodes layer */}
          <div className="relative z-20" style={{ minWidth: 1200, minHeight: 750 }}>
            {nodes.map(node => {
              const props = {
                key:          node.id,
                node,
                isSelected:   selectedId === node.id,
                isHovered:    hoveredId  === node.id,
                onClick:      () => setSelectedId(node.id),
                onMouseEnter: () => setHoveredId(node.id),
                onMouseLeave: () => setHoveredId(null),
              };
              if (node.type === 'root')   return <RootNode   {...props} />;
              if (node.type === 'file')   return <FileNode   {...props} />;
              if (node.type === 'change') return <ChangeNode {...props} isDimmed={isDimmed(node)} />;
              return null;
            })}
          </div>
        </div>

        {/* Side panel */}
        {selectedNode && (
          <SelectionPanel node={selectedNode} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}

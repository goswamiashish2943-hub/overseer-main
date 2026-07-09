// packages/dashboard/app/decision-map/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { mockNodes, mockConnections } from '../../lib/mockData';
import RootNode      from '../../components/decision-map/RootNode';
import FileNode      from '../../components/decision-map/FileNode';
import ChangeNode    from '../../components/decision-map/ChangeNode';
import SVGConnectors from '../../components/decision-map/SVGConnectors';
import SelectionPanel from '../../components/decision-map/SelectionPanel';
import Sidebar       from '../../components/Sidebar';
import { Network } from 'lucide-react';

export default function DecisionMapPage() {
  const [nodes]       = useState(mockNodes);
  const [connections] = useState(mockConnections);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId,  setHoveredId]  = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

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
    <div className="min-h-screen flex bg-surface-l0 text-on-surface">
      <Sidebar />

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <div className="h-14 border-b border-outline-variant/40 bg-surface-l1 flex items-center px-5 gap-4 flex-shrink-0">
          <h1 className="text-sm font-semibold text-on-surface">Decision Map</h1>
          <div className="ml-auto flex items-center gap-2 bg-surface-l2 px-2.5 py-1 rounded border border-outline-variant/30">
            <span className="w-1.5 h-1.5 rounded-full bg-stable animate-pulse"/>
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Active Workspace</span>
          </div>
        </div>

        {/* Canvas + Panel */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 relative canvas-grid overflow-auto cursor-default" onClick={handleCanvasBg}>
            {/* Legend */}
            <div className="absolute top-5 left-5 z-30 bg-surface-l1/90 backdrop-blur border border-outline-variant rounded p-3 max-w-xs space-y-2 pointer-events-auto">
              <div className="flex items-center gap-1.5 border-b border-outline-variant/30 pb-1.5">
                <Network className="w-4 h-4 text-accent-primary"/>
                <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">Dependency Tree Map</span>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Hover to trace connections. Click a node to inspect details.</p>
              <div className="flex flex-wrap gap-3 pt-1 border-t border-outline-variant/20">
                {[['bg-stable','Stable'],['bg-warning','Warning'],['bg-critical','Critical']].map(([c,l])=>(
                  <span key={l} className="flex items-center gap-1 text-[9px] font-mono text-on-surface-variant">
                    <span className={`w-1.5 h-1.5 rounded-full ${c}`}/>{l}
                  </span>
                ))}
              </div>
            </div>

            {selectedId && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-surface-l2/80 backdrop-blur border border-outline-variant/40 rounded px-3 py-1.5 text-[10px] font-mono text-on-surface-variant pointer-events-none">
                Press <span className="bg-surface-l3 px-1.5 py-0.5 rounded text-on-surface mx-1">Esc</span> or click canvas to deselect
              </div>
            )}

            <div className="absolute inset-0 pointer-events-none z-10">
              <SVGConnectors connections={connections} nodes={nodes} hoveredNodeId={hoveredId} selectedNodeId={selectedId}/>
            </div>

            <div className="relative z-20" style={{ minWidth: 1200, minHeight: 750 }}>
              {nodes.map(node => {
                const props = {
                  key: node.id, node,
                  isSelected: selectedId === node.id,
                  isHovered:  hoveredId  === node.id,
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

          {selectedNode && <SelectionPanel node={selectedNode} onClose={() => setSelectedId(null)}/>}
        </div>
      </div>
    </div>
  );
}

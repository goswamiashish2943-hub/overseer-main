// packages/dashboard/components/decision-map/FileNode.jsx
'use client';

import { FileCode2 } from 'lucide-react';

export default function FileNode({ node, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) {
  const { stable = 100, warning = 0, critical = 0 } = node.healthMetrics || {};

  return (
    <div
      style={{ left: node.position.x, top: node.position.y }}
      className="absolute -translate-y-1/2 cursor-pointer z-20"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={`bg-surface-l1 rounded p-3 w-40 border transition-all duration-300 ${
          isSelected
            ? 'bg-surface-l2 border-accent-primary border-2 shadow-[0_0_24px_rgba(200,198,197,0.35)]'
            : isHovered
            ? 'bg-surface-l2 border-accent-primary shadow-[0_0_16px_rgba(200,198,197,0.2)]'
            : 'border-outline-variant hover:bg-surface-l2 hover:border-accent-primary'
        }`}
      >
        <div className="flex items-center gap-2">
          <FileCode2
            className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-accent-primary' : 'text-on-surface-variant'}`}
          />
          <span className="font-mono text-xs truncate lowercase flex-1 text-on-surface" title={node.label}>
            {node.label}
          </span>
        </div>

        {/* 3-bar health indicator */}
        <div className="flex gap-1.5 mt-3" title={`Stable ${stable}% / Warning ${warning}% / Critical ${critical}%`}>
          <div className="h-1 rounded-sm bg-stable flex-1" style={{ opacity: stable > 0 ? 1 : 0.15 }} />
          <div className="h-1 rounded-sm bg-warning flex-1" style={{ opacity: warning > 0 ? 1 : 0.15 }} />
          <div className="h-1 rounded-sm bg-critical flex-1" style={{ opacity: critical > 0 ? 1 : 0.15 }} />
        </div>
      </div>
    </div>
  );
}

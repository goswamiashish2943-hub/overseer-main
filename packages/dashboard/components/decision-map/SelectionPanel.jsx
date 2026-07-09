// packages/dashboard/components/decision-map/SelectionPanel.jsx
'use client';

import { X, FileCode2, ShieldAlert, GitCommit } from 'lucide-react';

const TYPE_ICON = {
  root:   <GitCommit   className="w-4 h-4 text-warning"   />,
  file:   <FileCode2   className="w-4 h-4 text-blue-400"  />,
  change: <ShieldAlert className="w-4 h-4 text-critical"  />,
};

export default function SelectionPanel({ node, onClose }) {
  if (!node) return null;

  return (
    <aside className="w-88 min-w-[22rem] bg-surface-l1 border-l border-outline-variant flex flex-col h-full z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/40">
        <div className="flex items-center gap-2">
          {TYPE_ICON[node.type]}
          <span className="font-mono text-[10px] tracking-widest text-on-surface-variant font-bold uppercase">
            {node.type} Details
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="p-1 rounded hover:bg-surface-l2 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-on-surface leading-tight">{node.label}</h2>
          <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">{node.description}</p>
        </div>

        {/* ── Root metadata ── */}
        {node.type === 'root' && (
          <div className="bg-surface-l2 rounded p-3 border border-outline-variant/30 space-y-2 text-xs">
            <Row label="Session ID"   value={node.sessionId} mono />
            <Row label="Duration"     value={node.tracingDuration} mono />
            <Row label="Created"      value={new Date(node.timestamp).toLocaleTimeString()} mono />
          </div>
        )}

        {/* ── File metadata ── */}
        {node.type === 'file' && (
          <div className="space-y-4">
            <div className="bg-surface-l2 rounded p-3 border border-outline-variant/30 text-xs space-y-1">
              <p className="text-on-surface-variant">Full Path</p>
              <p className="font-mono text-on-surface break-all">{node.filePath}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                Health Distribution
              </p>
              <HealthBar label="Stable"   color="bg-stable"   pct={node.healthMetrics?.stable   ?? 0} />
              <HealthBar label="Warning"  color="bg-warning"  pct={node.healthMetrics?.warning  ?? 0} />
              <HealthBar label="Critical" color="bg-critical" pct={node.healthMetrics?.critical ?? 0} />
            </div>
          </div>
        )}

        {/* ── Change metadata ── */}
        {node.type === 'change' && (
          <div className="space-y-4">
            <div className="bg-surface-l2 rounded p-3 border border-outline-variant/30 text-xs space-y-2">
              <Row label="Line"        value={`L${node.lineNumber}`}  mono />
              <Row label="Change Type" value={node.changeType} />
              <Row
                label="Severity"
                value={node.severity}
                valueClass={
                  node.severity === 'high'   ? 'text-critical font-bold' :
                  node.severity === 'medium' ? 'text-warning  font-bold' :
                  'text-stable font-bold'
                }
              />
            </div>
            {node.reason && (
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Justification
                </p>
                <p className="text-xs text-on-surface leading-relaxed bg-surface-low border border-outline-variant/30 rounded p-2.5">
                  {node.reason}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value, mono = false, valueClass = '' }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-on-surface-variant">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} text-on-surface ${valueClass}`}>{value}</span>
    </div>
  );
}

function HealthBar({ label, color, pct }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] mb-1">
        <span className={`font-medium ${color.replace('bg-', 'text-')}`}>{label}</span>
        <span className="font-mono text-on-surface">{pct}%</span>
      </div>
      <div className="w-full bg-surface-l2 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

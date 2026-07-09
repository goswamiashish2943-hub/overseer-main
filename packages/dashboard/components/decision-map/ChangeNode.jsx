// packages/dashboard/components/decision-map/ChangeNode.jsx
'use client';

const STATUS = {
  stable:   { dot: 'bg-stable',   badge: 'text-stable   bg-stable/10   border-stable/20'   },
  warning:  { dot: 'bg-warning',  badge: 'text-warning  bg-warning/10  border-warning/20'  },
  critical: { dot: 'bg-critical', badge: 'text-critical bg-critical/10 border-critical/20' },
};

export default function ChangeNode({ node, isSelected, isHovered, isDimmed, onClick, onMouseEnter, onMouseLeave }) {
  const s = STATUS[node.status] || STATUS.stable;

  return (
    <div
      style={{ left: node.position.x, top: node.position.y }}
      className={`absolute -translate-y-1/2 cursor-pointer z-20 transition-opacity duration-300 ${
        isDimmed ? 'opacity-40 hover:opacity-100' : 'opacity-100'
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={`bg-surface-l1 rounded-md p-3.5 w-72 border transition-all duration-300 flex flex-col gap-2 ${
          isSelected
            ? 'bg-surface-l2 border-accent-primary border-2 shadow-[0_0_24px_rgba(200,198,197,0.35)]'
            : isHovered
            ? 'bg-surface-l2 border-accent-primary shadow-[0_0_16px_rgba(200,198,197,0.2)]'
            : 'border-outline-variant hover:border-accent-primary'
        }`}
      >
        {/* Row 1 — status badge + line number */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${s.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {node.status}
          </div>
          {node.lineNumber && (
            <span className="font-mono text-[10px] text-on-surface-variant">L{node.lineNumber}</span>
          )}
        </div>

        {/* Row 2 — title + description */}
        <div>
          <h4 className="text-xs font-semibold text-on-surface leading-snug">{node.label}</h4>
          <p className="text-[11px] text-on-surface-variant mt-1 leading-normal">{node.description}</p>
        </div>

        {/* Row 3 — reason + severity chip */}
        {node.reason && (
          <div className="pt-1.5 border-t border-outline-variant/30 flex items-center justify-between gap-2 text-[9px] font-mono text-on-surface-variant">
            <span className="truncate">Reason: {node.reason}</span>
            <span className={`px-1.5 py-0.5 rounded uppercase font-semibold flex-shrink-0 ${
              node.severity === 'high'   ? 'bg-critical/20 text-critical' :
              node.severity === 'medium' ? 'bg-warning/20  text-warning'  :
              'bg-stable/20 text-stable'
            }`}>
              {node.severity}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

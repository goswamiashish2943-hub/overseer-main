// packages/dashboard/components/decision-map/RootNode.jsx
'use client';

export default function RootNode({ node, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) {
  const statusColor =
    node.status === 'stable' ? 'bg-stable' :
    node.status === 'warning' ? 'bg-warning' :
    'bg-critical';

  return (
    <div
      style={{ left: node.position.x, top: node.position.y }}
      className="absolute -translate-y-1/2 cursor-pointer z-20"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={`bg-surface-l1 rounded p-3 w-44 border transition-all duration-300 relative ${
          isSelected
            ? 'border-accent-primary border-2 shadow-[0_0_24px_rgba(200,198,197,0.35)]'
            : isHovered
            ? 'border-accent-primary shadow-[0_0_16px_rgba(200,198,197,0.2)]'
            : 'border-outline-variant hover:border-accent-primary'
        }`}
      >
        {/* Animated pulse status dot — top-right */}
        <div className="absolute top-3 right-3 flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor}`} />
        </div>

        <p className="font-mono text-[10px] tracking-widest text-on-surface-variant font-medium uppercase mb-1">
          SESSION ROOT
        </p>
        <h3 className="text-sm font-semibold text-on-surface leading-tight">
          {node.label}
        </h3>
        <div className="font-mono text-[9px] text-on-surface-variant mt-2 flex items-center justify-between">
          <span>{node.sessionId}</span>
          <span className="bg-surface-l2 px-1.5 py-0.5 rounded text-[8px]">{node.tracingDuration}</span>
        </div>
      </div>
    </div>
  );
}

// packages/dashboard/components/decision-map/SVGConnectors.jsx
'use client';

// Node widths for right-edge calculation
const NODE_WIDTH = { root: 176, file: 160, change: 288 };

export default function SVGConnectors({ connections, nodes, hoveredNodeId, selectedNodeId }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
      {connections.map(conn => {
        const from = byId[conn.fromNodeId];
        const to   = byId[conn.toNodeId];
        if (!from || !to) return null;

        // Start = right edge of source node, End = left edge of target node
        const x1 = from.position.x + (NODE_WIDTH[from.type] || 160);
        const y1 = from.position.y;
        const x2 = to.position.x;
        const y2 = to.position.y;

        // Quadratic Bézier control point: midpoint-X, source-Y
        const cx = (x1 + x2) / 2;
        const d  = `M ${x1} ${y1} Q ${cx} ${y1} ${x2} ${y2}`;

        const isHov = hoveredNodeId && (hoveredNodeId === conn.fromNodeId || hoveredNodeId === conn.toNodeId);
        const isSel = selectedNodeId && (selectedNodeId === conn.fromNodeId || selectedNodeId === conn.toNodeId);

        const cls = `tree-line${isHov ? ' tree-line--hovered' : isSel || conn.isActive ? ' tree-line--active' : ''}`;

        return (
          <g key={conn.id}>
            {/* Invisible wide hit-area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
            <path d={d} className={cls} />
          </g>
        );
      })}
    </svg>
  );
}

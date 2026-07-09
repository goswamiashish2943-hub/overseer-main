// packages/dashboard/lib/mockData.js

export const mockNodes = [
  {
    id: "root-1",
    type: "root",
    label: "OAuth Migration",
    description: "Refactor session management to OAuth 2.0 flow",
    status: "warning",
    position: { x: 60, y: 350 },
    parentId: null,
    childrenIds: ["file-1", "file-2", "file-3"],
    sessionId: "sess-99b38c21",
    timestamp: Date.now() - 3600000,
    tracingDuration: "42ms"
  },
  {
    id: "file-1",
    type: "file",
    label: "auth.js",
    description: "Authentication middleware and session verification",
    status: "stable",
    position: { x: 350, y: 150 },
    parentId: "root-1",
    childrenIds: [],
    filePath: "packages/backend/src/auth.js",
    fileName: "auth.js",
    healthMetrics: { stable: 100, warning: 0, critical: 0 }
  },
  {
    id: "file-2",
    type: "file",
    label: "websocket.js",
    description: "Real-time socket communication and event handling",
    status: "critical",
    position: { x: 350, y: 350 },
    parentId: "root-1",
    childrenIds: ["change-1", "change-2", "change-3"],
    filePath: "packages/backend/src/websocket.js",
    fileName: "websocket.js",
    healthMetrics: { stable: 30, warning: 30, critical: 40 }
  },
  {
    id: "file-3",
    type: "file",
    label: "db.js",
    description: "Database connection pooling and helper queries",
    status: "stable",
    position: { x: 350, y: 550 },
    parentId: "root-1",
    childrenIds: [],
    filePath: "packages/backend/src/db.js",
    fileName: "db.js",
    healthMetrics: { stable: 90, warning: 10, critical: 0 }
  },
  {
    id: "change-1",
    type: "change",
    label: "Fix handshake timeout",
    description: "Increase socket handshake timeout from 5s to 15s under high load conditions to prevent client drop-offs.",
    status: "stable",
    position: { x: 700, y: 220 },
    parentId: "file-2",
    childrenIds: [],
    lineNumber: 42,
    changeType: "bug",
    reason: "Slow response on database auth lookup during socket initialization",
    severity: "low"
  },
  {
    id: "change-2",
    type: "change",
    label: "Handle abrupt close",
    description: "Implement heartbeat ping/pong protocol to detect and prune dead client socket connections actively.",
    status: "critical",
    position: { x: 700, y: 370 },
    parentId: "file-2",
    childrenIds: [],
    lineNumber: 120,
    changeType: "feature",
    reason: "Resource leakage from half-open socket connections remaining in memory",
    severity: "high"
  },
  {
    id: "change-3",
    type: "change",
    label: "Optimize ping interval",
    description: "Adjust ping interval dynamically based on number of active client connections to reduce CPU overhead.",
    status: "warning",
    position: { x: 700, y: 520 },
    parentId: "file-2",
    childrenIds: [],
    lineNumber: 180,
    changeType: "optimization",
    reason: "High CPU utilization detected on socket server when hosting 1000+ active connections",
    severity: "medium"
  }
];

export const mockConnections = [
  {
    id: "conn-1",
    fromNodeId: "root-1",
    toNodeId: "file-1",
    type: "direct",
    isActive: false,
    metadata: { reason: "Initial auth structure modification" }
  },
  {
    id: "conn-2",
    fromNodeId: "root-1",
    toNodeId: "file-2",
    type: "direct",
    isActive: true,
    metadata: { reason: "Sockets require authorization state changes" }
  },
  {
    id: "conn-3",
    fromNodeId: "root-1",
    toNodeId: "file-3",
    type: "direct",
    isActive: false,
    metadata: { reason: "Schema updates for sessions" }
  },
  {
    id: "conn-4",
    fromNodeId: "file-2",
    toNodeId: "change-1",
    type: "direct",
    isActive: true,
    metadata: { reason: "Socket lifecycle verification" }
  },
  {
    id: "conn-5",
    fromNodeId: "file-2",
    toNodeId: "change-2",
    type: "direct",
    isActive: true,
    metadata: { reason: "Socket heartbeat management" }
  },
  {
    id: "conn-6",
    fromNodeId: "file-2",
    toNodeId: "change-3",
    type: "direct",
    isActive: true,
    metadata: { reason: "Connection scaling optimizations" }
  }
];

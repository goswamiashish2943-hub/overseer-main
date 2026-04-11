// packages/dashboard/lib/store.js
// Zustand store — global state for the live feed dashboard

import { create } from 'zustand';

const useStore = create((set) => ({
  // Live feed items — each is a Gemini analysis result
  feedItems: [],

  // Session stats shown in right panel
  sessionStats: {
    criticalCount: 0,
    warningCount:  0,
    goodCount:     0,
    infoCount:     0,
    filesTouched:  [],
    analysisCount: 0,
  },


  // WebSocket connection status
  wsConnected: false,

  // Current session ID
  sessionId: null,

  // ── Actions ──────────────────────────────────────────────────────────────

  addFeedItem: (item) => set((state) => ({
    // All enhanced fields are optional — basic items just won't have them
    feedItems: [item, ...state.feedItems].slice(0, 200), // keep last 200
    sessionStats: {
      ...state.sessionStats,
      analysisCount: state.sessionStats.analysisCount + 1,
      criticalCount: state.sessionStats.criticalCount + (item.severity === 'critical' ? 1 : 0),
      warningCount:  state.sessionStats.warningCount  + (item.severity === 'warning'  ? 1 : 0),
      goodCount:     state.sessionStats.goodCount     + (item.severity === 'good'     ? 1 : 0),
      infoCount:     state.sessionStats.infoCount     + (['info','context'].includes(item.severity) ? 1 : 0),
      filesTouched: state.sessionStats.filesTouched.includes(item.filePath)
        ? state.sessionStats.filesTouched
        : [...state.sessionStats.filesTouched, item.filePath],
    },
  })),


  setWsConnected: (connected) => set({ wsConnected: connected }),

  setSessionId: (sessionId) => set({ sessionId }),

  clearFeed: () => set({
    feedItems: [],
    sessionStats: {
      criticalCount: 0,
      warningCount:  0,
      goodCount:     0,
      infoCount:     0,
      filesTouched:  [],
      analysisCount: 0,
    },
  }),
}));

export default useStore;

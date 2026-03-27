---
name: dashboard-ui
description: UI patterns for the overseer Next.js dashboard.
  Load for any frontend component, page, or styling task.
triggers:
  - "dashboard"
  - "component"
  - "tailwind"
  - "frontend"
  - "ui"
  - "page"
  - "next.js"
  - "react"
---

# Dashboard UI patterns for overseer

## Component rules
- Always use Tailwind CSS — no custom CSS files
- Use shadcn/ui components for: buttons, cards, badges,
  inputs, dialogs, tooltips
- Use Zustand for global state (live feed, session stats)
- Dark mode support required — always use Tailwind dark: prefix

## Feed item severity colour map
critical  → bg-red-50 border-red-200 text-red-800
warning   → bg-amber-50 border-amber-200 text-amber-800
good      → bg-green-50 border-green-200 text-green-800
info      → bg-blue-50 border-blue-200 text-blue-800
context   → bg-gray-50 border-gray-200 text-gray-600

## WebSocket connection pattern (in Zustand store)
const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL)
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  useoverseerStore.getState().addFeedItem(data)
}

## Zustand store shape (do not change structure)
{
  feedItems: [],        // live analysis feed
  sessionStats: {       // current session numbers
    critical: 0, warning: 0, good: 0,
    linesWritten: 0, filesTouched: [], goalAlignment: 0
  },
  currentGoal: '',
  quotaState: { used: 0, limit: 200, mode: 'active' },
  addFeedItem: (item) => {},
  updateStats: (stats) => {}
}

## Page routing (Next.js App Router)
app/page.tsx          → landing / login
app/dashboard/page.tsx → main live feed
app/session/[id]/page.tsx → historical session view
app/settings/page.tsx → project settings, quota info

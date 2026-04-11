# Overseer Architecture

## Overview

Overseer is a real-time AI code narration tool. It watches your project for file changes, analyzes them with Groq (Llama 3.3 70B), and shows a live feed on a dashboard.

---

## Components

### Daemon (`packages/daemon`)
- **Language**: Node.js
- **Entry**: `src/cli.js` → `overseer watch [dir]`
- **Responsibilities**:
  - Watch file system via `chokidar` (`watcher.js`)
  - Detect `.md` context files via polling (`fileWatcher.js`)
  - Upload context files to backend (`POST /api/context`)
  - Extract diffs (`diffExtractor.js`)
  - Route diffs to backend or checkpoint queue (`sender.js`)
  - Track API quota (`quotaTracker.js`)

### Backend (`packages/backend`)
- **Language**: Node.js / Express
- **Entry**: `src/index.js` (port 4000)
- **Routes**:
  - `POST /analyze` — receives diffs, runs analysis, saves to Supabase
  - `GET/POST /api/context` — stores/retrieves `.md` context files
  - `GET /health` — health check
- **Analysis pipeline** (`upgradeAnalysis.js`):
  - **Call 1**: Suggestion + Better Approach + Alignment + Decisions (one prompt)
  - **Call 2**: Line-by-line Change Breakdown
  - **Fallback**: Basic single-call analysis if either call fails

### Dashboard (`packages/dashboard`)
- **Framework**: Next.js (React)
- **Entry**: `app/dashboard/page.jsx`
- **Key component**: `components/EnhancedAnalysis.jsx`
- **Real-time**: WebSocket connection to backend
- **Feed**: Shows `EnhancedAnalysis` (6 sections) or basic `FeedCard` (fallback)

### Database (Supabase)
| Table | Purpose |
|---|---|
| `sessions` | Active daemon sessions |
| `events` | All analysis events |
| `file_knowledge` | Per-file summary and risk history |
| `project_context_files` | Stored `.md` context files |
| `code_sessions` | Full enhanced analysis records |
| `codebase_patterns` | Learned patterns (future) |

---

## Analysis Flow

```
File change
  → diff extracted
  → POST /analyze
  → contextBuilder (file history)
  → fetchProjectContext (.md files)
  → upgradeAnalysis (2 Groq calls)
  → WebSocket broadcast
  → Dashboard EnhancedAnalysis component
```

## Context Detection Flow

```
npm start (daemon)
  → fileWatcher scans project root
  → finds README.md, ARCHITECTURE.md, TECH_CHOICES.md, SECURITY.md
  → uploads to POST /api/context
  → every 5 seconds polls for changes
  → changed files re-uploaded automatically
```

---

## No Manual Setup

1. Developer adds `.md` files to project
2. Runs `npm run overseer` (or `overseer watch`)
3. Everything else is automatic

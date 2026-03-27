---
name: Overseer-architecture
description: Complete system architecture for the Overseer project.
  Load when asked about how parts of the system connect,
  adding new modules, data flow, or integration between packages.
triggers:
  - "how does Overseer work"
  - "how does the system"
  - "data flow"
  - "connect to backend"
  - "architecture"
  - "add a new module"
  - "integrate"
---

# Overseer system architecture — complete reference

## Data flow (every file change, start to finish)
1. AI agent saves a file in developer's project
2. chokidar fires onChange(filePath) in daemon
3. diffExtractor.js computes what changed (added/removed lines)
4. If diff > 60 lines → split into 50-line chunks
5. quotaTracker.js checks current mode:
   - active (0–79% quota used) → send to backend
   - warning (80–99%) → batch rapid saves of same file, then send
   - checkpoint (100%) → write to .Overseer/checkpoint_{sessionId}.json
6. Backend receives POST /analyze
7. authMiddleware.js validates JWT + checks project_id
8. contextBuilder.js fetches file history from file_knowledge table
9. geminiAnalyser.js builds prompt + calls Gemini Flash (streaming)
10. Stream piped to WebSocket → dashboard live feed
11. PARALLEL: Supabase insert into events table
12. PARALLEL: Supabase upsert into file_knowledge table
13. PARALLEL: quota counter decremented by 1

## Three Supabase tables (never change schema without asking)
sessions:
  session_id uuid PK, project_id uuid FK, user_id uuid FK,
  goal_text text, goal_alignment int, summary_text text,
  files_touched text[], critical_count int, warning_count int,
  started_at timestamptz, ended_at timestamptz

events:
  event_id uuid PK, session_id uuid FK, project_id uuid FK,
  file_path text, diff_text text,
  severity text CHECK(severity IN ('critical','warning','good','info','context')),
  analysis_text text, embedding vector(1536),
  created_at timestamptz DEFAULT now()

file_knowledge:
  id uuid PK, project_id uuid FK, file_path text,
  current_summary text, first_built_session uuid FK,
  times_modified int DEFAULT 0, open_risks text[],
  embedding vector(1536), updated_at timestamptz
  UNIQUE(project_id, file_path) -- enables upsert

## Package boundaries (each package is independent)
packages/daemon  → runs on developer's machine, published to npm
packages/backend → runs on Railway, never exposed to browser
packages/dashboard → runs on Vercel, talks to backend + Supabase

## Checkpoint file format (.Overseer/checkpoint_{sessionId}.json)
{
  "session_id": "sess_xxx",
  "project_id": "proj_xxx",
  "created_at": "ISO timestamp",
  "quota_reset_date": "YYYY-MM-01",
  "queue": [
    { "file": "src/auth.js", "diff": "+lines...", "timestamp": "HH:MM:SS", "chunk_index": 0 }
  ]
}

## Environment variables (required for each package)
Daemon:
  Overseer_API_URL, Overseer_AUTH_TOKEN

Backend:
  SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY,
  JWT_SECRET, PORT, ALLOWED_ORIGINS

Dashboard:
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_WS_URL


# OVERSEER — PROJECT REQUIREMENTS
# Save this as: overseer-requirements.md in the root of the project
# This is the single source of truth for the entire project.
# Antigravity agents read this to understand what Overseer is and what it must do.
# Last updated: after watcher.js and diffExtractor.js written by Claude

---

## Branding and naming

Product name:     Overseer
CLI command:      overseer watch
npm package:      @useoverseer/daemon
Website:          useoverseer.dev (target domain)
Dashboard URL:    app.useoverseer.dev
npm scope:        @useoverseer
GitHub org:       github.com/useoverseer
Twitter/X:        @useoverseer
Tagline:          "Know what your AI is building."

Use "Overseer" (capitalised) when referring to the product.
Use "overseer" (lowercase) for CLI commands, npm packages, and code.
Never use the old name "Scope" anywhere.

---

## CODE STATUS — read this before touching any file

STATUS meanings:
  WRITTEN BY CLAUDE  — complete, production-ready, do not modify ever
  PLACEHOLDER        — stub code only, Claude will write this
  AGENT OK           — Antigravity agent may create or edit freely

### packages/daemon/src/

| File                 | Status            | Notes                                      |
|----------------------|-------------------|--------------------------------------------|
| watcher.js           | WRITTEN BY CLAUDE | Core file watcher. Final. No edits ever.   |
| diffExtractor.js     | WRITTEN BY CLAUDE | Diff engine + chunker. Final. No edits.    |
| quotaTracker.js      | PLACEHOLDER       | Claude writes this next                    |
| checkpointEngine.js  | WRITTEN BY CLAUDE | Core checkpoint logic. Final.            |
| sender.js            | PLACEHOLDER       | Claude writes after checkpointEngine       |
| cli.js               | PLACEHOLDER       | Claude writes last in daemon sequence      |
| index.js             | PLACEHOLDER       | Claude writes last in daemon sequence      |

### packages/backend/src/

| File                 | Status            | Notes                                      |
|----------------------|-------------------|--------------------------------------------|
| index.js             | PLACEHOLDER       | Basic stub — Claude will complete          |
| authMiddleware.js    | PLACEHOLDER       | Claude writes this                         |
| geminiAnalyser.js    | PLACEHOLDER       | Claude writes this                         |
| websocket.js         | PLACEHOLDER       | Claude writes this                         |
| contextBuilder.js    | PLACEHOLDER       | Claude writes this                         |
| analyseRoute.js      | PLACEHOLDER       | Claude writes this                         |

### packages/dashboard/

| File / folder        | Status            | Notes                                      |
|----------------------|-------------------|--------------------------------------------|
| lib/store.js         | PLACEHOLDER       | Zustand store — Claude will complete       |
| app/page.jsx         | PLACEHOLDER       | Landing/login — Claude will write          |
| app/dashboard/       | PLACEHOLDER       | Main feed page — Claude will write         |
| app/session/[id]/    | PLACEHOLDER       | History view — Claude will write           |
| app/settings/        | PLACEHOLDER       | Settings page — Claude will write          |
| tailwind.config.js   | AGENT OK          | Agent may adjust theme colours             |
| next.config.js       | AGENT OK          | Agent may add redirects or rewrites        |

### Root and config files

| File                      | Status    | Notes                                      |
|---------------------------|-----------|--------------------------------------------|
| .agent/rules.md           | AGENT OK  | Agent may add new rules                    |
| .agent/skills/**          | AGENT OK  | Agent may add new skills                   |
| .agent/workflows/**       | AGENT OK  | Agent may add new workflows                |
| overseer-requirements.md  | AGENT OK  | Agent must update after each session       |
| README.md                 | AGENT OK  | Agent may update                           |
| package.json (all)        | AGENT OK  | Agent may add scripts                      |
| .env.example (all)        | AGENT OK  | Agent updates when new vars added          |
| .gitignore                | AGENT OK  | Agent may add entries                      |

---

## WHAT CLAUDE HAS WRITTEN SO FAR

### watcher.js — COMPLETE
File: packages/daemon/src/watcher.js

What it does:
- Uses chokidar to watch the developer's project folder for file changes
- Filters noise: node_modules, .git, .overseer, dist, build, lock files,
  binary files — only watches meaningful source code file extensions
- Debounces rapid saves (600ms window) so a formatter rewriting a file
  3 times counts as one change event
- Reads the changed file, retrieves the previous cached version, calls
  diffExtractor.extractDiff() to get structured chunk objects
- Emits one 'change' event per chunk with: filePath, relativePath,
  eventType, chunk object, chunkIndex, totalChunks, timestamp
- Exported class: OverseerWatcher (extends EventEmitter)
- Key methods: start() begins watching, stop() does clean shutdown

### diffExtractor.js — COMPLETE
File: packages/daemon/src/diffExtractor.js

What it does:
- Takes previousContent and newContent strings, returns DiffChunk array
- Uses Myers diff algorithm (same as Git) via the 'diff' npm package
- Keeps 3 lines of surrounding context around each changed block
- Strips away unchanged code far from the changes (reduces noise sent to AI)
- CHUNKING RULE: if changed lines <= 60 return 1 chunk.
  If changed lines > 60 split into chunks of 50 changed lines each.
- Each DiffChunk has: diffText, lineStart, lineEnd, chunkIndex,
  totalChunks, linesAdded, linesRemoved, isLargeFile
- diffText format: "+ added line" / "- removed line" / "  context line"
- Exported function: extractDiff(previousContent, newContent)

---

### checkpointEngine.js — COMPLETE
File: packages/daemon/src/checkpointEngine.js

What it does:
- Handles local checkpoint storage when the user's quota is exhausted
- Writes diff chunks to .overseer/checkpoint_{sessionId}.json
- On daemon startup, scans for and drains pending checkpoints if quota has reset
- Throttles draining at 1 chunk per second to avoid overwhelming the backend
- Exported class: CheckpointEngine

---

## WHAT CLAUDE WRITES NEXT (in this order)

1. quotaTracker.js       — quota state machine (active/warning/checkpoint)
2. checkpointEngine.js   — local queue writer and processor
3. sender.js             — routes chunks to backend or checkpoint queue
4. cli.js                — the `overseer watch` command entry point
5. authMiddleware.js     — backend JWT validation
6. geminiAnalyser.js     — Gemini Flash streaming analysis
7. websocket.js          — WebSocket server for dashboard feed
8. analyseRoute.js       — POST /analyze endpoint
9. contextBuilder.js     — fetches file history from Supabase
10. lib/store.js         — Zustand store for dashboard
11. app/dashboard/page.jsx — main live feed UI

---

## What Overseer is

Overseer is a developer tool that runs silently on a developer's machine
while they use an AI coding agent (Cursor, Claude Code, Windsurf, any agent).
It watches every file the agent writes or modifies, sends each change for
AI analysis, and streams plain-English narration to a live web dashboard.

The developer keeps Overseer's dashboard open in a browser tab beside their
IDE. As the agent codes, the dashboard feed updates in real time — explaining
what the agent just built, flagging security issues, warning about risky
decisions, and confirming good patterns. The developer understands exactly
what the AI is building without reading a single line of code themselves.

Overseer also stores every session permanently — building a growing knowledge
base of the codebase history, decisions, and risks over time.

---

## The problem it solves

AI coding agents write code faster than humans can read it.
A developer using Cursor or Claude Code might have 400 lines written in
3 minutes. They cannot review all of it. They merge it, ship it, and
discover the security vulnerability three months later.

Overseer narrates in real time. Every 50 lines, the developer knows:
what was built, what was flagged, and whether the agent is still on
track with the original goal.

---

## The three packages

### 1. packages/daemon (CLI tool)
- Runs on the developer's local machine
- Installed globally via npm: npm install -g @useoverseer/daemon
- Started with: npx overseer watch or overseer watch
- Written in Node.js (CommonJS)
- Watches the current project folder for file changes
- Extracts diffs (what lines changed)
- Manages quota state (active / warning / checkpoint)
- In checkpoint mode: saves changes to .overseer/ folder locally
- Sends changes to the Overseer backend over HTTPS

### 2. packages/backend (API server)
- Runs on Railway (cloud hosting)
- Built with Express.js
- Receives diffs from the daemon
- Validates auth tokens and checks quota
- Fetches file history from Supabase for context
- Calls Gemini Flash 1.5 API with the diff + context
- Streams Gemini response to the developer's dashboard via WebSocket
- Writes analysis results to Supabase (events table)
- Updates the file knowledge table in Supabase

### 3. packages/dashboard (Web app)
- Hosted on Vercel
- Built with Next.js 14 (App Router)
- Styled with Tailwind CSS + shadcn/ui components
- Connects to backend via WebSocket for live feed
- Connects to Supabase for session history and auth
- Shows: live analysis feed, session stats, files touched, goal alignment
- Has a quick-ask chat input for querying past session context
- Fully responsive, dark mode supported

---

## Complete feature list

### MVP — current build status

DONE (scaffold complete):
- [x] Project structure (daemon, backend, dashboard packages)
- [x] All npm packages installed across all three packages
- [x] Antigravity skills, rules, and workflows configured
- [x] Project renamed from Scope to Overseer throughout

DONE (Claude written):
- [x] Core file system watcher (watcher.js)
- [x] Diff extraction and 50-line chunking (diffExtractor.js)

IN PROGRESS (Claude writing next):
- [ ] Quota state machine (quotaTracker.js)
- [x] Local checkpoint queue (checkpointEngine.js)
- [ ] Diff sender and router (sender.js)
- [ ] CLI entry point (cli.js)

PENDING — backend:
- [ ] JWT auth middleware
- [ ] Gemini Flash streaming analysis
- [ ] WebSocket server
- [ ] POST /analyze endpoint
- [ ] Context builder (fetches file history)

PENDING — dashboard:
- [ ] Live feed panel
- [ ] Session stats panel
- [ ] Goal alignment bar
- [ ] Files touched list
- [ ] Supabase auth integration

PENDING — infrastructure:
- [ ] Supabase tables created
- [ ] pgvector extension enabled
- [ ] Railway deployment (backend)
- [ ] Vercel deployment (dashboard)
- [ ] Lemon Squeezy subscription setup

### Phase 2 (after first 20 paying users)
- [ ] MCP server integration
- [ ] Historical session browser
- [ ] Semantic search across all past events (pgvector)
- [ ] Ask-anything chat mode about codebase history
- [ ] Session summary auto-generated at session end
- [ ] Quota warning emails via Resend

### Phase 3 (after product-market fit)
- [ ] VS Code / Cursor extension (inline feed in IDE)
- [ ] Team sharing (multiple devs, one project)
- [ ] Slack notifications for critical flags
- [ ] Weekly codebase health report
- [ ] GitHub webhook (post-session audit on PR)

---

## Pricing model

### Free — $0/month
- 200 analyses per month
- 1 project
- 7 days session history
- Basic security flags
- Checkpoint queue (analyses when quota resets on the 1st)

### Pro — $19/month
- 5,000 analyses per month
- Unlimited projects
- 90 days session history
- Full security audit reports
- MCP integration (Phase 2)
- Quick-ask chat (Phase 2)
- Process checkpoint queue immediately (no waiting for reset)

### Team — $49/month
- 20,000 analyses per month
- Up to 5 developers
- Unlimited session history
- Shared project dashboard
- Team security overview
- Priority support

---

## The Supabase database schema

### Table: projects
CREATE TABLE projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  root_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

### Table: sessions
CREATE TABLE sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  goal_text TEXT,
  goal_alignment INT DEFAULT 0,
  summary_text TEXT,
  files_touched TEXT[] DEFAULT '{}',
  critical_count INT DEFAULT 0,
  warning_count INT DEFAULT 0,
  good_count INT DEFAULT 0,
  analysis_count INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

### Table: events
CREATE TABLE events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(project_id),
  file_path TEXT NOT NULL,
  diff_text TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('critical','warning','good','info','context')),
  analysis_text TEXT,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON events USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

### Table: file_knowledge
CREATE TABLE file_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  current_summary TEXT,
  first_built_session UUID REFERENCES sessions(session_id),
  times_modified INT DEFAULT 0,
  open_risks TEXT[] DEFAULT '{}',
  embedding VECTOR(1536),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, file_path)
);

### Table: quotas
CREATE TABLE quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free' CHECK(plan IN ('free','pro','team')),
  monthly_limit INT DEFAULT 200,
  used_this_month INT DEFAULT 0,
  reset_date DATE DEFAULT (date_trunc('month', now()) + interval '1 month')::date
);

---

## Environment variables — complete list

### Daemon (.env in packages/daemon/)
OVERSEER_API_URL=http://localhost:4000
OVERSEER_AUTH_TOKEN=the_developers_jwt_token
OVERSEER_PROJECT_ID=their_project_uuid
OVERSEER_DEBUG=false

### Backend (.env in packages/backend/)
PORT=4000
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=a_long_random_string_minimum_32_chars
ALLOWED_ORIGINS=http://localhost:3000
LEMON_SQUEEZY_WEBHOOK_SECRET=your_webhook_secret

### Dashboard (.env.local in packages/dashboard/)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000

---

## The Gemini analysis prompt

You are a senior software engineer narrating what an AI coding agent
is building in real time. A developer is watching your feed — they
are not a deep technical expert. Be precise, plain, and useful.

You receive a code diff — lines added (+) or removed (-) from a file.
Analyse it and respond with a JSON object only, no other text:

{
  "severity": "critical|warning|good|info|context",
  "title": "Short title under 8 words",
  "body": "Plain English explanation, 1-3 sentences.",
  "file_relevance": "What this file does in the overall system"
}

Severity guide:
- critical: security vulnerability, data exposure, auth bypass,
  hardcoded secret, SQL injection risk, missing encryption
- warning: missing error handling, no rate limiting, performance issue,
  incomplete implementation
- good: correct security practice, proper error handling, clean
  architecture decision, best practice followed
- info: factual description of what was built, no concerns
- context: file scaffolding, config, imports, boilerplate

Keep body under 60 words. Never use jargon without explaining it.
Never say "the code" — say what the code does specifically.

---

## Self-healing rules for Antigravity agents

npm install failures:
1. Try: npm cache clean --force then retry
2. If ERESOLVE error: add --legacy-peer-deps flag
3. If specific package fails: install others first, then retry
4. If node_modules seems corrupt: rm -rf node_modules && npm install

Port conflicts:
1. If port 4000 in use: npx kill-port 4000 then retry
2. If kill-port unavailable: use PORT=4001 node src/index.js

Never do these when fixing errors:
- Never delete and recreate a file marked WRITTEN BY CLAUDE
- Never change the tech stack to work around an error
- Never install an alternative package without asking
- Always report what broke and what you did to fix it

---

## Key decisions already made (do not re-debate)

1.  CommonJS not ESM — daemon uses require(), not import
2.  No TypeScript for MVP — plain JavaScript to move faster
3.  Gemini Flash not GPT-4 — cost efficiency, sufficient quality
4.  Railway not Heroku — better free tier, simpler deployment
5.  Supabase not Firebase — Postgres + pgvector, Row Level Security
6.  Lemon Squeezy not Stripe — no age restrictions, global merchant
7.  50-line chunks — sweet spot for context quality vs token cost
8.  Checkpoint file is local — server downtime cannot lose queued work
9.  One row per file in file_knowledge — upsert keeps it clean
10. Zustand not Redux — simpler, less boilerplate, sufficient for MVP
11. OverseerWatcher extends EventEmitter — decoupled from sender via events
12. Myers diff algorithm via diff npm package — same algorithm Git uses
13. 600ms debounce — handles formatters that re-save after agent writes
14. 3 lines of diff context — enough for Gemini, not noisy

---

## Who does what

| Task type                           | Who does it            |
|-------------------------------------|------------------------|
| Core architecture decisions         | Claude (claude.ai)     |
| All PLACEHOLDER files in src/       | Claude (claude.ai)     |
| Files marked WRITTEN BY CLAUDE      | Nobody — already done  |
| README and documentation edits      | Antigravity agent      |
| Boilerplate file creation           | Antigravity agent      |
| Config file updates                 | Antigravity agent      |
| Tailwind class additions            | Antigravity agent      |
| Debugging (report + simple fixes)   | Antigravity agent      |
| Debugging (complex / architectural) | Claude (claude.ai)     |
| Product decisions                   | Founder                |
| Testing and validation              | Founder                |
| Updating this requirements file     | Antigravity agent      |

## IMPORTANT — how to keep this file current

After every Claude session where new files are written:
1. Change status in CODE STATUS table from PLACEHOLDER to WRITTEN BY CLAUDE
2. Add the file to WHAT CLAUDE HAS WRITTEN SO FAR with a summary
3. Tick the checkbox in the feature list
4. Update the WHAT CLAUDE WRITES NEXT list

This file is the project ground truth. If it is out of date, agents
make mistakes. Keep it current after every session.

---
END OF REQUIREMENTS FILE

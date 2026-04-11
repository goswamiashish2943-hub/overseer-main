# Technology Choices

## Node.js (Daemon)

- **Why**: Event-driven architecture matches file watching perfectly
- **Benefit**: Single-threaded, efficient async I/O, no blocking
- **Alternative considered**: Python (watchdog) — rejected due to extra runtime dependency

## chokidar (File Watching)

- **Why**: Most reliable cross-platform file watcher for Node.js
- **Benefit**: Native OS events (inotify/FSEvents/ReadDirectoryChanges), not polling
- **Config**: `awaitWriteFinish` prevents partial-file reads during editor saves

## Polling for Context Files (`fileWatcher.js`)

- **Why**: `fs.watch` is unreliable on Windows — editors trigger events inconsistently
- **Benefit**: Consistent behavior across macOS, Linux, Windows
- **Interval**: 5 seconds — low enough to catch changes, high enough not to waste CPU

## Express (Backend)

- **Why**: Lightweight, minimal boilerplate
- **Benefit**: Fast to add routes, well-integrated with Supabase JS client
- **Alternative considered**: Fastify — no reason to switch for current scale

## Groq API (AI Analysis)

- **Why**: Free tier with fast response times (~1-3s)
- **Model**: Llama 3.3 70B Versatile — good quality for code review
- **Strategy**: 2 combined calls (vs naive 6) to stay within 30 RPM free tier
- **Fallback**: Multi-key round-robin; falls back to basic analysis on rate limit

## Supabase (Database)

- **Why**: PostgreSQL reliability with zero DevOps setup
- **Benefit**: Row-level security, real-time subscriptions, REST + JS client
- **Tables**: sessions, events, file_knowledge, project_context_files, code_sessions

## Next.js (Dashboard)

- **Why**: React for real-time updates, built-in routing
- **Real-time**: WebSocket (ws library on backend, native WebSocket API on frontend)
- **Deployment**: Vercel-ready

## WebSocket (Real-time Updates)

- **Why**: Instant push from backend to dashboard without polling
- **Implementation**: `ws` library on backend, native `WebSocket` in browser
- **Session routing**: `?session=UUID` param maps each daemon to its dashboard tab

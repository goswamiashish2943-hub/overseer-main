# Security Requirements

## API Security

- **Authentication**: All `/analyze` and `/api/context` endpoints require `Authorization: Bearer <token>`
- **Token validation**: Supabase JWT verified via `auth.getUser()` — no local secret needed
- **Project ownership**: `authMiddleware` verifies `project_id` belongs to authenticated user
- **Path validation**: File paths stored are relative (not absolute) — prevents directory traversal
- **Rate limiting**: 120 req/min per IP on `/analyze` via `express-rate-limit`
- **CORS**: Explicit allowlist in `ALLOWED_ORIGINS` env var

## Code Context Safety

- **No secrets stored**: Context files (README.md etc.) should never contain secrets
- **Content limit**: Context files capped at 64KB per file before storage
- **No code execution**: Analysis is read-only — Overseer never writes to your codebase
- **Groq data**: Code diffs are sent to Groq's API — do not analyze files containing passwords/keys
- **Ignored patterns**: `.env` files (hidden files) are excluded from watching by default

## Auth Token Handling

- **Storage**: Tokens saved in `~/.overseer/auth.json` — user home dir only
- **Refresh**: Tokens auto-refreshed before expiry (10-minute threshold)
- **No frontend exposure**: Auth tokens are daemon-only — never sent to the dashboard
- **Supabase RLS**: Row-level security ensures cross-project data access is impossible

## Database

- **Service key**: `SUPABASE_SERVICE_KEY` used in backend only — never exposed to daemon or frontend
- **Daemon key**: Uses Supabase anon key + user JWT — RLS enforced
- **ENV files**: `.env` files excluded from git (`.gitignore`) and excluded from file watching
- **Context files**: Stored per `project_id` — no cross-project leakage

## What to Never Do

- Never put API keys in context files (ARCHITECTURE.md, README.md, etc.)
- Never disable `authMiddleware` — the bypass pattern is a known past vulnerability
- Never use absolute file paths in analysis payloads — use relative paths only
- Never expose `SUPABASE_SERVICE_KEY` in frontend env vars

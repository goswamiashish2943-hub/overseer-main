# Workflow: debugging a broken feature

## Step 1 — Gather information first
Before changing anything, collect:
- The exact error message (full stack trace if available)
- Which file and line number
- What was the last change made before it broke
- Does it fail in development, production, or both?

## Step 2 — Check the obvious first
[ ] Is .env populated with all required values?
[ ] Did you run npm install after pulling new changes?
[ ] Is the backend server actually running? (check Railway logs)
[ ] Is Supabase accessible? (check the Supabase dashboard)
[ ] Is the correct Node version active? (node --version)

## Step 3 — Isolate the problem
Add console.log statements at:
- Entry point of the failing function
- Before and after every await call
- Inside every catch block

## Step 4 — Common fixes by error type
"Cannot find module X"
  → Run: npm install in the correct package directory
  → Check: is the import path correct? (relative vs package name)

"EADDRINUSE port 3000"
  → Run: npx kill-port 3000 (or use PORT=3001)

"Invalid API key"
  → Check .env has the correct key (no quotes, no spaces)
  → Restart the server after changing .env

"JWT expired" or "invalid signature"
  → Check JWT_SECRET is the same in .env as what was used to sign
  → Check token is being sent as "Bearer {token}" in Authorization header

"Supabase: row level security violation"
  → Check RLS policies on the table in Supabase dashboard
  → Verify project_id ownership check in the query

## Step 5 — If still broken
Report: exact error, what you tried, what the logs show.
Tell user: "This requires Claude's input to resolve."
Do NOT keep trying random fixes — that makes things worse.

# Workflow: implementing a new feature in overseer

## Step 1 — Understand before touching anything
Read rules.md first.
Check if any file on the "never modify" list is involved.
If yes → stop and tell user to check with Claude.

## Step 2 — Generate a Planning artifact
Use planning mode. Output:
- Files you will CREATE (new)
- Files you will MODIFY (existing)
- Files you will NOT touch
- npm packages needed (ask user before installing any)
- Estimated complexity: low / medium / high

Wait for user approval before writing any code.

## Step 3 — Write in this order
1. .env.example update (add any new env vars with placeholder values)
2. Database changes (if any — show SQL and wait for approval)
3. Backend module
4. Backend route (add auth middleware immediately)
5. Frontend component
6. Frontend page/integration
7. README update

## Step 4 — Self-verify in browser
If UI changes were made:
- Open localhost:3000 in Antigravity's built-in browser
- Screenshot the result as an artifact
- Report: "I see X. Expected Y. Status: [working/broken]."

## Step 5 — Security check before reporting done
Run through the security-review skill checklist.
Report each item as checked.

## Step 6 — Report completion
State clearly:
- What was created/modified
- How to test it manually
- Any known limitations
- Any follow-up tasks for Claude

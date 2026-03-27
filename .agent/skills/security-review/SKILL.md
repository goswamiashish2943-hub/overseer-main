---
name: security-review
description: Security rules for overseer. Load when writing any
  auth code, API routes, handling env vars, or reviewing
  code before committing.
triggers:
  - "auth"
  - "security"
  - "api key"
  - "token"
  - "password"
  - "secret"
  - "review"
  - "before commit"
  - "before shipping"
  - "check this"
---

# Security checklist — run before every commit

## Critical rules — violations are blockers
1. NEVER hardcode any secret, key, or URL in source code
2. ALL secrets live in .env — and .env is ALWAYS in .gitignore
3. EVERY Express route must call authMiddleware first
4. EVERY Supabase query must include a project_id ownership check
5. Rate limit all public endpoints (express-rate-limit)
6. Validate and sanitise every req.body field
7. Never log secrets, tokens, or full request bodies

## Auth middleware (copy exactly onto every route)
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token' })
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Invalid token' })
    req.user = user
    next()
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message)
    res.status(500).json({ error: 'Auth check failed' })
  }
}

## Pre-commit security checklist
[ ] No API keys or secrets in any source file
[ ] Auth middleware applied to all non-public routes
[ ] project_id ownership verified on all DB queries
[ ] Input validation on all POST/PATCH request bodies
[ ] .env updated with new vars
[ ] .env.example updated (with placeholder values, not real ones)
[ ] Rate limiting on new public endpoints
[ ] No sensitive data in console.log statements

## Common vulnerabilities in our stack
- Insecure direct object reference: always verify project ownership
- JWT none algorithm: use explicit algorithm in jwt.verify({ algorithms: ['HS256'] })
- Supabase key exposure: SUPABASE_SERVICE_KEY must never reach the browser
- CORS misconfiguration: only whitelist known origins in ALLOWED_ORIGINS env var

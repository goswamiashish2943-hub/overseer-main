// packages/backend/src/authMiddleware.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Express middleware that validates every inbound request to /analyze.
// Checks:
//   1. Authorization: Bearer <token> header exists
//   2. Token is a valid Supabase JWT (verified via supabase.auth.getUser)
//   3. The project_id in the request body belongs to this user
// Sets req.user = { id, email } for downstream route handlers.

'use strict';

const { createClient } = require('@supabase/supabase-js');

// One shared Supabase client for all auth checks — created on first import
let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('authMiddleware: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    _supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _supabase;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Validates the bearer token and project ownership.
 * Attach to any route that requires authentication.
 */
async function authMiddleware(req, res, next) {
  // ── 1. Extract token ──────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header',
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  // ── 2. Verify token with Supabase ─────────────────────────────────────────
  let user;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    user = data.user;
  } catch (err) {
    console.error('[authMiddleware] Supabase error:', err.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }

  // ── 3. Verify project ownership ───────────────────────────────────────────
  const projectId = req.body?.project_id;

  if (!projectId) {
    return res.status(400).json({ error: 'project_id is required in request body' });
  }

  try {
    const supabase = getSupabase();
    const { data: project, error } = await supabase
      .from('projects')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (error || !project) {
      return res.status(403).json({ error: 'Project not found or access denied' });
    }
  } catch (err) {
    console.error('[authMiddleware] Project ownership check error:', err.message);
    return res.status(500).json({ error: 'Project verification failed' });
  }

  // ── 4. Attach user to request ─────────────────────────────────────────────
  req.user = {
    id: user.id,
    email: user.email,
  };

  next();
}

module.exports = { authMiddleware };


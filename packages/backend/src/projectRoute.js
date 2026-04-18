// packages/backend/src/projectRoute.js
//
// POST /api/project/resolve
//
// Called by the daemon on startup to get or create a project_id for the
// current repo. The daemon passes a SHA-256 hash of the git remote URL
// (or hostname:path as fallback) as the identifier.
//
// This endpoint is idempotent — calling it multiple times with the same
// identifier always returns the same project_id.
//
// Auth: Bearer token only — no project_id required (that's what we're resolving).

'use strict';

const express = require('express');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Shared Supabase client
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
}

// ─── Auth helper (lightweight — no project ownership check) ───────────────────

async function getUserFromToken(token) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// ─── POST /api/project/resolve ────────────────────────────────────────────────

router.post('/resolve', async (req, res) => {
  // 1. Token auth
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.slice(7);

  let user;
  try {
    user = await getUserFromToken(token);
  } catch (err) {
    return res.status(500).json({ error: 'Auth check failed' });
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 2. Validate body
  const { identifier, name } = req.body;
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'identifier is required' });
  }

  // Normalise identifier — always a SHA-256 hex string (daemon does this too)
  // but accept raw strings and hash them server-side as a safety net.
  const normalised = identifier.length === 64 && /^[0-9a-f]+$/.test(identifier)
    ? identifier
    : crypto.createHash('sha256').update(identifier).digest('hex');

  const supabase = getSupabase();

  // 3. Look up existing project
  try {
    const { data: existing, error: selectError } = await supabase
      .from('projects')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('identifier', normalised)
      .maybeSingle();

    if (selectError) {
      console.error('[projectRoute] Select error:', selectError.message);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existing) {
      return res.json({ project_id: existing.project_id, created: false });
    }
  } catch (err) {
    console.error('[projectRoute] Lookup threw:', err.message);
    return res.status(500).json({ error: 'Database error' });
  }

  // 4. Create new project
  const projectName = (name && typeof name === 'string' && name.trim())
    ? name.trim()
    : `Project ${normalised.slice(0, 8)}`;

  try {
    const { data: created, error: insertError } = await supabase
      .from('projects')
      .insert({
        user_id:    user.id,
        name:       projectName,
        identifier: normalised,
        created_at: new Date().toISOString(),
      })
      .select('project_id')
      .single();

    if (insertError) {
      // Race condition: another request created it between our SELECT and INSERT
      if (insertError.code === '23505') {
        // Re-fetch it
        const { data: refetched } = await supabase
          .from('projects')
          .select('project_id')
          .eq('user_id', user.id)
          .eq('identifier', normalised)
          .single();
        if (refetched) {
          return res.json({ project_id: refetched.project_id, created: false });
        }
      }
      console.error('[projectRoute] Insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to create project' });
    }

    console.log(`[projectRoute] Created project ${created.project_id} for user ${user.id}`);
    return res.status(201).json({ project_id: created.project_id, created: true });

  } catch (err) {
    console.error('[projectRoute] Insert threw:', err.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = { router };

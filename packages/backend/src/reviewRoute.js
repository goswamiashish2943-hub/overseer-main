// packages/backend/src/reviewRoute.js
//
// POST /api/sessions/:id/mark-reviewed
// Marks a code_sessions row as reviewed.

'use strict';

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

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

// ─── Lightweight auth (no project_id required) ───────────────────────────────

async function lightAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    console.error('[reviewRoute] Auth error:', err.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

// ─── POST /:id/mark-reviewed ──────────────────────────────────────────────────

router.post('/:id/mark-reviewed', lightAuth, async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const supabase = getSupabase();
    const reviewedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('sessions')
      .update({ reviewed: true, reviewed_at: reviewedAt })
      .eq('id', id)
      .select('id, reviewed, reviewed_at')
      .single();

    if (error) {
      console.error('[reviewRoute] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to mark as reviewed' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`[reviewRoute] Marked code_session ${id} as reviewed`);
    return res.json({ success: true, id: data.id, reviewed_at: data.reviewed_at });
  } catch (err) {
    console.error('[reviewRoute] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

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
      .from('code_sessions')
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

// ─── GET /history ─────────────────────────────────────────────────────────────

router.get('/history', lightAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { filter } = req.query;

    const { data: projects, error: projError } = await supabase
      .from('projects')
      .select('project_id')
      .eq('user_id', req.user.id);

    if (projError) throw new Error(projError.message);
    const projectIds = projects.map(p => p.project_id);

    if (projectIds.length === 0) {
      return res.json([]);
    }

    let query = supabase
      .from('code_sessions')
      .select('*')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });

    const now = new Date();
    if (filter === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query = query.gte('created_at', today.toISOString());
    } else if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (filter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', monthAgo.toISOString());
    }

    const { data, error } = await query.limit(500);

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err) {
    console.error('[reviewRoute] History error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

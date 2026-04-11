// packages/backend/src/context.js
//
// GET  /api/context?project_id=X  — fetch all stored context files for a project
// POST /api/context               — upsert a context file (project_id, file_name, content)
//
// Context files are .md / .json files the daemon detects and stores here.
// analyseRoute.js reads them to enrich Groq prompts with project-level knowledge.

'use strict';

const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

// ─── Lazy Supabase singleton ──────────────────────────────────────────────────

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('context.js: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

// ─── GET /api/context ─────────────────────────────────────────────────────────
// Returns all context files stored for a project, merged into a single string.

router.get('/api/context', authMiddleware, async (req, res) => {
  const projectId = req.query.project_id;

  if (!projectId) {
    return res.status(400).json({ error: 'project_id query param is required' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('project_context_files')
      .select('file_name, content, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[context] GET error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch context files' });
    }

    // Build a merged context string: each file's content separated by headers
    const merged = (data || [])
      .map((row) => `=== ${row.file_name} ===\n${row.content}`)
      .join('\n\n');

    return res.json({
      project_id: projectId,
      files:      data || [],
      merged,      // convenience field for LLM usage
    });

  } catch (err) {
    console.error('[context] GET fatal:', err.message);
    return res.status(500).json({ error: 'Internal error fetching context' });
  }
});

// ─── POST /api/context ────────────────────────────────────────────────────────
// Upsert a single context file. Called by the daemon whenever a .md file changes.

router.post('/api/context', authMiddleware, async (req, res) => {
  const { project_id, file_name, content } = req.body;

  if (!project_id || !file_name || content === undefined) {
    return res.status(400).json({
      error: 'project_id, file_name, and content are required',
    });
  }

  // Safety: limit content length to 64KB to avoid DB bloat
  const trimmedContent = String(content).slice(0, 65536);

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('project_context_files')
      .upsert(
        {
          project_id,
          file_name:  String(file_name).slice(0, 255),
          content:    trimmedContent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,file_name', ignoreDuplicates: false }
      );

    if (error) {
      console.error('[context] POST upsert error:', error.message);
      return res.status(500).json({ error: 'Failed to save context file' });
    }

    console.log(`[context] Saved context file: ${file_name} (project=${project_id})`);
    return res.json({ status: 'saved', project_id, file_name });

  } catch (err) {
    console.error('[context] POST fatal:', err.message);
    return res.status(500).json({ error: 'Internal error saving context' });
  }
});

// ─── GET /api/context/raw ─────────────────────────────────────────────────────
// Returns just the merged context string — used by analyseRoute.js internally.
// No auth required (server-to-server internal call pattern via direct import).

/**
 * Fetch merged context string for a project.
 * Used by analyseRoute.js to get context for the Groq prompt.
 *
 * @param {string} projectId
 * @returns {Promise<string>} merged context or empty string
 */
async function fetchProjectContext(projectId) {
  if (!projectId) return '';
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('project_context_files')
      .select('file_name, content')
      .eq('project_id', projectId)
      .order('file_name', { ascending: true });

    if (error || !data?.length) return '';

    return data
      .map((row) => `=== ${row.file_name} ===\n${row.content}`)
      .join('\n\n');
  } catch (err) {
    console.warn('[context] fetchProjectContext error (non-fatal):', err.message);
    return '';
  }
}

module.exports = { router: router, fetchProjectContext };

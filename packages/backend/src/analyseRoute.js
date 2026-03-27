// packages/backend/src/analyseRoute.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// POST /analyze — the main endpoint the daemon calls for every diff chunk.

'use strict';

const express          = require('express');
const { createClient } = require('@supabase/supabase-js');

const { authMiddleware }    = require('./authMiddleware');
const { buildContext }      = require('./contextBuilder');
const { analyseWithGemini } = require('./geminiAnalyser');
const { sendToSession }     = require('./websocket');

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

// ─── Ensure session row exists ────────────────────────────────────────────────
// The daemon generates a session UUID that doesn't exist in the sessions table.
// We upsert it here so the foreign key constraint on events is satisfied.

async function ensureSession(supabase, sessionId, projectId, userId) {
  try {
    await supabase
      .from('sessions')
      .upsert(
        {
          session_id: sessionId,
          project_id: projectId,
          user_id:    userId,
          started_at: new Date().toISOString(),
        },
        { onConflict: 'session_id', ignoreDuplicates: true }
      );
  } catch (err) {
    console.warn('[analyseRoute] Session upsert error (non-fatal):', err.message);
  }
}

// ─── Safe RPC call ────────────────────────────────────────────────────────────
// Supabase rpc() returns a thenable but not a real Promise in all versions.
// Wrap in a try/catch instead of chaining .catch()

async function safeRpc(supabase, fn, params) {
  try {
    const { error } = await supabase.rpc(fn, params);
    if (error) console.warn(`[analyseRoute] RPC ${fn} error:`, error.message);
  } catch (err) {
    console.warn(`[analyseRoute] RPC ${fn} threw:`, err.message);
  }
}

// ─── POST /analyze ────────────────────────────────────────────────────────────

router.post('/analyze', authMiddleware, async (req, res) => {
  const {
    project_id,
    session_id,
    file_path,
    diff_text,
    chunk_index  = 0,
    total_chunks = 1,
    timestamp,
    from_queue   = false,
  } = req.body;

  if (!session_id || !file_path || !diff_text) {
    return res.status(400).json({
      error: 'session_id, file_path, and diff_text are required',
    });
  }

  // Respond immediately so daemon is not blocked
  res.status(202).json({ status: 'accepted', session_id, file_path });

  // Run analysis pipeline async
  try {
    const supabase = getSupabase();

    // 1. Ensure session row exists (prevents foreign key error on events insert)
    await ensureSession(supabase, session_id, project_id, req.user.id);

    // 2. Fetch prior context for this file
    const fileContext = await buildContext(project_id, file_path);
    console.log(`[analyseRoute] 2/7 - Context built (len=${fileContext?.length || 0})`);

    // 3. Set up WS proxy — uses sendToSession with broadcast fallback
    console.log(`[analyseRoute] 3/7 - Setting up WS proxy for session ${session_id}...`);
    const wsProxy = {
      readyState: 1,
      send: (msg) => {
        try {
          const payload = JSON.parse(msg);
          sendToSession(session_id, payload);
        } catch (e) {
          console.warn('[analyseRoute] WS proxy parse error:', e.message);
        }
      },
    };

    // 4. Stream Gemini analysis
    console.log(`[analyseRoute] 4/7 - Starting Gemini analysis...`);
    const result = await analyseWithGemini({
      filePath:    file_path,
      diffText:    diff_text,
      fileContext,
      wsClient:    wsProxy,
      sessionId:   session_id,
    });
    console.log(`[analyseRoute] 5/7 - Gemini analysis complete (severity=${result.severity})`);

    // 5. Save event to Supabase
    console.log(`[analyseRoute] 6/7 - Saving event to events table...`);
    const { error: eventError } = await supabase
      .from('events')
      .insert({
        session_id,
        project_id,
        file_path,
        diff_text,
        severity:      result.severity,
        analysis_text: `${result.title}\n\n${result.body}`,
        created_at:    timestamp
          ? new Date(timestamp).toISOString()
          : new Date().toISOString(),
      });

    if (eventError) {
      console.error('[analyseRoute] Event insert error:', eventError.message);
    }

    // 6. Upsert file_knowledge
    console.log(`[analyseRoute] 7/7 - Upserting file_knowledge...`);
    const { error: knowledgeError } = await supabase
      .from('file_knowledge')
      .upsert(
        {
          project_id,
          file_path,
          current_summary: result.file_relevance,
          open_risks:      result.severity === 'critical' ? [result.title] : [],
          updated_at:      new Date().toISOString(),
        },
        { onConflict: 'project_id,file_path', ignoreDuplicates: false }
      );

    if (knowledgeError) {
      console.error('[analyseRoute] file_knowledge upsert error:', knowledgeError.message);
    }

    // 7. Increment times_modified and quota via safe RPC wrapper
    await safeRpc(supabase, 'increment_times_modified', {
      p_project_id: project_id,
      p_file_path:  file_path,
    });

    if (!from_queue) {
      await safeRpc(supabase, 'increment_quota', {
        p_user_id: req.user.id,
      });
    }

    console.log(`[analyseRoute] Done: ${file_path} severity=${result.severity}`);

  } catch (err) {
    console.error('[analyseRoute] Pipeline error:', err.message);

    // Send error card to dashboard so developer knows something went wrong
    try {
      sendToSession(session_id, {
        type: 'analysis_complete',
        result: {
          severity:       'warning',
          title:          'Backend Analysis Failed',
          body:           `The pipeline encountered an error: ${err.message}`,
          file_relevance: 'Pipeline Error',
        },
        filePath:  file_path,
        sessionId: session_id,
      });
    } catch { /* non-fatal */ }
  }
});

module.exports = router;

// packages/backend/src/analyseRoute.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// POST /analyze — the main endpoint the daemon calls for every diff chunk.

'use strict';

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const { authMiddleware } = require('./authMiddleware');
const { buildContext } = require('./contextBuilder');
const { fetchProjectContext } = require('./context');
const { computeCodeHash, checkCache, saveToCache } = require('./cacheService');
const { addToBatch } = require('./batchQueue');
const { sendToSession } = require('./websocket');

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
          user_id: userId,
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
    chunk_index = 0,
    total_chunks = 1,
    timestamp,
    from_queue = false,
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

    // 2. Fetch prior per-file context from file_knowledge table
    const fileContext = await buildContext(project_id, file_path);
    console.log(`[analyseRoute] 2/8 - Per-file context built (len=${fileContext?.length || 0})`);

    // 3. Fetch project-level context (.md files auto-detected by daemon)
    const projectContext = await fetchProjectContext(project_id);
    console.log(`[analyseRoute] 3/8 - Project context fetched (len=${projectContext?.length || 0})`);

    // 4. Set up WS proxy
    console.log(`[analyseRoute] 4/8 - Checking cache...`);
    
    // Hash context + diff content
    const contextContent = (projectContext || '') + '\n' + (fileContext || '');
    const codeHash = computeCodeHash({ filename: file_path, diff: diff_text, fileContent: '' }, contextContent.length);
    
    let result = await checkCache(codeHash);

    if (result) {
      console.log(`[analyseRoute] 5/8 - Cache hit for ${file_path}`);
    } else {
      console.log(`[analyseRoute] 5/8 - Cache miss. Queueing for batch analysis...`);
      // Wait for batch queue to flush and process the LLM call
      result = await addToBatch(
          { filename: file_path, diff: diff_text },
          contextContent,
          session_id
      );
      // Save to cache asynchronously 
      saveToCache(codeHash, result).catch(e => console.error("Cache save error:", e));
    }

    const logTag = result.usedFallback ? '(fallback)' : '(enhanced)';
    console.log(`[analyseRoute] 6/8 - Analysis complete ${logTag} severity=${result.severity}`);

    // 6. Save to code_sessions table
    console.log(`[analyseRoute] 7/8 - Saving event to code_sessions...`);
    const enhancedData = {
        suggestion: result.suggestion || null,
        better_approach: result.betterApproach || null,
        alignment: result.alignment || null,
        change_analysis: result.changeAnalysis || null,
        explanations: result.explanations || null
    };

    const { data: insertedEvent, error: eventError } = await supabase
      .from('code_sessions')
      .insert({
        session_id,
        project_id,
        file_path,
        diff_text,
        severity: result.severity,
        analysis_text: `${result.title}\n\n${result.body}`,
        ...enhancedData,
        created_at: timestamp
          ? new Date(timestamp).toISOString()
          : new Date().toISOString(),
      })
      .select('id')
      .single();

    if (eventError) {
      console.error('[analyseRoute] Event insert error:', eventError.message);
    }
    
    // Send to WebSocket AFTER getting the DB ID
    sendToSession(session_id, {
        type: 'analysis_complete',
        enhanced: true,
        result: { ...result, id: insertedEvent?.id },
        filePath: file_path,
        sessionId: session_id
    });

    // 7. Upsert file_knowledge
    console.log(`[analyseRoute] 8/8 - Upserting file_knowledge...`);
    const { error: knowledgeError } = await supabase
      .from('file_knowledge')
      .upsert(
        {
          project_id,
          file_path,
          current_summary: result.file_relevance,
          open_risks: result.severity === 'critical' ? [result.title] : [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,file_path', ignoreDuplicates: false }
      );

    if (knowledgeError) {
      console.error('[analyseRoute] file_knowledge upsert error:', knowledgeError.message);
    }

    // 7. Increment times_modified via safe RPC wrapper
    await safeRpc(supabase, 'increment_times_modified', {
      p_project_id: project_id,
      p_file_path: file_path,
    });

    console.log(`[analyseRoute] Done: ${file_path} severity=${result.severity}`);

  } catch (err) {
    console.error('[analyseRoute] Pipeline error:', err.message);

    // Send error card to dashboard so developer knows something went wrong
    try {
      sendToSession(session_id, {
        type: 'analysis_complete',
        result: {
          severity: 'warning',
          title: 'Backend Analysis Failed',
          body: `The pipeline encountered an error: ${err.message}`,
          file_relevance: 'Pipeline Error',
        },
        filePath: file_path,
        sessionId: session_id,
      });
    } catch { /* non-fatal */ }
  }
});

module.exports = router;

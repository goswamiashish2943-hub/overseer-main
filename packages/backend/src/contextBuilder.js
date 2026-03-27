// packages/backend/src/contextBuilder.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Fetches previous analysis history for a file from the file_knowledge table.
// Gives Gemini cross-session context so it can say things like:
// "This file previously had an open SQL injection risk — it has not been fixed."

'use strict';
const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('contextBuilder: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

// ─── contextBuilder ──────────────────────────────────────────────────────────

/**
 * Returns a plain-text context summary for a given file, pulled from
 * the file_knowledge table. If no prior knowledge exists, returns null.
 *
 * @param {string} projectId  - Supabase project UUID
 * @param {string} filePath   - Relative file path, e.g. "src/auth/login.js"
 * @returns {Promise<string|null>}
 */
async function buildContext(projectId, filePath) {
  if (!projectId || !filePath) return null;

  try {
    const supabase = getSupabase();

    console.log(`[contextBuilder] Querying file_knowledge for ${filePath}...`);
    const { data, error } = await supabase
      .from('file_knowledge')
      .select('current_summary, times_modified, open_risks')
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .single();

    if (error) {
      console.log(`[contextBuilder] Supabase error (handled): ${error.message}`);
      return null;
    }
    if (!data) {
      console.log(`[contextBuilder] No prior knowledge for ${filePath}`);
      return null;
    }

    console.log(`[contextBuilder] Found prior knowledge for ${filePath}`);

    const lines = [];

    if (data.current_summary) {
      lines.push(`Previous summary of this file: ${data.current_summary}`);
    }

    if (data.times_modified && data.times_modified > 0) {
      lines.push(`This file has been modified ${data.times_modified} time(s) in previous sessions.`);
    }

    if (data.open_risks && data.open_risks.length > 0) {
      lines.push(`Open risks from previous sessions: ${data.open_risks.join('; ')}`);
    }

    return lines.length > 0 ? lines.join('\n') : null;

  } catch (err) {
    // Non-fatal — Gemini will just get no prior context
    console.error('[contextBuilder] Error fetching file knowledge:', err.message);
    return null;
  }
}

module.exports = { buildContext };

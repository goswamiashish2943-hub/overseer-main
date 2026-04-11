// packages/daemon/src/fileWatcher.js
//
// Auto-detects project context files (.md, PROJECT_CONTEXT.json) and
// uploads them to the backend /api/context endpoint.
// Called once on daemon startup, then polls for changes.
//
// Context files monitored:
//   README.md, ARCHITECTURE.md, TECH_CHOICES.md, SECURITY.md, PROJECT_CONTEXT.json
//
// Zero manual setup: if files don't exist, watcher is a no-op (silent).
// Auth: accepts a getToken() function so it always uses the current refreshed token.

'use strict';

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

// ─── Context files to monitor ─────────────────────────────────────────────────

const CONTEXT_FILES = [
  'README.md',
  'ARCHITECTURE.md',
  'TECH_CHOICES.md',
  'SECURITY.md',
  'PROJECT_CONTEXT.json',
  '.overseer-context.md',
];

const POLL_INTERVAL_MS = 5000; // check for changes every 5 seconds

// ─── Save a single context file to the backend ───────────────────────────────

async function saveContextToDB({ apiUrl, getToken, projectId, filePath, fileName, debug }) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false; // file doesn't exist or can't be read — silent skip
  }

  const token = getToken();
  if (!token) {
    if (debug) console.log(`[fileWatcher] No auth token — skipping context upload for ${fileName}`);
    return false;
  }

  try {
    await axios.post(
      `${apiUrl}/api/context`,
      {
        project_id: projectId,
        file_name:  fileName,
        content,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        timeout: 10000,
      }
    );
    console.log(`  📄 Context file saved: ${fileName}`);
    return true;
  } catch (err) {
    // Non-fatal — daemon continues even if context upload fails
    if (debug) {
      console.warn(`[fileWatcher] Failed to save ${fileName}: ${err.response?.status || err.message}`);
    }
    return false;
  }
}

// ─── Start context watcher ───────────────────────────────────────────────────

/**
 * Starts watching context files in the project root.
 * Uploads any found files immediately, then watches for changes.
 *
 * @param {object} options
 * @param {string}   options.projectRoot  - Absolute path to project directory
 * @param {string}   options.apiUrl       - Backend base URL (e.g. http://localhost:4000)
 * @param {Function} options.getToken     - Getter function returning current auth token
 * @param {string}   options.projectId    - Supabase project UUID
 * @param {boolean}  [options.debug=false]
 * @returns {Function} Stop function — call to stop watching
 */
function startContextWatcher({ projectRoot, apiUrl, getToken, projectId, debug = false }) {
  if (debug) console.log('[fileWatcher] Starting context file watcher...');

  // Track last known content to detect actual changes (avoid re-uploading unchanged files)
  const _contentCache = new Map(); // fileName → content string

  async function checkAndUpload(fileName) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) return;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    // Only upload if content changed
    if (_contentCache.get(fileName) === content) return;
    _contentCache.set(fileName, content);

    console.log(`  📄 Context file detected: ${fileName}`);
    await saveContextToDB({ apiUrl, getToken, projectId, filePath, fileName, debug });
  }

  // ── Initial scan on startup ───────────────────────────────────────────────
  console.log('\n  Scanning for context files...');

  (async () => {
    let found = 0;
    for (const fileName of CONTEXT_FILES) {
      const filePath = path.join(projectRoot, fileName);
      if (fs.existsSync(filePath)) {
        found++;
        await checkAndUpload(fileName);
      }
    }
    if (found === 0) {
      console.log('  (No context files found — add README.md, ARCHITECTURE.md, or TECH_CHOICES.md)');
    }
    console.log('');
  })();

  // ── Polling watcher ───────────────────────────────────────────────────────
  // fs.watch is unreliable on Windows for some editors; polling is more robust.
  const interval = setInterval(async () => {
    for (const fileName of CONTEXT_FILES) {
      await checkAndUpload(fileName);
    }
  }, POLL_INTERVAL_MS);

  // Return a stop function for graceful shutdown
  return function stopContextWatcher() {
    clearInterval(interval);
    if (debug) console.log('[fileWatcher] Context watcher stopped.');
  };
}

module.exports = { startContextWatcher, CONTEXT_FILES };

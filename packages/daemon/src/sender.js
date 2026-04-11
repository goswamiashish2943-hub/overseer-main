// packages/daemon/src/sender.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Routes each diff chunk from watcher.js to either:
//   - backend POST /analyze  (quota mode: active or warning)
//   - checkpointEngine.save() (quota mode: checkpoint)
//
// Includes:
//   - MIN_CHANGED_LINES=3 filter — skips trivial changes
//   - Per-file cooldown — ignores duplicate events within 5 seconds
//   - Auto token refresh on 401

'use strict';

const axios = require('axios');

// ─── Constants ───────────────────────────────────────────────────────────────

const RETRY_ATTEMPTS  = 3;
const RETRY_DELAY_MS  = 1500;
const REQUEST_TIMEOUT = 15000;

// Minimum changed lines to trigger analysis.
// Prevents quota burn on comment edits, blank lines, whitespace.
const MIN_CHANGED_LINES = 3;

// Per-file cooldown after a successful send (ms).
// Prevents duplicate requests when editor + formatter both trigger saves.
// 5 seconds is enough for any formatter to finish.
const FILE_COOLDOWN_MS = 5000;

// ─── Sender ──────────────────────────────────────────────────────────────────

class Sender {
  /**
   * @param {object} options
   * @param {string}   options.apiUrl
   * @param {string}   options.authToken
   * @param {string}   options.projectId
   * @param {string}   options.sessionId
   * @param {object}   options.quotaTracker
   * @param {object}   options.checkpointEngine
   * @param {Function} [options.onTokenRefresh]
   * @param {object}   [options.supabaseClient]
   * @param {boolean}  [options.debug=false]
   */
  constructor({
    apiUrl,
    authToken,
    projectId,
    sessionId,
    checkpointEngine,
    onTokenRefresh = null,
    supabaseClient = null,
    debug = false,
  }) {
    if (!apiUrl)           throw new Error('Sender: apiUrl is required');
    if (!authToken)        throw new Error('Sender: authToken is required');
    if (!projectId)        throw new Error('Sender: projectId is required');
    if (!sessionId)        throw new Error('Sender: sessionId is required');
    if (!checkpointEngine) throw new Error('Sender: checkpointEngine is required');

    this._apiUrl           = apiUrl.replace(/\/$/, '');
    this._authToken        = authToken;
    this._projectId        = projectId;
    this._sessionId        = sessionId;
    this._checkpointEngine = checkpointEngine;
    this._onTokenRefresh   = onTokenRefresh;
    this._supabase         = supabaseClient;
    this._debug            = debug;
    this._refreshing       = false;

    // Per-file cooldown map: filePath → timestamp of last successful send
    this._lastSentTime = new Map();

    this._log('Sender initialised');
  }

  // ─── Public API ────────────────────────────────────────────────────────

  setAuthToken(token) {
    this._authToken = token;
    this._log('Auth token updated');
  }

  async send(changeEvent) {
    this._log(`send() file=${changeEvent.relativePath}`);

    // ── Minimum diff size filter ──────────────────────────────────────────
    const diffText     = changeEvent.chunk?.diffText || '';
    const changedLines = diffText
      .split('\\n')
      .filter((line) => line.startsWith('+') || line.startsWith('-'))
      .length;

    if (changedLines < MIN_CHANGED_LINES) {
      this._log(`Skipping trivial change: ${changeEvent.relativePath} (${changedLines} lines < ${MIN_CHANGED_LINES})`);
      return;
    }

    // ── Per-file cooldown ─────────────────────────────────────────────────
    // After sending an analysis for a file, ignore further changes to that
    // same file for FILE_COOLDOWN_MS. This collapses editor + formatter
    // double-saves into a single Gemini request.
    const filePath = changeEvent.filePath;
    const lastSent = this._lastSentTime.get(filePath) || 0;
    const timeSince = Date.now() - lastSent;

    if (timeSince < FILE_COOLDOWN_MS) {
      this._log(
        `Cooldown active: ${changeEvent.relativePath} ` +
        `(${Math.round(timeSince / 1000)}s < ${FILE_COOLDOWN_MS / 1000}s cooldown)`
      );
      return;
    }

    const payload = this._buildPayload(changeEvent);
    const success = await this._postWithRetry(payload);

    // Record send time for cooldown (only on success)
    if (success) {
      this._lastSentTime.set(filePath, Date.now());
    }
  }

  async sendQueued(queuedChunk) {
    this._log(`sendQueued() file=${queuedChunk.relativePath}`);
    const payload = {
      project_id:   queuedChunk.projectId  || this._projectId,
      session_id:   queuedChunk.sessionId  || this._sessionId,
      file_path:    queuedChunk.relativePath,
      diff_text:    queuedChunk.diff,
      chunk_index:  queuedChunk.chunkIndex,
      total_chunks: queuedChunk.totalChunks,
      timestamp:    queuedChunk.timestamp,
      from_queue:   true,
    };
    await this._postWithRetry(payload);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _buildPayload(changeEvent, diffChunk) {
    return {
      project_id:   this._projectId,
      session_id:   this._sessionId,
      file_path:    changeEvent.relativePath,
      diff_text:    diffChunk ? diffChunk.diffText : changeEvent.chunk.diffText,
      chunk_index:  changeEvent.chunkIndex,
      total_chunks: changeEvent.totalChunks,
      timestamp:    changeEvent.timestamp,
      from_queue:   false,
    };
  }

  // Returns true on success, false on failure
  async _postWithRetry(payload) {
    let lastError;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await axios.post(`${this._apiUrl}/analyze`, payload, {
          timeout: REQUEST_TIMEOUT,
          headers: {
            'Authorization': `Bearer ${this._authToken}`,
            'Content-Type':  'application/json',
          },
        });

        this._log(`POST /analyze OK — file=${payload.file_path} attempt=${attempt}`);
        return true;

      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        this._log(`POST /analyze failed attempt=${attempt} status=${status}`);

        // 401/403 — try silent token refresh then retry once
        if (status === 401 || status === 403) {
          const refreshed = await this._tryRefreshToken();
          if (refreshed) {
            this._log('Token refreshed — retrying');
            try {
              await axios.post(`${this._apiUrl}/analyze`, payload, {
                timeout: REQUEST_TIMEOUT,
                headers: {
                  'Authorization': `Bearer ${this._authToken}`,
                  'Content-Type':  'application/json',
                },
              });
              this._log('POST /analyze OK after token refresh');
              return true;
            } catch (retryErr) {
              console.error('[Overseer] Still failing after token refresh:', retryErr.message);
            }
          } else {
            console.error('[Overseer] Auth failed — run: node src/cli.js login');
            return false;
          }
        }

        // 429 — rate limited
        if (status === 429) {
          console.warn('[Overseer] Rate limited by backend — skipping this chunk');
          return false;
        }

        if (attempt < RETRY_ATTEMPTS) {
          await this._sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    console.error(`[Overseer] Failed after ${RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
    return false;
  }

  async _tryRefreshToken() {
    if (this._refreshing) return false;
    if (!this._supabase)  return false;

    this._refreshing = true;
    try {
      const { data, error } = await this._supabase.auth.refreshSession();
      if (error || !data?.session?.access_token) {
        this._log(`Token refresh failed: ${error?.message}`);
        return false;
      }
      this._authToken = data.session.access_token;
      if (this._onTokenRefresh) this._onTokenRefresh(this._authToken);
      this._log('Token refreshed successfully');
      return true;
    } catch (err) {
      this._log(`Token refresh error: ${err.message}`);
      return false;
    } finally {
      this._refreshing = false;
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _log(msg) {
    if (this._debug) console.log(`[Sender] ${msg}`);
  }
}

module.exports = { Sender };

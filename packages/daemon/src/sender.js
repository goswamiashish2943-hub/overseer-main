// packages/daemon/src/sender.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Routes each diff chunk from watcher.js to either:
//   - backend POST /analyze  (quota mode: active or warning)
//   - checkpointEngine.save() (quota mode: checkpoint)
//
// Includes minimum diff size filter to avoid burning Gemini quota on
// trivial changes like adding a comment or blank line.

'use strict';

const axios = require('axios');

// ─── Constants ───────────────────────────────────────────────────────────────

const RETRY_ATTEMPTS  = 3;
const RETRY_DELAY_MS  = 1500;
const REQUEST_TIMEOUT = 15000;

// Minimum number of changed lines to trigger a Gemini analysis.
// Changes smaller than this are silently skipped.
// This prevents quota burn on comment edits, blank lines, minor whitespace.
const MIN_CHANGED_LINES = 3;

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
    quotaTracker,
    checkpointEngine,
    onTokenRefresh = null,
    supabaseClient = null,
    debug = false,
  }) {
    if (!apiUrl)           throw new Error('Sender: apiUrl is required');
    if (!authToken)        throw new Error('Sender: authToken is required');
    if (!projectId)        throw new Error('Sender: projectId is required');
    if (!sessionId)        throw new Error('Sender: sessionId is required');
    if (!quotaTracker)     throw new Error('Sender: quotaTracker is required');
    if (!checkpointEngine) throw new Error('Sender: checkpointEngine is required');

    this._apiUrl           = apiUrl.replace(/\/$/, '');
    this._authToken        = authToken;
    this._projectId        = projectId;
    this._sessionId        = sessionId;
    this._quotaTracker     = quotaTracker;
    this._checkpointEngine = checkpointEngine;
    this._onTokenRefresh   = onTokenRefresh;
    this._supabase         = supabaseClient;
    this._debug            = debug;
    this._refreshing       = false;

    this._log('Sender initialised');
  }

  // ─── Public API ────────────────────────────────────────────────────────

  setAuthToken(token) {
    this._authToken = token;
    this._log('Auth token updated');
  }

  async send(changeEvent) {
    const mode = this._quotaTracker.getMode();
    this._log(`send() mode=${mode} file=${changeEvent.relativePath}`);

    // ── Minimum diff size filter ──────────────────────────────────────────
    // Count meaningful changed lines (+ or -) in the diff.
    // Skip trivial changes to conserve Gemini quota.
    const diffText    = changeEvent.chunk?.diffText || '';
    const changedLines = diffText
      .split('\n')
      .filter((line) => line.startsWith('+') || line.startsWith('-'))
      .length;

    if (changedLines < MIN_CHANGED_LINES) {
      this._log(`Skipping trivial change: ${changeEvent.relativePath} (${changedLines} changed lines < ${MIN_CHANGED_LINES})`);
      return;
    }

    if (mode === 'checkpoint') {
      this._checkpointEngine.save(changeEvent);
      return;
    }

    const { send, diff } = await this._quotaTracker.shouldSend(
      changeEvent.filePath,
      changeEvent.chunk
    );

    if (!send) {
      this._log(`Batching held: ${changeEvent.relativePath}`);
      return;
    }

    const payload = this._buildPayload(changeEvent, diff);
    await this._postWithRetry(payload);
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

        if (!payload.from_queue) {
          this._quotaTracker.increment();
        }

        this._log(`POST /analyze OK — file=${payload.file_path} attempt=${attempt}`);
        return;

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
              if (!payload.from_queue) this._quotaTracker.increment();
              this._log('POST /analyze OK after token refresh');
              return;
            } catch (retryErr) {
              console.error('[Overseer] Still failing after token refresh:', retryErr.message);
            }
          } else {
            console.error('[Overseer] Auth failed — token expired and refresh failed.');
            console.error('[Overseer] Run: overseer login  to re-authenticate.');
            return;
          }
        }

        // 429 — rate limited, skip this chunk
        if (status === 429) {
          console.warn('[Overseer] Rate limited by backend — skipping this chunk');
          return;
        }

        if (attempt < RETRY_ATTEMPTS) {
          await this._sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    console.error(`[Overseer] Failed to send after ${RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
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

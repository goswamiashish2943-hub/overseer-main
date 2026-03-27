// packages/daemon/src/quotaTracker.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Manages the three-mode quota state machine for the Overseer daemon.
// Modes: active (0-79%) → warning (80-99%) → checkpoint (100%)
// Syncs the used count from Supabase on startup, then tracks locally.

'use strict';

const { EventEmitter } = require('events');

// ─── Constants ───────────────────────────────────────────────────────────────

const MODE_ACTIVE     = 'active';
const MODE_WARNING    = 'warning';
const MODE_CHECKPOINT = 'checkpoint';

const WARNING_THRESHOLD    = 0.80; // 80% of limit
const CHECKPOINT_THRESHOLD = 1.00; // 100% of limit

// In warning mode: if the same file changes more than once within this
// window, collapse those saves into a single analysis send.
const WARNING_BATCH_WINDOW_MS = 2000;
const WARNING_BATCH_MIN_COUNT = 3;

// ─── QuotaTracker ─────────────────────────────────────────────────────────────

class QuotaTracker extends EventEmitter {
  /**
   * @param {object} options
   * @param {object} options.supabaseClient  - Initialised @supabase/supabase-js client
   * @param {string} options.userId          - Supabase auth user ID
   * @param {boolean} [options.debug=false]  - Print debug lines to console
   */
  constructor({ supabaseClient, userId, debug = false }) {
    super();

    if (!supabaseClient) throw new Error('QuotaTracker: supabaseClient is required');
    if (!userId)         throw new Error('QuotaTracker: userId is required');

    this._supabase = supabaseClient;
    this._userId   = userId;
    this._debug    = debug;

    // Quota values — populated by sync()
    this._used         = 0;
    this._limit        = 200;   // default free plan; overwritten by sync()
    this._plan         = 'free';
    this._resetDate    = null;  // JS Date of next quota reset

    this._mode         = MODE_ACTIVE;

    // Warning-mode batching state.
    // Map of filePath → { timer, count, latestDiff }
    this._batchMap     = new Map();

    this._log('QuotaTracker initialised');
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Fetch current quota state from Supabase and set local counters.
   * Call once on daemon startup before watching any files.
   */
  async sync() {
    this._log('Syncing quota from Supabase...');

    const { data, error } = await this._supabase
      .from('quotas')
      .select('plan, monthly_limit, used_this_month, reset_date')
      .eq('user_id', this._userId)
      .single();

    if (error) {
      // Row may not exist yet for a brand-new user; treat as fresh free quota.
      this._log(`Quota row not found or error: ${error.message} — using defaults`);

    } else {
      this._plan      = data.plan          ?? 'free';
      this._limit     = data.monthly_limit ?? 200;
      this._used      = data.used_this_month ?? 0;
      this._resetDate = data.reset_date ? new Date(data.reset_date) : null;
      this._log(`Synced: plan=${this._plan} used=${this._used} limit=${this._limit} reset=${data.reset_date}`);
    }

    this._recalcMode();
    return this.getState();
  }



  /**
   * Called by sender.js after a successful analysis has been sent to the backend.
   * Increments the local used counter and recalculates the current mode.
   * Does NOT write to Supabase — the backend decrements quota server-side.
   */
  increment() {
    this._used += 1;
    this._recalcMode();
    this._log(`Incremented: used=${this._used} mode=${this._mode}`);
    return this.getState();
  }

  /**
   * Returns the current quota state as a plain object.
   * Safe to pass directly to the dashboard or log.
   */
  getState() {
    return {
      used:      this._used,
      limit:     this._limit,
      plan:      this._plan,
      mode:      this._mode,
      resetDate: this._resetDate,
      pctUsed:   this._limit > 0 ? this._used / this._limit : 0,
    };
  }

  /**
   * Returns the current mode string: 'active' | 'warning' | 'checkpoint'
   */
  getMode() {
    return this._mode;
  }

  /**
   * Warning-mode batching gate.
   *
   * In WARNING mode, if the same file is saved multiple times within
   * WARNING_BATCH_WINDOW_MS, we collapse them into one analysis send.
   *
   * Call this from sender.js for every incoming change event when mode
   * is WARNING.  Returns a Promise that resolves to:
   *   - { send: true,  diff: <latestDiff> }  → caller should send this diff
   *   - { send: false }                       → still batching, do not send yet
   *
   * @param {string} filePath     - Absolute path of the changed file
   * @param {object} diffChunk    - The diff chunk object from watcher
   * @returns {Promise<{send: boolean, diff?: object}>}
   */
  shouldSend(filePath, diffChunk) {
    if (this._mode !== MODE_WARNING) {
      // In active or checkpoint mode this gate is not used.
      return Promise.resolve({ send: true, diff: diffChunk });
    }

    return new Promise((resolve) => {
      const existing = this._batchMap.get(filePath);

      if (existing) {
        // Another save arrived within the window — update state.
        clearTimeout(existing.timer);
        existing.count += 1;
        existing.latestDiff = diffChunk;

        existing.timer = setTimeout(() => {
          this._batchMap.delete(filePath);
          const shouldCollapse = existing.count >= WARNING_BATCH_MIN_COUNT;
          this._log(
            `Batch flush: ${filePath} count=${existing.count} collapse=${shouldCollapse}`
          );
          resolve({ send: true, diff: existing.latestDiff });
        }, WARNING_BATCH_WINDOW_MS);

        // Don't resolve yet — window still open.
        // Previous promise stays unresolved; only the final timer resolves.
        // Re-register the resolve so the last caller gets the result.
        existing.resolve = resolve;
      } else {
        // First save in this window.
        const entry = {
          count:      1,
          latestDiff: diffChunk,
          resolve,
          timer: setTimeout(() => {
            this._batchMap.delete(filePath);
            const shouldCollapse = entry.count >= WARNING_BATCH_MIN_COUNT;
            this._log(
              `Batch flush: ${filePath} count=${entry.count} collapse=${shouldCollapse}`
            );
            // Resolve the most recent caller's promise.
            entry.resolve({ send: true, diff: entry.latestDiff });
          }, WARNING_BATCH_WINDOW_MS),
        };
        this._batchMap.set(filePath, entry);

        // Don't resolve this first call yet — we wait for the window.
        // (Intentionally held open.)
      }
    });
  }

  /**
   * Returns true if today is on or after the stored reset date.
   * Used by checkpointEngine to decide whether to process the queue.
   */
  isQuotaReset() {
    if (!this._resetDate) return false;
    return new Date() >= this._resetDate;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /**
   * Recalculate mode from current counters and emit 'modeChange' if changed.
   */
  _recalcMode() {
    const pct      = this._limit > 0 ? this._used / this._limit : 0;
    let   newMode  = MODE_ACTIVE;

    if (pct >= CHECKPOINT_THRESHOLD) {
      newMode = MODE_CHECKPOINT;
    } else if (pct >= WARNING_THRESHOLD) {
      newMode = MODE_WARNING;
    }

    if (newMode !== this._mode) {
      const prev   = this._mode;
      this._mode   = newMode;
      this._log(`Mode changed: ${prev} → ${newMode} (pct=${(pct * 100).toFixed(1)}%)`);
      /**
       * 'modeChange' event payload:
       *   { mode, prev, used, limit, pctUsed }
       */
      this.emit('modeChange', {
        mode:    newMode,
        prev,
        used:    this._used,
        limit:   this._limit,
        pctUsed: pct,
      });
    }
  }

  _log(msg) {
    if (this._debug) {
      console.log(`[QuotaTracker] ${msg}`);
    }
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  QuotaTracker,
  MODE_ACTIVE,
  MODE_WARNING,
  MODE_CHECKPOINT,
};

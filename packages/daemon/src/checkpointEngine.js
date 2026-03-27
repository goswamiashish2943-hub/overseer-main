// packages/daemon/src/checkpointEngine.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Handles local checkpoint storage when the user's quota is exhausted.
// Writes diffs to .overseer/checkpoint_{sessionId}.json during checkpoint mode.
// On daemon startup, processes any queued checkpoints if quota has reset.

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────

const CHECKPOINT_DIR = '.overseer';
const CHECKPOINT_PREFIX = 'checkpoint_';
const PROCESS_INTERVAL_MS = 1000; // 1 chunk per second when draining queue

// ─── CheckpointEngine ────────────────────────────────────────────────────────

class CheckpointEngine {
    /**
     * @param {object} options
     * @param {string} options.projectRoot  - Absolute path to the watched project root
     * @param {string} options.sessionId    - Current session UUID
     * @param {string} options.projectId    - Supabase project UUID
     * @param {Function} options.onDrain    - Called with each queued chunk during drain.
     *                                        Signature: async (chunk) => void
     *                                        chunk shape matches sender.js input
     * @param {boolean} [options.debug=false]
     */
    constructor({ projectRoot, sessionId, projectId, onDrain, debug = false }) {
        if (!projectRoot) throw new Error('CheckpointEngine: projectRoot is required');
        if (!sessionId) throw new Error('CheckpointEngine: sessionId is required');
        if (!projectId) throw new Error('CheckpointEngine: projectId is required');
        if (!onDrain) throw new Error('CheckpointEngine: onDrain callback is required');

        this._projectRoot = projectRoot;
        this._sessionId = sessionId;
        this._projectId = projectId;
        this._onDrain = onDrain;
        this._debug = debug;

        this._checkpointDir = path.join(projectRoot, CHECKPOINT_DIR);
        this._checkpointFile = path.join(
            this._checkpointDir,
            `${CHECKPOINT_PREFIX}${sessionId}.json`
        );

        this._draining = false;

        this._ensureDir();
        this._log(`CheckpointEngine initialised — file: ${this._checkpointFile}`);
    }

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * Append one diff chunk to the checkpoint file for this session.
     * Called by sender.js whenever quota mode is 'checkpoint'.
     *
     * @param {object} chunk - The diff chunk from watcher.js
     * @param {string} chunk.filePath
     * @param {string} chunk.relativePath
     * @param {string} chunk.eventType
     * @param {object} chunk.chunk        - The DiffChunk object from diffExtractor
     * @param {number} chunk.chunkIndex
     * @param {number} chunk.totalChunks
     * @param {number} chunk.timestamp
     */
    save(chunk) {
        const record = this._readFile();

        record.queue.push({
            file: chunk.relativePath,
            diff: chunk.chunk.diffText,
            timestamp: chunk.timestamp,
            chunk_index: chunk.chunkIndex,
            total_chunks: chunk.totalChunks,
        });

        this._writeFile(record);
        this._log(`Saved chunk to queue — file=${chunk.relativePath} total=${record.queue.length}`);
    }

    /**
     * Scan the checkpoint directory for any *.json files from previous sessions.
     * Returns an array of { filePath, record } for all found checkpoint files.
     * Used on daemon startup to discover pending queues.
     *
     * @returns {{ filePath: string, record: object }[]}
     */
    findPendingCheckpoints() {
        this._ensureDir();

        let files;
        try {
            files = fs.readdirSync(this._checkpointDir);
        } catch {
            return [];
        }

        const checkpoints = [];

        for (const name of files) {
            if (!name.startsWith(CHECKPOINT_PREFIX) || !name.endsWith('.json')) continue;

            const filePath = path.join(this._checkpointDir, name);
            try {
                const raw = fs.readFileSync(filePath, 'utf8');
                const record = JSON.parse(raw);
                checkpoints.push({ filePath, record });
                this._log(`Found checkpoint: ${name} — ${record.queue.length} items`);
            } catch (err) {
                this._log(`Skipping corrupt checkpoint file ${name}: ${err.message}`);
            }
        }

        return checkpoints;
    }

    /**
     * Drain a checkpoint file — send each queued chunk via onDrain() at
     * one chunk per second, then delete the file when complete.
     *
     * Safe to call multiple times — only one drain runs at a time.
     *
     * @param {string} checkpointFilePath - Absolute path to the .json file to drain
     * @returns {Promise<void>}
     */
    async drain(checkpointFilePath) {
        if (this._draining) {
            this._log('Drain already in progress — skipping');
            return;
        }

        let record;
        try {
            const raw = fs.readFileSync(checkpointFilePath, 'utf8');
            record = JSON.parse(raw);
        } catch (err) {
            this._log(`Cannot read checkpoint file for drain: ${err.message}`);
            return;
        }

        const queue = record.queue ?? [];
        if (queue.length === 0) {
            this._log('Checkpoint queue is empty — deleting file');
            this._deleteFile(checkpointFilePath);
            return;
        }

        this._draining = true;
        this._log(`Draining ${queue.length} queued chunks from ${checkpointFilePath}`);

        /**
         * Emit a synthetic event payload that matches what sender.js normally
         * receives from watcher.js, so onDrain can pass it straight to the
         * backend POST /analyze.
         */
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];

            try {
                await this._onDrain({
                    relativePath: item.file,
                    diff: item.diff,
                    timestamp: item.timestamp,
                    chunkIndex: item.chunk_index,
                    totalChunks: item.total_chunks,
                    projectId: record.project_id,
                    sessionId: record.session_id,
                    fromQueue: true,
                });
                this._log(`Drained chunk ${i + 1}/${queue.length} — ${item.file}`);
            } catch (err) {
                this._log(`Error draining chunk ${i + 1}: ${err.message} — continuing`);
            }

            // Throttle: wait 1 second between chunks to avoid overwhelming backend.
            if (i < queue.length - 1) {
                await this._sleep(PROCESS_INTERVAL_MS);
            }
        }

        this._draining = false;
        this._deleteFile(checkpointFilePath);
        this._log(`Drain complete — deleted ${checkpointFilePath}`);
    }

    /**
     * Returns true if a drain is currently in progress.
     */
    isDraining() {
        return this._draining;
    }

    /**
     * Returns the path to the current session's checkpoint file.
     * Useful for dashboard banner: "N changes queued".
     */
    getCheckpointFilePath() {
        return this._checkpointFile;
    }

    /**
     * Returns the number of items currently queued in this session's file.
     * Returns 0 if the file does not exist yet.
     */
    getQueueLength() {
        const record = this._readFile();
        return record.queue.length;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Read the current session's checkpoint file.
     * Returns a fresh record object if the file does not exist yet.
     */
    _readFile() {
        if (!fs.existsSync(this._checkpointFile)) {
            return this._freshRecord();
        }
        try {
            const raw = fs.readFileSync(this._checkpointFile, 'utf8');
            return JSON.parse(raw);
        } catch {
            // Corrupt file — start fresh rather than crash the daemon.
            this._log('Corrupt checkpoint file — resetting');
            return this._freshRecord();
        }
    }

    /**
     * Write a record object to the current session's checkpoint file.
     */
    _writeFile(record) {
        fs.writeFileSync(this._checkpointFile, JSON.stringify(record, null, 2), 'utf8');
    }

    /**
     * Delete a checkpoint file.
     */
    _deleteFile(filePath) {
        try {
            fs.unlinkSync(filePath);
            this._log(`Deleted: ${filePath}`);
        } catch (err) {
            this._log(`Could not delete ${filePath}: ${err.message}`);
        }
    }

    /**
     * Returns a blank checkpoint record for a new session.
     */
    _freshRecord() {
        return {
            session_id: this._sessionId,
            project_id: this._projectId,
            quota_reset_date: null, // set by QuotaTracker via setResetDate()
            created_at: new Date().toISOString(),
            queue: [],
        };
    }

    /**
     * Allow sender.js / quotaTracker to stamp the reset date into the file
     * so checkpointEngine knows when it is safe to auto-drain.
     *
     * @param {Date|string} date
     */
    setResetDate(date) {
        const record = this._readFile();
        record.quota_reset_date = date instanceof Date ? date.toISOString() : date;
        this._writeFile(record);
        this._log(`Reset date set: ${record.quota_reset_date}`);
    }

    /**
     * Create the .overseer directory if it does not already exist.
     */
    _ensureDir() {
        if (!fs.existsSync(this._checkpointDir)) {
            fs.mkdirSync(this._checkpointDir, { recursive: true });
            this._log(`Created directory: ${this._checkpointDir}`);
        }
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    _log(msg) {
        if (this._debug) {
            console.log(`[CheckpointEngine] ${msg}`);
        }
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { CheckpointEngine };
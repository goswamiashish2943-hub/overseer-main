// packages/daemon/src/watcher.js
// TEST EVENT Trigger by Claude (senior architect) — do not modify
// OVERSEER — Core file system watcher
// Written by Claude (senior architect) — do not modify
// ==========================================================
// Responsibilities:
//   1. Watch the developer's project folder for file changes
//   2. Maintain a cache of previous file contents for diffing
//   3. Route each change through the quota tracker
//   4. Delegate diff extraction to diffExtractor.js
//   5. Emit structured change events for the sender to consume
// ==========================================================

'use strict'

const chokidar = require('chokidar')
const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')
const { extractDiff } = require('./diffExtractor')

// ── Constants ────────────────────────────────────────────────────────────────

// Folders and patterns that must never trigger analysis.
// Watching node_modules or .git would flood the queue with noise.
const IGNORED_PATTERNS = [
  /(^|[/\\])\../,          // all hidden files and folders (e.g. .env, .git)
  '**/node_modules/**',
  '**/.git/**',
  '**/.overseer/**',        // our own checkpoint folder — never analyse ourselves
  '**/.scope/**',           // legacy name — ignore in case rename not yet done
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.vercel/**',
  '**/coverage/**',
  '**/*.log',
  '**/*.lock',              // package-lock.json, yarn.lock etc — noise
  '**/pnpm-lock.yaml',
]

// File extensions we care about analysing.
// Binary files, images, and fonts produce meaningless diffs.
const WATCHED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h',
  '.php', '.swift', '.kt', '.scala',
  '.html', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh',
  '.md', '.mdx',
  '.env.example',           // .env itself is ignored (hidden file), but .env.example is useful
])

// How long (ms) to wait after the last write before processing.
// Prevents partial-file reads when an editor writes in multiple chunks.
const WRITE_STABILITY_THRESHOLD = 400

// Debounce window (ms): if the same file changes again within this time,
// discard the earlier change and only process the latest version.
// This prevents a cascade when an auto-formatter rewrites a file
// immediately after the agent saves it.
const DEBOUNCE_MS = 600

// ── Watcher class ────────────────────────────────────────────────────────────

class OverseerWatcher extends EventEmitter {
  /**
   * @param {string} projectRoot  Absolute path to the folder being watched
   * @param {object} options
   * @param {boolean} options.debug  Log verbose output
   */
  constructor(projectRoot, options = {}) {
    super()

    this.projectRoot = path.resolve(projectRoot)
    this.debug = options.debug || false

    // Cache of the last known content of each file.
    // Key: absolute file path  Value: string content
    // Used by diffExtractor to compute what actually changed.
    this._fileCache = new Map()

    // Debounce timers — one per file path.
    // Prevents firing multiple events for rapid sequential saves.
    this._debounceTimers = new Map()

    // The chokidar watcher instance (set in start())
    this._watcher = null

    // Whether the watcher is currently active
    this._running = false

    this._log('Watcher initialised for:', this.projectRoot)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start watching the project folder.
   * Emits 'ready' when the initial scan is complete.
   * Emits 'change' for every subsequent file modification.
   * Emits 'error' if chokidar encounters a fatal error.
   */
  start() {
    if (this._running) {
      this._log('Watcher already running — ignoring duplicate start()')
      return
    }

    this._watcher = chokidar.watch(this.projectRoot, {
      ignored: IGNORED_PATTERNS,
      persistent: true,

      // CRITICAL: ignoreInitial = true means chokidar does NOT fire 'add'
      // events for files that already exist when the watcher starts.
      // We only want to analyse NEW changes, not the entire codebase on boot.
      ignoreInitial: true,

      // Wait for the file to finish writing before firing the event.
      // Without this, we might read a file mid-write and get garbled content.
      awaitWriteFinish: {
        stabilityThreshold: WRITE_STABILITY_THRESHOLD,
        pollInterval: 100,
      },

      // Use native OS file system events (inotify / FSEvents / ReadDirectoryChangesW).
      // Much more efficient than polling.
      usePolling: false,

      // Follow symlinks — some projects use them for monorepo setups.
      followSymlinks: true,

      // Depth limit — watch up to 20 levels deep.
      // Prevents runaway watching in deeply nested projects.
      depth: 20,
    })

    this._watcher
      .on('ready', () => {
        this._running = true
        this._log('Initial scan complete. Watching for changes...')
        this.emit('ready', { projectRoot: this.projectRoot })
      })
      .on('change', (filePath) => {
        this._handleFileChange(filePath, 'change')
      })
      .on('add', (filePath) => {
        // 'add' fires for newly created files (not existing ones, due to ignoreInitial)
        this._handleFileChange(filePath, 'add')
      })
      .on('unlink', (filePath) => {
        // File deleted — remove from cache, emit deletion event
        this._fileCache.delete(filePath)
        this._log('File deleted:', this._relativePath(filePath))
        this.emit('delete', { filePath, relativePath: this._relativePath(filePath) })
      })
      .on('error', (error) => {
        console.error('[Overseer Watcher] Error:', error.message)
        this.emit('error', error)
      })
  }

  /**
   * Stop the watcher and clean up all resources.
   * Safe to call multiple times.
   */
  async stop() {
    if (!this._running) return

    // Cancel all pending debounce timers
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer)
    }
    this._debounceTimers.clear()

    if (this._watcher) {
      await this._watcher.close()
      this._watcher = null
    }

    this._running = false
    this._fileCache.clear()
    this._log('Watcher stopped.')
    this.emit('stopped')
  }

  /**
   * Pre-populate the cache with the current content of a file.
   * Call this for files you want to track from a known baseline
   * (e.g. files that existed before the daemon started, if you
   * later want to diff against their state at daemon-start time).
   * Optional — the watcher works correctly without pre-population.
   */
  seedCache(filePath) {
    const absPath = path.resolve(filePath)
    try {
      const content = fs.readFileSync(absPath, 'utf8')
      this._fileCache.set(absPath, content)
    } catch {
      // File may not exist yet or may be binary — silently skip
    }
  }

  /**
   * Return the number of files currently in the content cache.
   * Useful for diagnostics.
   */
  get cacheSize() {
    return this._fileCache.size
  }

  get isRunning() {
    return this._running
  }

  // ── Private methods ────────────────────────────────────────────────────────

  /**
   * Central handler for all file changes and additions.
   * Applies extension filtering, debouncing, and then fires the diff pipeline.
   *
   * @param {string} filePath  Absolute path to the changed file
   * @param {string} eventType 'change' | 'add'
   */
  _handleFileChange(filePath, eventType) {
    // Filter: only process file extensions we care about
    const ext = path.extname(filePath).toLowerCase()
    if (!WATCHED_EXTENSIONS.has(ext) && !this._isWatchedFilename(filePath)) {
      return
    }

    // Debounce: if this file already has a pending timer, reset it.
    // This means we only process the FINAL state of a rapid sequence of writes.
    if (this._debounceTimers.has(filePath)) {
      clearTimeout(this._debounceTimers.get(filePath))
    }

    const timer = setTimeout(() => {
      this._debounceTimers.delete(filePath)
      this._processDiff(filePath, eventType)
    }, DEBOUNCE_MS)

    this._debounceTimers.set(filePath, timer)
  }

  /**
   * Read the changed file, extract the diff against the cached version,
   * and emit a structured 'change' event for the sender to consume.
   *
   * @param {string} filePath   Absolute path to the file
   * @param {string} eventType  'change' | 'add'
   */
  _processDiff(filePath, eventType) {
    // Read the new content
    let newContent
    try {
      newContent = fs.readFileSync(filePath, 'utf8')
    } catch (err) {
      this._log('Could not read file (may have been deleted):', filePath, err.message)
      return
    }

    // Retrieve the previous content from cache (empty string if first time seen)
    const previousContent = this._fileCache.get(filePath) || ''

    // Skip if content is identical — some editors touch the mtime without
    // actually changing content (e.g. auto-save with no changes)
    if (newContent === previousContent) {
      this._log('No content change detected (skipping):', this._relativePath(filePath))
      return
    }

    // Update the cache immediately so the next change diffs correctly
    this._fileCache.set(filePath, newContent)

    // Extract the diff — returns an array of chunk objects
    // Each chunk has: { lines: string[], lineStart: number, type: 'add'|'mixed' }
    let chunks
    try {
      chunks = extractDiff(previousContent, newContent)
    } catch (err) {
      console.error('[Overseer Watcher] Diff extraction failed:', err.message)
      return
    }

    // Nothing meaningful changed (e.g. only whitespace in ignored sections)
    if (!chunks || chunks.length === 0) {
      this._log('Diff produced no chunks (skipping):', this._relativePath(filePath))
      return
    }

    const relativePath = this._relativePath(filePath)
    this._log(
      `Change detected: ${relativePath} | ${eventType} | ${chunks.length} chunk(s)`
    )

    // Emit one event per chunk.
    // The sender (sender.js) receives these and routes them through
    // the quota tracker to either the backend or the checkpoint queue.
    for (let i = 0; i < chunks.length; i++) {
      this.emit('change', {
        filePath,
        relativePath,
        eventType,               // 'change' or 'add'
        chunk: chunks[i],        // { diffText, lineStart, lineEnd, chunkIndex, totalChunks }
        chunkIndex: i,
        totalChunks: chunks.length,
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Some files we care about don't have a standard extension.
   * e.g. Dockerfile, Makefile, .env.example (caught by hidden-file exclusion above,
   * but .env.example starts with . so is excluded — we re-include it here)
   */
  _isWatchedFilename(filePath) {
    const basename = path.basename(filePath)
    const WATCHED_BASENAMES = new Set([
      'Dockerfile', 'Makefile', 'Procfile',
      '.env.example', '.env.sample', '.env.template',
    ])
    return WATCHED_BASENAMES.has(basename)
  }

  /**
   * Convert an absolute path to a project-relative path for display.
   * e.g. /home/user/myproject/src/auth.js → src/auth.js
   */
  _relativePath(filePath) {
    return path.relative(this.projectRoot, filePath)
  }

  _log(...args) {
    if (this.debug) {
      console.log('[Overseer Watcher]', ...args)
    }
  }
}

// ── Module exports ────────────────────────────────────────────────────────────

module.exports = { OverseerWatcher, WATCHED_EXTENSIONS, IGNORED_PATTERNS }

---
name: node-daemon
description: Patterns for the overseer CLI daemon. Load for any
  task related to the file watcher, diff extraction,
  checkpoint system, or CLI commands.
triggers:
  - "daemon"
  - "chokidar"
  - "watcher"
  - "file watch"
  - "cli"
  - "checkpoint"
  - "diff"
  - "quota"
  - "npx overseer"
---

# Daemon patterns for overseer

## Files written by Claude — NEVER modify these
- src/watcher.js
- src/quotaTracker.js
- src/checkpointEngine.js
- src/diffExtractor.js

## Correct chokidar initialisation (copy exactly)
const watcher = chokidar.watch('.', {
  ignored: [
    /(^|[\/\\])\../,        // hidden files/folders
    '**/node_modules/**',
    '**/.git/**',
    '**/.overseer/**',         // our checkpoint folder
    '**/dist/**',
    '**/build/**',
    '**/.next/**'
  ],
  persistent: true,
  ignoreInitial: true,      // skip existing files on startup
  awaitWriteFinish: {
    stabilityThreshold: 300, // wait 300ms after last write
    pollInterval: 100
  }
})

## Diff chunk rule (ALWAYS enforce this)
- If diff is <= 60 lines → send as single analysis
- If diff is > 60 lines → split into chunks of 50 lines each
- Each chunk is one independent queued analysis job
- Never send a diff larger than 60 lines in a single Gemini call

## .overseer folder rules
- Location: {projectRoot}/.overseer/
- Created by daemon on first run if not exists
- Contains ONLY: checkpoint_{sessionId}.json files
- Must always be in .gitignore
- Never committed to version control

## package.json bin entry (enables npx overseer watch)
{
  "name": "@useoverseer/daemon",
  "version": "0.1.0",
  "bin": {
    "overseer": "./src/cli.js"
  }
}

## Three quota modes
active    → 0 to 79% of monthly limit used → send to backend normally
warning   → 80 to 99% → batch rapid same-file saves, then send
checkpoint → 100% hit → write to local JSON queue, no Gemini calls

// packages/backend/src/core/memory-adapter.js
//
// Pluggable memory storage layer.
//
// Priority order (auto-detected):
//   1. MEMORY_BACKEND=supabase → Supabase (set this on Vercel when ready)
//   2. better-sqlite3 available → local SQLite (default for local dev)
//   3. Fallback                 → in-memory Map (Vercel, no persistence, no crash)
//
// HOW TO SWITCH TO SUPABASE LATER (one step):
//   Set env var MEMORY_BACKEND=supabase on Vercel.
//   No code changes needed.

'use strict';

const BACKEND = process.env.MEMORY_BACKEND || 'auto';

let adapter;

if (BACKEND === 'supabase') {
  adapter = require('./memory-supabase');
  console.log('[MemoryAdapter] Using Supabase backend');

} else if (BACKEND === 'local') {
  // Explicit local — try SQLite, hard-fail if not available
  adapter = require('./memory-local');
  console.log('[MemoryAdapter] Using local SQLite backend (overseer-memory.db)');

} else {
  // Auto-detect: try SQLite first, fall back to in-memory if native module unavailable (Vercel)
  try {
    adapter = require('./memory-local');
    console.log('[MemoryAdapter] Auto: using local SQLite backend (overseer-memory.db)');
  } catch (e) {
    console.warn('[MemoryAdapter] SQLite unavailable (' + e.message + ') — using in-memory fallback');
    adapter = require('./memory-inmemory');
  }
}

module.exports = adapter;

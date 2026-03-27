// packages/daemon/src/cli.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Entry point for the `overseer watch` CLI command.
// Wires together: OverseerWatcher → Sender → QuotaTracker → CheckpointEngine
// Uses commander@12 for argument parsing.
// Reads config from .env via dotenv.

'use strict';

require('dotenv').config();

const path      = require('path');
const { v4: uuidv4 } = require('uuid');
const { Command } = require('commander');
const { createClient } = require('@supabase/supabase-js');

const { OverseerWatcher }   = require('./watcher');
const { QuotaTracker, MODE_CHECKPOINT } = require('./quotaTracker');
const { CheckpointEngine }  = require('./checkpointEngine');
const { Sender }            = require('./sender');

// ─── CLI Definition ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('overseer')
  .description('Watch what your AI is building — in real time.')
  .version('0.1.0');

program
  .command('watch [dir]')
  .description('Start watching a project directory')
  .option('--debug', 'Enable verbose debug logging')
  .action(async (dir, options) => {
    await runWatch(dir, options);
  });

program.parse(process.argv);

// ─── Main Watch Runner ───────────────────────────────────────────────────────

async function runWatch(dir, options) {
  const debug = options.debug || process.env.OVERSEER_DEBUG === 'true';

  // ── Resolve project root ──────────────────────────────────────────────────
  const projectRoot = dir
    ? path.resolve(dir)
    : process.cwd();

  console.log(`\n  Overseer — watching ${projectRoot}\n`);

  // ── Read required env vars ────────────────────────────────────────────────
  const apiUrl    = process.env.OVERSEER_API_URL;
  const authToken = process.env.OVERSEER_AUTH_TOKEN;
  const projectId = process.env.OVERSEER_PROJECT_ID;

  // Supabase vars — needed for QuotaTracker sync
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiUrl || !authToken || !projectId) {
    console.error(
      '[Overseer] Missing required env vars.\n' +
      'Add these to your .env file:\n' +
      '  OVERSEER_API_URL\n' +
      '  OVERSEER_AUTH_TOKEN\n' +
      '  OVERSEER_PROJECT_ID\n'
    );
    process.exit(1);
  }

  // ── Session ID ────────────────────────────────────────────────────────────
  // A new UUID each time the daemon starts — ties all events in this run
  // together in the sessions table.
  const sessionId = uuidv4();
  if (debug) console.log(`[CLI] sessionId=${sessionId}`);

  // ── Supabase client (for QuotaTracker) ───────────────────────────────────
  let supabase = null;
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  } else {
    console.warn(
      '[Overseer] SUPABASE_URL / SUPABASE_ANON_KEY not set — quota sync disabled, defaulting to active mode'
    );
  }

  // ── Build userId from auth token ─────────────────────────────────────────
  // We decode the JWT locally (no verify — backend verifies).
  // We just need the sub claim to query the quotas table.
  let userId = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser(authToken);
      userId = data?.user?.id ?? null;
    } catch {
      // Non-fatal — quota sync will be skipped
    }
  }

  // ── QuotaTracker ─────────────────────────────────────────────────────────
  const quotaTracker = new QuotaTracker({
    supabaseClient: supabase || _stubSupabase(),
    userId:         userId   || 'unknown',
    debug,
  });

  // ── CheckpointEngine ─────────────────────────────────────────────────────
  // onDrain callback: when draining a queue, send each chunk via sender
  // We pass a forward-reference fn so sender is available by the time drain runs
  let sender; // defined below
  const checkpointEngine = new CheckpointEngine({
    projectRoot,
    sessionId,
    projectId,
    onDrain: async (chunk) => {
      if (sender) await sender.sendQueued(chunk);
    },
    debug,
  });

  // ── Sender ────────────────────────────────────────────────────────────────
  sender = new Sender({
    apiUrl,
    authToken,
    projectId,
    sessionId,
    quotaTracker,
    checkpointEngine,
    debug,
  });

  // ── Sync quota from Supabase ──────────────────────────────────────────────
  if (supabase && userId) {
    try {
      const state = await quotaTracker.sync();
      console.log(
        `  Quota: ${state.used}/${state.limit} used  |  Mode: ${state.mode}  |  Plan: ${state.plan}\n`
      );
      // Stamp the reset date into the checkpoint engine
      if (state.resetDate) {
        checkpointEngine.setResetDate(state.resetDate);
      }
    } catch (err) {
      console.warn(`[Overseer] Quota sync failed: ${err.message} — continuing in active mode`);
    }
  }

  // ── Process any pending checkpoint queues ─────────────────────────────────
  if (quotaTracker.isQuotaReset()) {
    const pending = checkpointEngine.findPendingCheckpoints();
    if (pending.length > 0) {
      console.log(`  Processing ${pending.length} checkpoint file(s) from previous sessions...\n`);
      for (const { filePath } of pending) {
        await checkpointEngine.drain(filePath);
      }
    }
  }

  // ── Mode change listener ──────────────────────────────────────────────────
  quotaTracker.on('modeChange', ({ mode, prev, used, limit }) => {
    if (mode === MODE_CHECKPOINT) {
      console.warn(
        `\n  [Overseer] Quota reached (${used}/${limit}). Entering checkpoint mode.\n` +
        `  File changes will be saved locally and processed when quota resets.\n`
      );
    } else if (mode === 'warning') {
      console.warn(
        `\n  [Overseer] Quota warning: ${used}/${limit} used (${Math.round(used/limit*100)}%).\n`
      );
    } else if (prev === MODE_CHECKPOINT && mode === 'active') {
      console.log(`\n  [Overseer] Quota reset — back to active mode.\n`);
    }
  });

  // ── Start watcher ─────────────────────────────────────────────────────────
  const watcher = new OverseerWatcher({ projectRoot, debug });

  watcher.on('change', async (changeEvent) => {
    if (debug) {
      console.log(`[CLI] change: ${changeEvent.relativePath} chunk=${changeEvent.chunkIndex}/${changeEvent.totalChunks}`);
    }
    await sender.send(changeEvent);
  });

  watcher.on('error', (err) => {
    console.error(`[Overseer] Watcher error: ${err.message}`);
  });

  watcher.start();

  console.log('  Ready. Watching for file changes...\n');

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    console.log(`\n  [Overseer] ${signal} received — shutting down gracefully...`);
    await watcher.stop();
    console.log('  Stopped.\n');
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A no-op Supabase stub used when env vars are missing,
 * so QuotaTracker can still be constructed without crashing.
 */
function _stubSupabase() {
  return {
    from: () => ({
      select: () => ({
        eq:     () => ({
          single: async () => ({ data: null, error: { message: 'stub' } }),
        }),
      }),
    }),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  };
}

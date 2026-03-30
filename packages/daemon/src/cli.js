// packages/daemon/src/cli.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Entry point for the Overseer CLI.
// Commands:
//   overseer watch [dir]  — start watching a project
//   overseer login        — authenticate and save token locally
//
// Tokens are stored in ~/.overseer/auth.json and refreshed automatically.
// On startup, if the token expires within 10 minutes it is refreshed immediately.

'use strict';

require('dotenv').config();

const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { v4: uuidv4 } = require('uuid');
const { Command } = require('commander');
const { createClient } = require('@supabase/supabase-js');

const { OverseerWatcher }              = require('./watcher');
const { QuotaTracker, MODE_CHECKPOINT } = require('./quotaTracker');
const { CheckpointEngine }             = require('./checkpointEngine');
const { Sender }                       = require('./sender');

// ─── Auth token storage ───────────────────────────────────────────────────────

const AUTH_DIR  = path.join(os.homedir(), '.overseer');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');

function saveAuth(authData) {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
}

function loadAuth() {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Decode JWT expiry without verifying signature.
 * Returns the exp timestamp in milliseconds, or 0 if unreadable.
 */
function getTokenExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return (decoded.exp || 0) * 1000; // convert to ms
  } catch {
    return 0;
  }
}

/**
 * Returns true if the token expires within the given threshold (ms).
 */
function isTokenExpiringSoon(token, thresholdMs = 10 * 60 * 1000) {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true; // can't read expiry — treat as expired
  return Date.now() >= expiry - thresholdMs;
}

// ─── CLI Definition ───────────────────────────────────────────────────────────

const program = new Command();

program
  .name('overseer')
  .description('Watch what your AI is building — in real time.')
  .version('0.1.0');

// ── overseer login ────────────────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate with Overseer')
  .action(async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[Overseer] SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise((resolve) => rl.question(q, resolve));

    console.log('\n  Overseer Login\n');
    const email    = await question('  Email: ');
    const password = await question('  Password: ');
    rl.close();

    console.log('\n  Signing in...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.session) {
      console.error(`\n  Login failed: ${error?.message || 'Unknown error'}`);
      process.exit(1);
    }

    saveAuth({
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id:       data.user.id,
      email:         data.user.email,
      saved_at:      new Date().toISOString(),
    });

    console.log(`\n  Logged in as ${data.user.email}`);
    console.log('  Token saved. Run: overseer watch\n');
    process.exit(0);
  });

// ── overseer watch ────────────────────────────────────────────────────────────
program
  .command('watch [dir]')
  .description('Start watching a project directory')
  .option('--debug', 'Enable verbose debug logging')
  .action(async (dir, options) => {
    await runWatch(dir, options);
  });

program.parse(process.argv);

// ─── Main Watch Runner ────────────────────────────────────────────────────────

async function runWatch(dir, options) {
  const debug = options.debug || process.env.OVERSEER_DEBUG === 'true';

  const projectRoot = dir ? path.resolve(dir) : process.cwd();
  console.log(`\n  Overseer — watching ${projectRoot}\n`);

  // ── Read config ───────────────────────────────────────────────────────────
  const apiUrl    = process.env.OVERSEER_API_URL;
  const projectId = process.env.OVERSEER_PROJECT_ID;

  if (!apiUrl || !projectId) {
    console.error(
      '[Overseer] Missing required env vars.\n' +
      'Add to your .env:\n' +
      '  OVERSEER_API_URL\n' +
      '  OVERSEER_PROJECT_ID\n'
    );
    process.exit(1);
  }

  // ── Load auth token ───────────────────────────────────────────────────────
  let authToken    = null;
  let refreshToken = null;
  let userId       = null;

  const savedAuth = loadAuth();
  if (savedAuth?.access_token) {
    authToken    = savedAuth.access_token;
    refreshToken = savedAuth.refresh_token;
    userId       = savedAuth.user_id;
    if (debug) console.log('[CLI] Loaded token from ~/.overseer/auth.json');
  } else if (process.env.OVERSEER_AUTH_TOKEN) {
    authToken = process.env.OVERSEER_AUTH_TOKEN;
    if (debug) console.log('[CLI] Loaded token from .env');
  }

  if (!authToken) {
    console.error('[Overseer] Not authenticated. Run: node src/cli.js login');
    process.exit(1);
  }

  // ── Supabase client ───────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  let supabase = null;

  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Set session so Supabase can use the refresh token
    if (refreshToken) {
      try {
        await supabase.auth.setSession({
          access_token:  authToken,
          refresh_token: refreshToken,
        });
      } catch (err) {
        if (debug) console.log('[CLI] setSession error (non-fatal):', err.message);
      }
    }

    // ── Proactive token refresh ───────────────────────────────────────────
    // If the token expires within 10 minutes, refresh it NOW before starting.
    // This prevents mid-session auth failures.
    if (isTokenExpiringSoon(authToken)) {
      console.log('  Token expiring soon — refreshing...');
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData?.session?.access_token) {
          console.error('[Overseer] Token refresh failed:', refreshError?.message);
          console.error('[Overseer] Run: node src/cli.js login');
          process.exit(1);
        }
        authToken    = refreshData.session.access_token;
        refreshToken = refreshData.session.refresh_token;
        saveAuth({
          ...savedAuth,
          access_token:  authToken,
          refresh_token: refreshToken,
          saved_at:      new Date().toISOString(),
        });
        console.log('  Token refreshed successfully.\n');
      } catch (err) {
        console.error('[Overseer] Token refresh error:', err.message);
        console.error('[Overseer] Run: node src/cli.js login');
        process.exit(1);
      }
    }

    // Resolve userId from token if not already known
    if (!userId) {
      try {
        const { data } = await supabase.auth.getUser(authToken);
        userId = data?.user?.id ?? null;
      } catch { /* non-fatal */ }
    }
  }

  // ── Session ID ────────────────────────────────────────────────────────────
  const sessionId = uuidv4();
  if (debug) console.log(`[CLI] sessionId=${sessionId}`);

  // ── QuotaTracker ──────────────────────────────────────────────────────────
  const quotaTracker = new QuotaTracker({
    supabaseClient: supabase || _stubSupabase(),
    userId:         userId   || 'unknown',
    debug,
  });

  // ── CheckpointEngine ──────────────────────────────────────────────────────
  let sender;
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
    supabaseClient: supabase,
    onTokenRefresh: (newToken) => {
      const existing = loadAuth() || {};
      saveAuth({ ...existing, access_token: newToken, saved_at: new Date().toISOString() });
      if (debug) console.log('[CLI] Refreshed token persisted to ~/.overseer/auth.json');
    },
    debug,
  });

  // ── Sync quota ────────────────────────────────────────────────────────────
  if (supabase && userId) {
    try {
      const state = await quotaTracker.sync();
      console.log(
        `  Quota: ${state.used}/${state.limit} used  |  Mode: ${state.mode}  |  Plan: ${state.plan}\n`
      );
      if (state.resetDate) {
        checkpointEngine.setResetDate(state.resetDate);
      }
    } catch (err) {
      console.warn(`[Overseer] Quota sync failed: ${err.message} — continuing in active mode`);
    }
  }

  // ── Process pending checkpoints ───────────────────────────────────────────
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
      console.warn(`\n  [Overseer] Quota warning: ${used}/${limit} used.\n`);
    } else if (prev === MODE_CHECKPOINT && mode === 'active') {
      console.log(`\n  [Overseer] Quota reset — back to active mode.\n`);
    }
  });

  // ── Start watcher ─────────────────────────────────────────────────────────
  const watcher = new OverseerWatcher(projectRoot, { debug });

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
    console.log(`\n  [Overseer] ${signal} — shutting down...`);
    await watcher.stop();
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _stubSupabase() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: 'stub' } }),
        }),
      }),
    }),
    auth: {
      getUser:        async () => ({ data: { user: null }, error: null }),
      refreshSession: async () => ({ data: null, error: { message: 'stub' } }),
      setSession:     async () => {},
    },
  };
}

#!/usr/bin/env node
// packages/daemon/src/cli.js
//
// Entry point for the Overseer CLI.
// Commands:
//   overseer watch [dir]  — start watching a project (zero config)
//   overseer login        — authenticate with Overseer
//
// Zero-config design:
//   - No .env file required
//   - Auth token stored permanently in ~/.overseer/auth.json after first login
//   - Project ID auto-resolved from git remote URL (no hard-coding needed)
//   - Project ID cached in <projectRoot>/.overseer/project.json

'use strict';

require('dotenv').config(); // still loads .env if present (dev override)

const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const crypto    = require('crypto');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { Command } = require('commander');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const { OverseerWatcher }     = require('./watcher');
const { CheckpointEngine }    = require('./checkpointEngine');
const { Sender }              = require('./sender');
const { startContextWatcher } = require('./fileWatcher');

// ─── Hardcoded production constants ──────────────────────────────────────────
// These are bundled into the CLI — no .env needed by end users.

const DEFAULT_API_URL       = process.env.OVERSEER_API_URL       || 'https://useoverseerbackend-production.up.railway.app';
const DEFAULT_DASHBOARD_URL = process.env.DASHBOARD_URL           || 'https://overseer-main-dashboard.vercel.app';
const SUPABASE_URL          = process.env.SUPABASE_URL            || 'https://oewhiqcbmvezwqrtxukw.supabase.co';
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY       || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld2hpcWNibXZlendxcnR4dWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDExODUsImV4cCI6MjA4OTIxNzE4NX0._KVIWfWLJBi-Ra8RGkr4AqUzXENNziVihP3z_OTi-nY';

// ─── QuotaTracker stub ────────────────────────────────────────────────────────
// Overseer runs in unlimited mode — no quota tracking is active.

const EventEmitter = require('events');
const quotaTracker = new EventEmitter();
quotaTracker.sync        = async () => ({ used: 0, limit: 'unlimited', mode: 'active', plan: 'pro', resetDate: null });
quotaTracker.isQuotaReset = () => true;
const MODE_CHECKPOINT = 'checkpoint';

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

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function getTokenExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return (decoded.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

function isTokenExpiringSoon(token, thresholdMs = 10 * 60 * 1000) {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() >= expiry - thresholdMs;
}

// ─── Project identifier ───────────────────────────────────────────────────────
// Build a stable, globally-unique identifier for this project.
// Strategy:
//   1. git remote origin URL  — preferred (stable across machines)
//   2. hostname:absolutePath  — fallback for repos with no remote

function getProjectIdentifier(projectRoot) {
  // Try git remote origin
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (remoteUrl) {
      return crypto.createHash('sha256').update(remoteUrl).digest('hex');
    }
  } catch { /* no git or no remote */ }

  // Fallback: hostname + absolute path
  const fallback = `${os.hostname()}:${projectRoot}`;
  return crypto.createHash('sha256').update(fallback).digest('hex');
}

function getProjectName(projectRoot) {
  // Try git remote origin for a human-readable name
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (remoteUrl) {
      // e.g. "https://github.com/user/my-repo.git" → "my-repo"
      const parts = remoteUrl.replace(/\.git$/, '').split('/');
      return parts[parts.length - 1] || path.basename(projectRoot);
    }
  } catch { /* no git */ }
  return path.basename(projectRoot);
}

// ─── Project ID cache (per project root) ─────────────────────────────────────

function loadCachedProjectId(projectRoot) {
  const cacheFile = path.join(projectRoot, '.overseer', 'project.json');
  try {
    if (!fs.existsSync(cacheFile)) return null;
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return data.project_id || null;
  } catch {
    return null;
  }
}

function saveCachedProjectId(projectRoot, projectId) {
  const cacheDir  = path.join(projectRoot, '.overseer');
  const cacheFile = path.join(cacheDir, 'project.json');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ project_id: projectId, saved_at: new Date().toISOString() }, null, 2), 'utf8');
}

// ─── Resolve project ID from backend ─────────────────────────────────────────

async function resolveProjectId(apiUrl, authToken, projectRoot, debug) {
  // 1. Check local cache first
  const cached = loadCachedProjectId(projectRoot);
  if (cached) {
    if (debug) console.log(`[CLI] Project ID loaded from cache: ${cached}`);
    return cached;
  }

  // 2. Call backend
  const identifier = getProjectIdentifier(projectRoot);
  const name       = getProjectName(projectRoot);

  if (debug) console.log(`[CLI] Resolving project: identifier=${identifier.slice(0, 12)}... name="${name}"`);

  try {
    const response = await axios.post(
      `${apiUrl.replace(/\/$/, '')}/api/project/resolve`,
      { identifier, name },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const { project_id, created } = response.data;
    if (!project_id) throw new Error('No project_id returned');

    saveCachedProjectId(projectRoot, project_id);

    if (created) {
      console.log(`  ✅ Project "${name}" created (${project_id.slice(0, 8)}…)\n`);
    } else {
      if (debug) console.log(`[CLI] Project resolved: ${project_id}`);
    }

    return project_id;
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Failed to resolve project ID: ${detail}`);
  }
}

// ─── CLI Definition ───────────────────────────────────────────────────────────

const program = new Command();

program
  .name('overseer')
  .description('Watch what your AI is building — in real time.')
  .version('0.1.1');

// ── overseer login ────────────────────────────────────────────────────────────

program
  .command('login')
  .description('Authenticate with Overseer (run once, or when token expires)')
  .action(async () => {
    console.log('\n  Overseer Login\n');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise((resolve) => rl.question(q, resolve));

    const email    = await question('  Email: ');
    const password = await question('  Password: ');
    rl.close();

    console.log('\n  Signing in…');
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

    console.log(`\n  ✅ Logged in as ${data.user.email}`);
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
  const apiUrl      = DEFAULT_API_URL;

  console.log(`\n  Overseer — watching ${projectRoot}\n`);

  // ── Step 1: Check auth ────────────────────────────────────────────────────
  let authToken    = null;
  let refreshToken = null;
  let userId       = null;

  const savedAuth = loadAuth();
  if (savedAuth?.access_token) {
    authToken    = savedAuth.access_token;
    refreshToken = savedAuth.refresh_token;
    userId       = savedAuth.user_id;
    if (debug) console.log('[CLI] Loaded token from ~/.overseer/auth.json');
  }

  // If not logged in, open browser and exit with instructions
  if (!authToken) {
    console.log('  You are not logged in.\n');
    try {
      const open = (await import('open')).default;
      const loginUrl = `${DEFAULT_DASHBOARD_URL}/auth/login`;
      await open(loginUrl);
      console.log(`  🌐 Opening login page: ${loginUrl}`);
    } catch { /* browser open failed non-fatally */ }
    console.log('\n  After logging in, run:\n    overseer login\n  Then run:\n    overseer watch\n');
    process.exit(0);
  }

  // ── Step 2: Supabase client (uses bundled keys — no user env vars needed) ──
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Restore session for refresh capability
  if (refreshToken) {
    try {
      await supabase.auth.setSession({ access_token: authToken, refresh_token: refreshToken });
    } catch (err) {
      if (debug) console.log('[CLI] setSession error (non-fatal):', err.message);
    }
  }

  // ── Step 3: Proactive token refresh if expiring soon ─────────────────────
  if (isTokenExpiringSoon(authToken)) {
    console.log('  Token expiring soon — refreshing…');
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData?.session?.access_token) {
        console.error('[Overseer] Token refresh failed. Run: overseer login');
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
      console.log('  Token refreshed.\n');
    } catch (err) {
      console.error('[Overseer] Token refresh error:', err.message, '— Run: overseer login');
      process.exit(1);
    }
  }

  // Resolve userId from stored auth or JWT
  if (!userId) {
    try {
      const { data } = await supabase.auth.getUser(authToken);
      userId = data?.user?.id ?? null;
    } catch { /* non-fatal */ }
  }

  // ── Step 4: Auto-resolve project ID ──────────────────────────────────────
  let projectId;
  try {
    projectId = await resolveProjectId(apiUrl, authToken, projectRoot, debug);
  } catch (err) {
    console.error(`\n  [Overseer] ${err.message}`);
    console.error('  Check your internet connection and try again.\n');
    process.exit(1);
  }

  if (debug) console.log(`[CLI] projectId=${projectId}`);

  // ── Step 5: Session ID ────────────────────────────────────────────────────
  const sessionId = uuidv4();
  if (debug) console.log(`[CLI] sessionId=${sessionId}`);

  // ── Step 6: CheckpointEngine ──────────────────────────────────────────────
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

  // ── Step 7: Sender ────────────────────────────────────────────────────────
  sender = new Sender({
    apiUrl,
    authToken,
    projectId,
    sessionId,
    checkpointEngine,
    supabaseClient: supabase,
    onTokenRefresh: (newToken) => {
      authToken = newToken;
      const existing = loadAuth() || {};
      saveAuth({ ...existing, access_token: newToken, saved_at: new Date().toISOString() });
      if (debug) console.log('[CLI] Refreshed token persisted to ~/.overseer/auth.json');
    },
    debug,
  });

  const getToken = () => authToken;

  // ── Process stale checkpoints ─────────────────────────────────────────────
  if (quotaTracker.isQuotaReset()) {
    const pending = checkpointEngine.findPendingCheckpoints();
    if (pending.length > 0) {
      console.log(`  Processing ${pending.length} checkpoint file(s) from previous sessions…\n`);
      for (const { filePath } of pending) {
        await checkpointEngine.drain(filePath);
      }
    }
  }

  // ── Start context file watcher ────────────────────────────────────────────
  const stopContextWatcher = startContextWatcher({
    projectRoot,
    apiUrl,
    getToken,
    projectId,
    debug,
  });

  // ── Start code watcher ────────────────────────────────────────────────────
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
  console.log('  Ready. Watching for file changes…\n');

  // ── Auto-open dashboard ───────────────────────────────────────────────────
  setTimeout(async () => {
    try {
      const open = (await import('open')).default;
      const url = `${DEFAULT_DASHBOARD_URL}/dashboard`;
      await open(url);
      console.log(`  📊 Dashboard: ${url}\n`);
    } catch (err) {
      if (debug) console.log('[CLI] Failed to auto-open browser:', err.message);
    }
  }, 1500);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    console.log(`\n  [Overseer] ${signal} — shutting down…`);
    stopContextWatcher();
    await watcher.stop();
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

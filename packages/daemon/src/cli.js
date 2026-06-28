#!/usr/bin/env node
// packages/daemon/src/cli.js
//
// Local demo entry point for Overseer.
// The daemon now persists auth/project cache locally and talks to the local
// backend database instead of Supabase.

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { Command } = require('commander');
const axios = require('axios');

const { OverseerWatcher } = require('./watcher');
const { CheckpointEngine } = require('./checkpointEngine');
const { Sender } = require('./sender');
const { startContextWatcher } = require('./fileWatcher');

function openBrowser(url) {
  const isWin = process.platform === 'win32';

  if (isWin) {
    const candidates = [
      { name: 'Edge', exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
      { name: 'Edge', exe: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
      { name: 'Chrome', exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
      { name: 'Chrome', exe: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
      { name: 'Firefox', exe: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe' },
    ];

    for (const { name, exe } of candidates) {
      if (fs.existsSync(exe)) {
        try {
          execSync(`start "" "${exe}" "${url}"`, { stdio: 'ignore', windowsHide: true });
          console.log(`  [browser] Launched ${name}.`);
          return;
        } catch (err) {
          console.log(`  [browser] cmd start failed for ${name}: ${err.message}`);
        }
      }
    }

    console.log('  [browser] WARNING: Could not open any browser. Open manually:');
    console.log('  ' + url);
    return;
  }

  try {
    if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    /* ignore */
  }
}

const DEFAULT_API_URL = process.env.OVERSEER_API_URL || 'http://localhost:4000';
const DEFAULT_DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const LOCAL_MODE = process.env.OVERSEER_STORAGE !== 'supabase';

const AUTH_DIR = path.join(os.homedir(), '.overseer');
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

function createLocalAuth(email = 'demo@local.dev') {
  return {
    access_token: crypto.randomUUID(),
    refresh_token: crypto.randomUUID(),
    user_id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
    email,
    saved_at: new Date().toISOString(),
  };
}

function createLocalSupabaseClient(authData) {
  let current = authData
    ? {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        user: {
          id: authData.user_id,
          email: authData.email,
        },
      }
    : null;

  return {
    auth: {
      async getSession() {
        return { data: { session: current } };
      },
      async setSession({ access_token, refresh_token }) {
        if (!current) {
          current = {
            access_token: access_token || crypto.randomUUID(),
            refresh_token: refresh_token || crypto.randomUUID(),
            user: {
              id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
              email: 'demo@local.dev',
            },
          };
        } else {
          current.access_token = access_token || current.access_token;
          current.refresh_token = refresh_token || current.refresh_token;
        }
        return { data: { session: current }, error: null };
      },
      async refreshSession() {
        if (!current) {
          current = {
            access_token: crypto.randomUUID(),
            refresh_token: crypto.randomUUID(),
            user: {
              id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
              email: 'demo@local.dev',
            },
          };
        }
        return { data: { session: current }, error: null };
      },
      async getUser(token) {
        const session = current || {
          access_token: token || crypto.randomUUID(),
          refresh_token: crypto.randomUUID(),
          user: {
            id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
            email: 'demo@local.dev',
          },
        };
        return { data: { user: session.user }, error: null };
      },
      async signInWithPassword({ email }) {
        current = {
          access_token: crypto.randomUUID(),
          refresh_token: crypto.randomUUID(),
          user: {
            id: '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d',
            email: email || 'demo@local.dev',
          },
        };
        return { data: { session: current, user: current.user }, error: null };
      },
      async signUp({ email }) {
        return this.signInWithPassword({ email });
      },
    },
  };
}

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
  if (!expiry) return false;
  return Date.now() >= expiry - thresholdMs;
}

function getProjectIdentifier(projectRoot) {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (remoteUrl) {
      return crypto.createHash('sha256').update(remoteUrl).digest('hex');
    }
  } catch {
    /* no git or no remote */
  }

  const fallback = `${os.hostname()}:${projectRoot}`;
  return crypto.createHash('sha256').update(fallback).digest('hex');
}

function getProjectName(projectRoot) {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (remoteUrl) {
      const parts = remoteUrl.replace(/\.git$/, '').split('/');
      return parts[parts.length - 1] || path.basename(projectRoot);
    }
  } catch {
    /* no git */
  }
  return path.basename(projectRoot);
}

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
  const cacheDir = path.join(projectRoot, '.overseer');
  const cacheFile = path.join(cacheDir, 'project.json');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ project_id: projectId, saved_at: new Date().toISOString() }, null, 2), 'utf8');
}

async function resolveProjectId(apiUrl, authToken, projectRoot, debug) {
  const cached = loadCachedProjectId(projectRoot);
  if (cached) {
    if (debug) console.log(`[CLI] Project ID loaded from cache: ${cached}`);
    return cached;
  }

  const identifier = getProjectIdentifier(projectRoot);
  const name = getProjectName(projectRoot);

  if (debug) console.log(`[CLI] Resolving project: identifier=${identifier.slice(0, 12)}... name="${name}"`);

  const response = await axios.post(
    `${apiUrl.replace(/\/$/, '')}/api/project/resolve`,
    { identifier, name },
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  const { project_id, created } = response.data;
  if (!project_id) throw new Error('No project_id returned');

  saveCachedProjectId(projectRoot, project_id);

  if (created) {
    console.log(`  ? Project "${name}" created (${project_id.slice(0, 8)}…)
`);
  } else if (debug) {
    console.log(`[CLI] Project resolved: ${project_id}`);
  }

  return project_id;
}

const program = new Command();

program
  .name('overseer')
  .description('Watch what your AI is building - in real time.')
  .version('0.1.1');

program
  .command('login')
  .description('Create a local demo session')
  .action(async () => {
    const auth = createLocalAuth();
    saveAuth(auth);
    console.log('\n  Overseer Login (local demo)\n');
    console.log(`  ? Logged in as ${auth.email}`);
    console.log('  Token saved locally. Run: overseer watch\n');
    process.exit(0);
  });

program
  .command('watch [dir]')
  .description('Start watching a project directory')
  .option('--debug', 'Enable verbose debug logging')
  .action(async (dir, options) => {
    await runWatch(dir, options);
  });

program.parse(process.argv);

async function runWatch(dir, options) {
  const debug = options.debug || process.env.OVERSEER_DEBUG === 'true';
  const projectRoot = dir ? path.resolve(dir) : process.cwd();
  const apiUrl = DEFAULT_API_URL;

  console.log(`\n  Overseer - watching ${projectRoot}\n`);

  let savedAuth = loadAuth();
  if (!savedAuth) {
    savedAuth = createLocalAuth();
    saveAuth(savedAuth);
    console.log('  Local demo auth created automatically.');
  }

  let authToken = savedAuth.access_token;
  let refreshToken = savedAuth.refresh_token;
  let userId = savedAuth.user_id;

  const supabase = createLocalSupabaseClient(savedAuth);

  if (refreshToken) {
    try {
      await supabase.auth.setSession({ access_token: authToken, refresh_token: refreshToken });
    } catch (err) {
      if (debug) console.log('[CLI] setSession error (non-fatal):', err.message);
    }
  }

  if (isTokenExpiringSoon(authToken)) {
    console.log('  Token expiring soon - refreshing...');
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData?.session?.access_token) {
        authToken = refreshData.session.access_token;
        refreshToken = refreshData.session.refresh_token;
        saveAuth({
          ...savedAuth,
          access_token: authToken,
          refresh_token: refreshToken,
          saved_at: new Date().toISOString(),
        });
        console.log('  Token refreshed.\n');
      }
    } catch (err) {
      console.warn('  [Overseer] Token refresh failed: ' + err.message + ' - continuing locally.');
    }
  }

  if (!userId) {
    const { data } = await supabase.auth.getUser(authToken);
    userId = data?.user?.id || savedAuth.user_id;
  }

  let projectId;
  try {
    projectId = await resolveProjectId(apiUrl, authToken, projectRoot, debug);
  } catch (err) {
    console.error(`\n  [Overseer] ${err.message}`);
    console.error('  Check the local backend and try again.\n');
    process.exit(1);
  }

  if (debug) console.log(`[CLI] projectId=${projectId}`);

  const sessionId = uuidv4();
  if (debug) console.log(`[CLI] sessionId=${sessionId}`);

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

  sender = new Sender({
    apiUrl,
    authToken,
    projectId,
    sessionId,
    projectRoot,
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

  const stopContextWatcher = startContextWatcher({
    projectRoot,
    apiUrl,
    getToken,
    projectId,
    debug,
  });

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

  setTimeout(() => {
    const url = `${DEFAULT_DASHBOARD_URL}/dashboard`;
    try {
      openBrowser(url);
      console.log(`  ?? Dashboard: ${url}\n`);
    } catch (err) {
      if (debug) console.log('[CLI] Failed to auto-open browser:', err.message);
    }
  }, 1500);

  async function shutdown(signal) {
    console.log(`\n  [Overseer] ${signal} - shutting down...`);
    stopContextWatcher();
    await watcher.stop();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

import { createClient } from '@supabase/supabase-js';

const isLocalMode = process.env.NEXT_PUBLIC_STORAGE_BACKEND !== 'supabase';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const LOCAL_SESSION_KEY = 'overseer_local_session';
const LOCAL_USER_ID = '1e7e6fd6-2e25-4bcb-9f3c-2bca0d8a3f1d';

function makeSession(email = 'demo@local.dev') {
  const access_token = crypto.randomUUID();
  const refresh_token = crypto.randomUUID();
  const session = {
    access_token,
    refresh_token,
    user: {
      id: LOCAL_USER_ID,
      email,
    },
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  };
  return session;
}

function readLocalSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(session) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
}

function clearLocalSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_SESSION_KEY);
}

function createLocalClient() {
  return {
    auth: {
      async getSession() {
        let session = readLocalSession();
        if (!session) {
          session = makeSession();
          writeLocalSession(session);
        }
        return { data: { session } };
      },
      async signInWithPassword({ email }) {
        const session = makeSession(email || 'demo@local.dev');
        writeLocalSession(session);
        return { data: { session }, error: null };
      },
      async signUp({ email }) {
        const session = makeSession(email || 'demo@local.dev');
        writeLocalSession(session);
        return { data: { session }, error: null };
      },
      async setSession({ access_token, refresh_token }) {
        const session = readLocalSession() || makeSession();
        session.access_token = access_token || session.access_token;
        session.refresh_token = refresh_token || session.refresh_token;
        writeLocalSession(session);
        return { data: { session }, error: null };
      },
      async refreshSession() {
        const session = readLocalSession() || makeSession();
        writeLocalSession(session);
        return { data: { session }, error: null };
      },
      async getUser() {
        const session = readLocalSession() || makeSession();
        writeLocalSession(session);
        return { data: { user: session.user }, error: null };
      },
      onAuthStateChange(callback) {
        if (typeof window === 'undefined') {
          return { data: { subscription: { unsubscribe() {} } } };
        }
        const handler = () => callback('INITIAL_SESSION', readLocalSession());
        const timer = window.setTimeout(handler, 0);
        return {
          data: {
            subscription: {
              unsubscribe() {
                window.clearTimeout(timer);
              },
            },
          },
        };
      },
      async signOut() {
        clearLocalSession();
        return { error: null };
      },
    },
  };
}

export const supabase = isLocalMode || !supabaseUrl || !supabaseKey
  ? createLocalClient()
  : createClient(supabaseUrl, supabaseKey);

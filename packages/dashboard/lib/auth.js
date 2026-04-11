import { supabase } from './supabase';

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function redirectIfNotAuth(router) {
  const session = await getSession();
  if (!session) {
    router.push('/auth/login');
  }
}

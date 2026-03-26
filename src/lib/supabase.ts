import { createClient, type Session } from '@supabase/supabase-js';
import { logClientDeployEnvOnce } from './deployDebug';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

logClientDeployEnvOnce();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please configure it in the Secrets panel.');
}

/**
 * Single browser Supabase client — do not call createClient() elsewhere in `src/`.
 * (Server uses its own createClient in server.ts.)
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

/** Dedupe concurrent getSession() calls (single in-flight promise; cleared after settle). */
let sessionPromise: Promise<Session | null> | null = null;

export function getCachedSession(): Promise<Session | null> {
  console.log('SUPABASE SESSION CHECK');
  if (!sessionPromise) {
    sessionPromise = supabase.auth
      .getSession()
      .then(({ data: { session } }) => session ?? null)
      .finally(() => {
        sessionPromise = null;
      });
  }
  return sessionPromise;
}

/** Clear any stuck in-flight state (e.g. after signOut). */
export function invalidateSessionCache() {
  sessionPromise = null;
}

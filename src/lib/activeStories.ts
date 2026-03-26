import { supabase, isSupabaseConfigured } from './supabase';
import { apiUrl } from './apiOrigin';
import { fetchJsonWithDeployLog, logClientDeployEnvOnce } from './deployDebug';

/**
 * Drop expired stories only when expires_at parses to a valid date.
 * If expires_at is missing or invalid, keep the story (avoid false drops after upload).
 */
export function filterActiveStories(storyList: any[]) {
  const rows = storyList || [];
  return rows.filter((s) => {
    if (!s.expires_at) return true;

    const expTime = Date.parse(s.expires_at);
    if (!Number.isFinite(expTime)) return true;

    return expTime > Date.now();
  });
}

type ProfileMap = Record<string, { id: string; username?: string | null; avatar_url?: string | null }>;

/** Merge joined `profiles` + optional `profileMap` (by user_id) into flat fields for UI. */
function mergeStoryProfileRow(s: any, profileMap: ProfileMap = {}) {
  const profile =
    (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles) ||
    profileMap[s.user_id];
  const user = profile?.username ?? s.username ?? 'User';
  const avatar = profile?.avatar_url ?? s.avatar;
  return {
    ...s,
    user,
    username: user,
    avatar,
  };
}

/**
 * Single source of truth for story lists (Home Stories + StoryPage):
 * - When Supabase is configured: only `stories` (+ profiles) from Supabase — never mixed with SQLite API.
 * - When not configured: GET /api/stories (local SQLite).
 */
export async function fetchActiveStories(): Promise<any[]> {
  logClientDeployEnvOnce();
  if (isSupabaseConfigured) {
    try {
      const nowIso = new Date().toISOString();
      // Avoid `.or(<timestamp>)` which can be brittle when PostgREST parses the URL-encoded filter string.
      // We implement the same logic with two explicit queries:
      //  - expires_at IS NULL
      //  - expires_at > nowIso
      const [
        { data: nullExpRows, error: nullExpError },
        { data: futureExpRows, error: futureExpError },
      ] = await Promise.all([
        supabase.from('stories').select('*').is('expires_at', null).order('created_at', { ascending: false }),
        supabase.from('stories').select('*').gt('expires_at', nowIso).order('created_at', { ascending: false }),
      ]);

      const rows = [
        ...(Array.isArray(nullExpRows) ? nullExpRows : []),
        ...(Array.isArray(futureExpRows) ? futureExpRows : []),
      ];

      const sampleTop3 = rows
        .slice(0, 3)
        .map((s: any) => ({ id: s?.id, user_id: s?.user_id, created_at: s?.created_at, expires_at: s?.expires_at }));

      console.log('[DEPLOY_DEBUG] fetchActiveStories Supabase stories (active)', {
        nowIso,
        nullExpCount: Array.isArray(nullExpRows) ? nullExpRows.length : 0,
        futureExpCount: Array.isArray(futureExpRows) ? futureExpRows.length : 0,
        error: nullExpError || futureExpError ? [nullExpError, futureExpError].map((e: any) => ({
          message: e?.message,
          code: e?.code,
          details: e?.details,
        })) : null,
        sampleTop3,
      });

      if (nullExpError && !nullExpRows?.length && futureExpError && !futureExpRows?.length) {
        console.error('[fetchActiveStories] Supabase stories select failed; returning [].', {
          nullExpError,
          futureExpError,
        });
        return [];
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url');

      const profileMap: ProfileMap = Object.fromEntries(
        (profiles || []).map((p: { id: string }) => [p.id, p])
      );

      // Dedupe by id in case a row matches both branches (e.g., null edge cases).
      const byId = new Map<string, any>();
      for (const r of rows || []) {
        if (!r?.id) continue;
        byId.set(String(r.id), r);
      }

      const merged = Array.from(byId.values())
        .map((s) => mergeStoryProfileRow(s, profileMap))
        .sort((a, b) => {
          const tb = new Date(b.created_at || b.createdAt || 0).getTime();
          const ta = new Date(a.created_at || a.createdAt || 0).getTime();
          if (tb !== ta) return tb - ta;
          return String(b.id ?? '').localeCompare(String(a.id ?? ''));
        });
      console.log('[fetchActiveStories] fetched stories result (Supabase, active):', merged.length, merged);
      return merged;
    } catch (e) {
      console.error('[fetchActiveStories] Supabase exception; returning [].', e);
      return [];
    }
  }
  try {
    const url = apiUrl('/api/stories');
    const { ok, status, data } = await fetchJsonWithDeployLog('GET /api/stories', url, {
      method: 'GET',
    });
    if (!ok) {
      console.error('[fetchActiveStories] GET /api/stories not ok; returning [].', { status });
      return [];
    }
    const json = data;
    const merged = filterActiveStories(
      (Array.isArray(json) ? json : []).map((s) => mergeStoryProfileRow(s))
    ).sort(
      (a, b) => {
        const tb = new Date(b.created_at || b.createdAt || 0).getTime();
        const ta = new Date(a.created_at || a.createdAt || 0).getTime();
        if (tb !== ta) return tb - ta;
        return String(b.id ?? '').localeCompare(String(a.id ?? ''));
      }
    );
    console.log('[fetchActiveStories] API rows returned:', merged.length, merged);
    return merged;
  } catch (e) {
    console.error('[fetchActiveStories] API failed; returning [].', e);
    return [];
  }
}

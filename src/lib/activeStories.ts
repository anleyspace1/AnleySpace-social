import { supabase, isSupabaseConfigured } from './supabase';
import { apiUrl, fetchFeedApiSafe, responseLooksLikeJsonApi } from './apiOrigin';
import { fetchJsonWithDeployLog, logClientDeployEnvOnce } from './deployDebug';

/**
 * Drop expired stories only when expires_at parses to a valid date.
 * If expires_at is missing or invalid, keep the story (avoid false drops after upload).
 */
export function filterActiveStories(storyList: any[]) {
  const rows = storyList || [];
  if (import.meta.env.PROD) {
    console.log('FILTER INPUT (PROD):', rows);
  }
  if (import.meta.env.DEV) {
    console.log('FILTER INPUT:', rows);
  }
  const filtered = rows.filter((s) => {
    if (!s.expires_at) return true;

    const expTime = Date.parse(s.expires_at);
    if (!Number.isFinite(expTime)) return true;
    const nowMs = Date.now();
    if (expTime > nowMs) return true;

    // Safety: some environments may persist expires_at incorrectly (e.g. ~= created_at/now).
    // Keep very recent rows if created_at is fresh so brand-new stories do not disappear.
    const createdMs = Date.parse(String(s.created_at || ''));
    if (Number.isFinite(createdMs)) {
      const ageMs = nowMs - createdMs;
      if (ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000) {
        if (import.meta.env.DEV) {
          console.warn('[Stories] Keeping fresh story despite expires_at in the past', {
            id: s?.id,
            user_id: s?.user_id,
            created_at: s?.created_at,
            expires_at: s?.expires_at,
            now: new Date(nowMs).toISOString(),
          });
        }
        return true;
      }
    }
    return false;
  });
  if (import.meta.env.DEV) {
    console.log('FILTER OUTPUT:', filtered);
  }
  if (import.meta.env.PROD) {
    console.log('FILTER OUTPUT (PROD):', filtered);
  }
  return filtered;
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
      // Fetch all rows first, then filter client-side to avoid immediate misses caused by
      // DB-side timestamp filter differences (timezone/drift/schema).
      const { data: rowsRaw, error: rowsError } = await supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false });
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];

      const sampleTop3 = rows
        .slice(0, 3)
        .map((s: any) => ({ id: s?.id, user_id: s?.user_id, created_at: s?.created_at, expires_at: s?.expires_at }));

      console.log('[DEPLOY_DEBUG] fetchActiveStories Supabase stories (raw)', {
        nowIso,
        count: rows.length,
        error: rowsError
          ? {
              message: rowsError?.message,
              code: (rowsError as any)?.code,
              details: (rowsError as any)?.details,
            }
          : null,
        sampleTop3,
      });

      if (rowsError) {
        console.error('[fetchActiveStories] Supabase stories select failed; returning [].', {
          rowsError,
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
      const activeRows = filterActiveStories(rows);
      for (const r of activeRows || []) {
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
    const apiRes = await fetchFeedApiSafe(url, { method: 'GET' });
    if (!responseLooksLikeJsonApi(apiRes)) {
      console.warn('[fetchActiveStories] GET /api/stories unavailable/non-JSON; returning [].');
      return [];
    }
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

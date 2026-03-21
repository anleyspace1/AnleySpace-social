import { supabase, isSupabaseConfigured } from './supabase';
import { API_ORIGIN } from './apiOrigin';

/**
 * Same filter as Home Stories row: only non-expired stories.
 */
export function filterActiveStories(storyList: any[]) {
  const now = new Date();
  return (storyList || []).filter(
    (s) => !s.expires_at || new Date(s.expires_at) > now
  );
}

/**
 * Single source of truth for story lists (Home Stories + StoryPage):
 * - When Supabase is configured: `stories` table (same as Home avatar ring / fetchActiveStoriesMap).
 * - Otherwise: GET /api/stories (local SQLite), then the same expiry filter.
 */
export async function fetchActiveStories(): Promise<any[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('stories').select('*');
      if (error) throw error;
      return filterActiveStories(data || []);
    } catch (e) {
      console.warn('[fetchActiveStories] Supabase failed, falling back to API', e);
    }
  }
  try {
    const res = await fetch(`${API_ORIGIN}/api/stories`);
    if (!res.ok) return [];
    const json = await res.json();
    return filterActiveStories(Array.isArray(json) ? json : []);
  } catch (e) {
    console.warn('[fetchActiveStories] API failed', e);
    return [];
  }
}

import { supabase } from './supabase';

/** Dwell time before a view counts (ms). */
export const POST_VIEW_DWELL_MS = 2500;

/** Post IDs already counted this browser session (dedupe Home + Reels). */
const viewedPostIds = new Set<string>();

export function hasRecordedViewThisSession(postId: string): boolean {
  return viewedPostIds.has(String(postId));
}

/**
 * Increments posts.views once per session per post via RPC.
 * Returns new total views, or null if skipped (already counted or RPC failed).
 */
export async function commitPostViewOnce(postId: string): Promise<number | null> {
  const id = String(postId);
  if (viewedPostIds.has(id)) return null;

  const { data, error } = await supabase.rpc('increment_post_views', { p_post_id: id });

  if (error) {
    console.warn('[postViewTracking] increment_post_views', error);
    return null;
  }

  viewedPostIds.add(id);
  return typeof data === 'number' ? data : Number(data) || null;
}

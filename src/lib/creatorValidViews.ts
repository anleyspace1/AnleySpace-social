import { supabase } from './supabase';

const MIN_VALID_VIEW_SECONDS = 7;
const watchStartMap = new Map<string, number>();
const sessionSent = new Set<string>();

const keyFor = (viewerId: string, postId: string) => `${viewerId}:${postId}`;

export function startCreatorValidViewWatch(viewerId: string, postId: string): void {
  const key = keyFor(String(viewerId || '').trim(), String(postId || '').trim());
  if (!key || key === ':') return;
  if (!watchStartMap.has(key)) {
    watchStartMap.set(key, Date.now());
  }
}

export async function stopCreatorValidViewWatch(viewerId: string, postId: string): Promise<void> {
  const v = String(viewerId || '').trim();
  const p = String(postId || '').trim();
  if (!v || !p) return;
  const key = keyFor(v, p);
  const startedAt = watchStartMap.get(key);
  watchStartMap.delete(key);
  if (!startedAt) return;

  const watchedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  if (watchedSeconds < MIN_VALID_VIEW_SECONDS) return;
  if (sessionSent.has(key)) return;
  sessionSent.add(key);

  const { data, error } = await supabase.rpc('reward_creator_valid_view', {
    p_post_id: p,
    p_viewer_id: v,
    p_watch_seconds: watchedSeconds,
  });
  if (error) {
    console.warn('[creatorValidViews] reward_creator_valid_view failed:', error.message);
    return;
  }
  console.log('CREATOR EARNING SAFE:', data);
}

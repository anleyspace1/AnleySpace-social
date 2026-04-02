import { supabase, isSupabaseConfigured } from './supabase';

/** Window event name for broad monetization UI refresh (profile points, rewards, etc.). */
export const MONETIZATION_REFRESH_EVENT = 'anley-monetization-refresh';
const REFRESH_EVENT = MONETIZATION_REFRESH_EVENT;
const POST_EVENT = 'anley-monetization-post';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debounce(fn: () => void, ms = 200) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    fn();
  }, ms);
}

/** Broad refresh: Rewards (assets API), any UI listening. */
export function emitMonetizationRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Targeted post monetization / earnings (Reels, post detail). */
export function emitPostMonetizationRefresh(postId: string): void {
  if (typeof window === 'undefined' || !postId) return;
  window.dispatchEvent(new CustomEvent(POST_EVENT, { detail: { postId: String(postId) } }));
}

export function subscribeMonetizationRefresh(cb: () => void): () => void {
  const fn = () => cb();
  window.addEventListener(REFRESH_EVENT, fn);
  return () => window.removeEventListener(REFRESH_EVENT, fn);
}

export function subscribePostMonetization(cb: (postId: string) => void): () => void {
  const fn = (e: Event) => {
    const id = (e as CustomEvent<{ postId?: string }>).detail?.postId;
    if (id) cb(id);
  };
  window.addEventListener(POST_EVENT, fn as EventListener);
  return () => window.removeEventListener(POST_EVENT, fn as EventListener);
}

/**
 * Supabase Realtime: profiles (coins, gift_points), gift_transactions, post_monetization, posts.
 * Note: monetization uses `gift_transactions` (there is no `gifts` table). Local SQLite `user_points`
 * is covered by polling fallback + Rewards load().
 */
export function registerMonetizationRealtimeSubscriptions(
  userId: string,
  refreshProfile: () => Promise<void>
): () => void {
  if (!isSupabaseConfigured || !userId) {
    return () => {};
  }

  const run = () => {
    debounce(() => {
      void refreshProfile();
      emitMonetizationRefresh();
    });
  };

  const chName = `monetization-rt-${userId}`;
  const channel = supabase.channel(chName);

  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
    () => run()
  );

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'gift_transactions' },
    (payload) => {
      const n = payload.new as { sender_id?: string; creator_id?: string } | null;
      if (n && (n.sender_id === userId || n.creator_id === userId)) run();
    }
  );

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'post_monetization' },
    (payload) => {
      const row = (payload.new ?? payload.old) as { post_id?: string; creator_id?: string } | null;
      if (row?.creator_id === userId) run();
      if (row?.post_id) emitPostMonetizationRefresh(row.post_id);
    }
  );

  const postThrottle = new Map<string, number>();
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'posts' },
    (payload) => {
      const id = (payload.new as { id?: string } | null)?.id;
      if (!id) return;
      const now = Date.now();
      const last = postThrottle.get(id) ?? 0;
      if (now - last < 500) return;
      postThrottle.set(id, now);
      emitPostMonetizationRefresh(id);
    }
  );

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[monetization-realtime] channel status:', status);
    }
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}

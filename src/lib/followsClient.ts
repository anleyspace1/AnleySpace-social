import { supabase } from './supabase';
import { apiUrl, fetchFeedApiSafe } from './apiOrigin';
import { notifyLikeCommentFollowDm } from './supabaseNotifications';
import { rewardInviter } from './referralRewards';
import { trackUserBehavior } from './userBehavior';

/**
 * Best-effort Express API (local/dev), then always persist to Supabase so static hosting (e.g. Vercel)
 * still saves follow edges when `/api/users/follow` is unavailable.
 */
export async function persistFollowEdge(opts: {
  followerId: string;
  followingId: string;
  unfollow: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { followerId, followingId, unfollow } = opts;

  const {
    data: { user: authUser },
    error: authUserErr,
  } = await supabase.auth.getUser();
  if (!authUser) {
    console.error('FOLLOW AUTH ERROR: supabase.auth.getUser() returned no user', authUserErr);
    return { ok: false, error: 'Not authenticated' };
  }
  if (authUser.id !== followerId) {
    console.error('FOLLOW AUTH ERROR: followerId does not match session user', {
      sessionUserId: authUser.id,
      followerId,
    });
    return { ok: false, error: 'Session mismatch' };
  }

  const endpoint = unfollow ? apiUrl('/api/users/unfollow') : apiUrl('/api/users/follow');
  const res = await fetchFeedApiSafe(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followerId, followingId }),
  });
  if (!res || !res.ok) {
    console.warn('[follows] API unreachable; persisting via Supabase only', {
      unfollow,
      followerId,
      followingId,
    });
  }

  if (unfollow) {
    const { data, error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .select('id');
    if (error) {
      console.error('FOLLOW DELETE ERROR:', error);
      return { ok: false, error: error.message };
    }
    console.log('FOLLOW DATA:', data);
  } else {
    const { data, error } = await supabase
      .from('follows')
      .insert({
        follower_id: followerId,
        following_id: followingId,
      })
      .select('id, follower_id, following_id, created_at');
    if (error && error.code !== '23505') {
      console.log('FOLLOW INSERT ERROR:', error);
      return { ok: false, error: error.message };
    }
    console.log('FOLLOW DATA:', data);
    if (!error) {
      void (async () => {
        const { data: p } = await supabase.from('profiles').select('username').eq('id', followerId).maybeSingle();
        const name = (p?.username && String(p.username).trim()) || 'Someone';
        notifyLikeCommentFollowDm({
          recipientUserId: followingId,
          type: 'follow',
          message: `${name} started following you`,
        });
        notifyLikeCommentFollowDm({
          recipientUserId: followingId,
          type: 'system',
          message: 'Someone interacted with your post 🔥',
        });
        const { count } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', followerId);
        if (typeof count === 'number' && count >= 3) {
          console.log('REFERRAL TRIGGER: follow_3', followerId);
          await rewardInviter(followerId, 'follow_3', 10);
        }
        if (import.meta.env.DEV) {
          console.log('[followsClient][userBehavior] calling trackUserBehavior', {
            action: 'follow',
            userId: followerId,
            targetId: followingId,
          });
        }
        await trackUserBehavior({
          userId: followerId,
          actionType: 'follow',
          targetType: 'user',
          targetId: followingId,
          category: 'user',
        });
      })();
    }
  }
  return { ok: true };
}

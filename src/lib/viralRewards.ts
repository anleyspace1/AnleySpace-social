import { supabase, isSupabaseConfigured } from './supabase';
import { incrementCoins } from './coinsWallet';

const VIRAL_REWARD_COINS = 10;

/** Credit a user's profile coins (read-modify-write on `profiles.coins`). */
export async function rewardUser(userId: string, coins: number): Promise<boolean> {
  return incrementCoins(userId, coins);
}

/**
 * When a post is viral and not yet rewarded, credit the author and record post_rewards.
 * Idempotent via unique post_id + pre-check.
 */
export async function maybeRewardViralPost(post: {
  id?: unknown;
  user_id?: unknown;
  isViral?: boolean;
} | null | undefined): Promise<void> {
  if (!isSupabaseConfigured || !post?.isViral) return;
  const postId = post.id != null ? String(post.id) : '';
  const authorId = post.user_id != null ? String(post.user_id).trim() : '';
  if (!postId || !authorId) return;

  try {
    const { data: existing } = await supabase
      .from('post_rewards')
      .select('id')
      .eq('post_id', postId)
      .maybeSingle();
    if (existing) return;

    const { error: insErr } = await supabase.from('post_rewards').insert({
      post_id: postId,
      user_id: authorId,
      rewarded_at: new Date().toISOString(),
    });
    if (insErr) return;

    await rewardUser(authorId, VIRAL_REWARD_COINS);
  } catch {
    /* table missing / RLS */
  }
}

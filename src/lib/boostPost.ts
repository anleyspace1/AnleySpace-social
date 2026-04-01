import { supabase, isSupabaseConfigured } from './supabase';
import { incrementCoins, platformSpendCoins, revertPlatformSpend } from './coinsWallet';
import { addBoostAmount } from './personalizedRanking';

const BOOST_COST = 50;

export async function boostPostAction(postId: string, userId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !postId || !userId) {
    return { ok: false, message: 'Unavailable' };
  }
  console.log('ADMIN ACTION:', {
    action: 'boost_post',
    adminId: userId,
    postId: postId,
  });
  const spend = await platformSpendCoins(userId, BOOST_COST, 'boost');
  if (!spend.ok) {
    return {
      ok: false,
      message:
        spend.error === 'insufficient_coins' ? 'Not enough coins (50 required).' : spend.error || 'Payment failed',
    };
  }
  const { error } = await supabase.from('post_boosts').insert({
    post_id: postId,
    user_id: userId,
    boost_amount: BOOST_COST,
  });
  if (error) {
    await incrementCoins(userId, BOOST_COST);
    await revertPlatformSpend(BOOST_COST);
    return { ok: false, message: error.message || 'Boost failed' };
  }
  addBoostAmount(postId, BOOST_COST);
  return { ok: true };
}

export { BOOST_COST };

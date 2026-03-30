import { supabase, isSupabaseConfigured } from './supabase';
import { deductCoins, incrementCoins } from './coinsWallet';
import { addBoostAmount } from './personalizedRanking';

const BOOST_COST = 50;

export async function boostPostAction(postId: string, userId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !postId || !userId) {
    return { ok: false, message: 'Unavailable' };
  }
  const okDeduct = await deductCoins(userId, BOOST_COST);
  if (!okDeduct) {
    return { ok: false, message: 'Not enough coins (50 required).' };
  }
  const { error } = await supabase.from('post_boosts').insert({
    post_id: postId,
    user_id: userId,
    boost_amount: BOOST_COST,
  });
  if (error) {
    await incrementCoins(userId, BOOST_COST);
    return { ok: false, message: error.message || 'Boost failed' };
  }
  addBoostAmount(postId, BOOST_COST);
  return { ok: true };
}

export { BOOST_COST };

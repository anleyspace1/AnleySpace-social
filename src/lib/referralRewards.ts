import { supabase } from './supabase';

export async function rewardInviter(userId: string, action: string, coins: number) {
  const uid = String(userId || '').trim();
  if (!uid || !action || !Number.isFinite(coins) || coins <= 0) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', uid)
    .single();

  const inviterId = String((profile as { referred_by?: string | null } | null)?.referred_by || '').trim();
  console.log('REFERRAL CHECK:', {
    userId: uid,
    inviterId: inviterId || null,
    action,
    coins,
  });
  if (!inviterId) return;

  const { data: existing } = await supabase
    .from('referral_rewards')
    .select('id')
    .eq('referred_user_id', uid)
    .eq('action', action)
    .maybeSingle();

  if (existing) return;

  const { data: total } = await supabase
    .from('referral_rewards')
    .select('coins')
    .eq('inviter_id', inviterId);
  const totalEarned = (total || []).reduce(
    (sum, r) => sum + Number((r as { coins?: number | null })?.coins || 0),
    0
  );
  if (totalEarned >= 50) {
    console.log('REFERRAL LIMIT REACHED:', inviterId);
    return;
  }

  const { data: insertData, error: insertError } = await supabase
    .from('referral_rewards')
    .insert({
      inviter_id: inviterId,
      referred_user_id: uid,
      action,
      coins,
    })
    .select();
  console.log('REFERRAL INSERT:', { data: insertData, error: insertError });
  if (insertError) return;

  const { error: rpcError } = await supabase.rpc('increment_user_coins', {
    p_user_id: inviterId,
    p_amount: coins,
  });
  console.log('REFERRAL COINS ADDED:', inviterId);
  if (rpcError) {
    console.warn('[referralRewards] increment_user_coins:', rpcError);
  }

  await supabase.from('notifications').insert({
    user_id: inviterId,
    type: 'system',
    message: `You earned ${coins} coins from referral 🎉`,
  });
  console.log('REFERRAL NOTIFICATION SENT:', inviterId);

  console.log('REFERRAL REWARD:', { inviterId, userId: uid, action, coins });
}

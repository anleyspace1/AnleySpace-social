import { supabase, isSupabaseConfigured } from './supabase';

/** Read-modify-write coin increment (profiles.coins). */
export async function incrementCoins(userId: string, amount: number): Promise<boolean> {
  if (!isSupabaseConfigured || !userId || amount === 0) return false;
  try {
    const { data: prof, error: selErr } = await supabase
      .from('profiles')
      .select('coins')
      .eq('id', userId)
      .maybeSingle();
    if (selErr) return false;
    const cur = Number(prof?.coins) || 0;
    const { error: upErr } = await supabase.from('profiles').update({ coins: cur + amount }).eq('id', userId);
    return !upErr;
  } catch {
    return false;
  }
}

/** Safe read-check-update deduction; throws on failure. */
export async function deductCoins(userId: string, amount: number): Promise<number> {
  if (!isSupabaseConfigured || !userId || amount <= 0) {
    throw new Error('Invalid deduction request');
  }

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', userId)
    .single();

  if (fetchError) throw fetchError;

  const currentCoins = Number(profile?.coins ?? 0);
  if (currentCoins < amount) {
    throw new Error('Not enough coins');
  }

  const newCoins = currentCoins - amount;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ coins: newCoins })
    .eq('id', userId);

  if (updateError) throw updateError;

  return newCoins;
}

export type PlatformSpendTarget = 'boost' | 'ads' | 'monetization_boost';

/** Deduct user coins, credit platform wallet, insert transactions row (type spend + target). Uses RPC. */
export async function platformSpendCoins(
  userId: string,
  amount: number,
  target: PlatformSpendTarget
): Promise<{ ok: boolean; newBalance?: number; error?: string }> {
  if (!isSupabaseConfigured || !userId || amount <= 0) {
    return { ok: false, error: 'invalid' };
  }
  const { data, error } = await supabase.rpc('platform_spend_coins', {
    p_user_id: userId,
    p_amount: Math.floor(amount),
    p_target: target,
  });
  if (error) {
    return { ok: false, error: error.message || 'rpc_error' };
  }
  const d = data as { ok?: boolean; error?: string; new_balance?: number } | null;
  if (!d?.ok) {
    return { ok: false, error: d?.error || 'failed' };
  }
  return { ok: true, newBalance: d.new_balance };
}

/** Reverse platform_wallet credit when refunding a user after a failed follow-up step (e.g. insert). */
export async function revertPlatformSpend(amount: number): Promise<void> {
  if (!isSupabaseConfigured || amount <= 0) return;
  await supabase.rpc('revert_platform_spend', { p_amount: Math.floor(amount) });
}

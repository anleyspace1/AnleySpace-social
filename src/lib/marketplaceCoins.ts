import { supabase } from './supabase';

export const BOOST_COST: Record<number, number> = {
  3: 10,
  7: 20,
  30: 50,
};

/** Load balance or create a zero wallet row (RLS: own user only). */
export async function fetchOrCreateWalletBalance(userId: string): Promise<number | null> {
  const { data: row, error } = await supabase
    .from('user_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[wallet] fetch', error);
    return null;
  }

  if (!row) {
    const { data: created, error: insErr } = await supabase
      .from('user_wallets')
      .insert({ user_id: userId, balance: 0 })
      .select('balance')
      .single();

    if (insErr) {
      console.warn('[wallet] insert', insErr);
      return null;
    }
    return created?.balance ?? 0;
  }

  return row.balance ?? 0;
}

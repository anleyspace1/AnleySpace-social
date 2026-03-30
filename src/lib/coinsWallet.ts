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

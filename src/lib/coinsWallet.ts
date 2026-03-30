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

/** Read-modify-write deduction; returns false if insufficient or error. */
export async function deductCoins(userId: string, amount: number): Promise<boolean> {
  if (!isSupabaseConfigured || !userId || amount <= 0) return false;
  try {
    const { data: prof, error: selErr } = await supabase
      .from('profiles')
      .select('coins')
      .eq('id', userId)
      .maybeSingle();
    if (selErr) return false;
    const cur = Number(prof?.coins) || 0;
    if (cur < amount) return false;
    const { error: upErr } = await supabase.from('profiles').update({ coins: cur - amount }).eq('id', userId);
    return !upErr;
  } catch {
    return false;
  }
}

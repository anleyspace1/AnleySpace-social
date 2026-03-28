import { supabase } from '../lib/supabase';

export async function toggleMarketplaceLike(productId: string, userId: string) {
  const { data: existing } = await supabase
    .from('marketplace_likes')
    .select('id')
    .eq('product_id', productId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('marketplace_likes').delete().eq('id', existing.id);

    return { liked: false };
  } else {
    await supabase.from('marketplace_likes').insert([{ product_id: productId, user_id: userId }]);

    return { liked: true };
  }
}

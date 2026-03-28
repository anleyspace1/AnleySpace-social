import { supabase } from './supabase';

export async function fetchSavedMarketplaceProductIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('saved_marketplace')
    .select('product_id')
    .eq('user_id', userId);
  if (error || !data) return new Set();
  return new Set(data.map((r: { product_id: string }) => r.product_id).filter(Boolean));
}

export async function isProductSavedInMarketplace(userId: string, productId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_marketplace')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function setSavedMarketplaceProduct(userId: string, productId: string, save: boolean): Promise<void> {
  if (save) {
    const { error } = await supabase.from('saved_marketplace').insert({ user_id: userId, product_id: productId });
    if (error && (error as { code?: string }).code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('saved_marketplace')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
    if (error) throw error;
  }
}

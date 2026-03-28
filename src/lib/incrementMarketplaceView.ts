import { isSupabaseConfigured, supabase } from './supabase';

/** Atomic server-side increment (SQL `view_count = view_count + 1`). */
export async function incrementMarketplaceView(
  productId: string
): Promise<{ ok: boolean; error?: unknown }> {
  if (!isSupabaseConfigured()) {
    console.warn(
      '[VIEW] incrementMarketplaceView: Supabase not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)'
    );
    return { ok: false, error: new Error('Supabase not configured') };
  }
  const listing_id = productId.trim();
  if (!listing_id) return { ok: false, error: new Error('empty product id') };

  const { data, error } = await supabase.rpc('increment_marketplace_view', { listing_id });
  console.log('[VIEW] incrementMarketplaceView RPC response', { data, error });

  if (error) {
    return { ok: false, error };
  }
  return { ok: true };
}

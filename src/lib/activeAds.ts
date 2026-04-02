import type { SupabaseClient } from '@supabase/supabase-js';

/** Row shape for feed / sponsored slots (matches `ads` table columns used in UI). */
export type ActiveAdRow = {
  id: string;
  title?: string | null;
  image_url: string;
  link_url: string;
  clicks?: number | null;
  impressions?: number | null;
  created_at?: string | null;
  ends_at?: string | null;
  target_country?: string | null;
  target_interest?: string | null;
  target_min_age?: number | null;
  target_max_age?: number | null;
  status?: string | null;
  is_active?: boolean | null;
};

const SELECT_FIELDS =
  'id, title, image_url, link_url, clicks, impressions, created_at, ends_at, target_country, target_interest, target_min_age, target_max_age, status, is_active';

/**
 * Active ads eligible for feed: live, approved, not expired.
 */
export async function getActiveAds(
  client: SupabaseClient,
  options?: { limit?: number }
): Promise<{ data: ActiveAdRow[]; error: Error | null }> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from('ads')
    .select(SELECT_FIELDS)
    .eq('is_active', true)
    .eq('status', 'approved')
    .gt('ends_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error as Error };
  }

  const rows = (data || []).filter(
    (a: ActiveAdRow) => String(a?.image_url || '').trim() && String(a?.link_url || '').trim()
  ) as ActiveAdRow[];

  return { data: rows, error: null };
}

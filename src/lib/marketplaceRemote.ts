/**
 * When the app is hosted as static files (e.g. Vercel) without the Express API,
 * GET /api/marketplace/products returns HTML — use Supabase directly for public.marketplace rows.
 */
import type { Product } from '../types';
import { isMarketplaceEffectivelyFeatured } from './marketplaceFeatured';
import { resolveMarketplaceListingImageUrl } from './marketplaceImage';
import { supabase } from './supabase';

export async function fetchMarketplaceTableRowsAsApiProducts(): Promise<Record<string, unknown>[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id ?? null;
    console.log('[Marketplace] fetch session', { userId: uid ?? 'anonymous' });
  } catch (se) {
    console.warn('[Marketplace] getSession (non-fatal)', se);
  }

  const { data, error } = await supabase
    .from('marketplace')
    .select('*')
    .order('created_at', { ascending: false });

  const rowCount = data?.length ?? 0;
  console.log('[Marketplace] Supabase select("*") full response', {
    data,
    error,
    rowCount,
  });

  if (error) {
    console.error('[Marketplace] Supabase query error (full)', {
      message: error.message,
      code: error.code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    return [];
  }

  if (!data?.length) {
    return [];
  }

  const beforeMapCount = data.length;
  const sortedRows = [...data].sort((a, b) => {
    const fa = isMarketplaceEffectivelyFeatured(a as Record<string, unknown>) ? 1 : 0;
    const fb = isMarketplaceEffectivelyFeatured(b as Record<string, unknown>) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const ta = new Date(String((a as { created_at?: string }).created_at || 0)).getTime();
    const tb = new Date(String((b as { created_at?: string }).created_at || 0)).getTime();
    return tb - ta;
  });

  const ids = [...new Set(sortedRows.map((r: { user_id?: string }) => r.user_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs, error: profErr } = await supabase.from('profiles').select('id, username').in('id', ids);
    if (profErr) {
      console.error('[Marketplace] profiles select error (full)', {
        message: profErr.message,
        code: profErr.code,
        details: (profErr as { details?: string }).details,
      });
    }
    (profs || []).forEach((p: { id: string; username?: string }) => {
      if (p.id) profileMap.set(p.id, p.username || 'Unknown');
    });
  }

  const mappedRows = sortedRows.map((m: Record<string, unknown>) => ({
    ...m,
    id: m.id,
    title: m.title,
    price: m.price,
    image: resolveMarketplaceListingImageUrl(String(m.image_url ?? '')),
    seller_id: m.user_id,
    category: '',
    location: '',
    description: '',
    stock: 10,
    created_at: m.created_at,
    is_featured_raw: Boolean(m.is_featured),
    is_featured: isMarketplaceEffectivelyFeatured(m),
    seller_username: profileMap.get(String(m.user_id)) || 'Unknown',
  }));

  console.log('[Marketplace] after shape mapping (before Product map)', {
    beforeMapCount,
    afterShapeCount: mappedRows.length,
  });

  return mappedRows;
}

/** Map API / Supabase-shaped rows to Product[] without dropping rows for image validation. */
export function mapMarketplaceRowsToProducts(payload: Record<string, unknown>[]): Product[] {
  console.log('[Marketplace] mapMarketplaceRowsToProducts input length', payload.length);

  const mapped = payload
    .map((p: Record<string, unknown>) => {
      const id = String(p.id ?? '').trim();
      const sellerId = String(p.seller_id ?? p.user_id ?? '').trim();
      if (!id || !sellerId) return null;
      const image = resolveMarketplaceListingImageUrl(String(p.image ?? ''));
      const is_featured_raw =
        p.is_featured_raw !== undefined && p.is_featured_raw !== null
          ? Boolean(p.is_featured_raw)
          : Boolean(p.is_featured);
      const effectiveFeatured = isMarketplaceEffectivelyFeatured({
        is_featured: is_featured_raw,
        featured_until: p.featured_until,
      });
      return {
        ...p,
        id,
        seller_id: sellerId,
        user_id: sellerId,
        title: String(p.title ?? ''),
        price: Number(p.price) || 0,
        location: String(p.location ?? ''),
        image,
        category: String(p.category ?? ''),
        stock: p.stock != null ? Number(p.stock) : undefined,
        view_count: p.view_count != null ? Math.max(0, Number(p.view_count)) : 0,
        is_featured_raw,
        is_featured: effectiveFeatured,
        featured_until:
          p.featured_until != null && String(p.featured_until).trim() !== ''
            ? String(p.featured_until)
            : null,
        seller: { username: String(p.seller_username ?? 'seller').trim() || 'seller' },
      } as Product;
    })
    .filter((row): row is Product => row !== null);

  console.log('[Marketplace] mapMarketplaceRowsToProducts output length', mapped.length);
  if (payload.length > 0 && mapped.length === 0) {
    console.warn('[Marketplace] mapping dropped all rows; sample input', payload[0]);
  }
  return mapped;
}

export async function fetchSingleProductAsApiShape(id: string): Promise<Record<string, unknown> | null> {
  const { data: m, error: mErr } = await supabase.from('marketplace').select('*').eq('id', id).maybeSingle();
  if (!mErr && m) {
    let seller_username = 'Unknown';
    if (m.user_id) {
      const { data: prof } = await supabase.from('profiles').select('username').eq('id', m.user_id).maybeSingle();
      if (prof?.username) seller_username = prof.username;
    }
    const row = m as Record<string, unknown>;
    return {
      ...m,
      id: m.id,
      title: m.title,
      price: m.price,
      image: resolveMarketplaceListingImageUrl(String(m.image_url ?? '')),
      seller_id: m.user_id,
      category: '',
      location: '',
      description: '',
      stock: 10,
      created_at: m.created_at,
      is_featured_raw: Boolean(m.is_featured),
      is_featured: isMarketplaceEffectivelyFeatured(row),
      seller_username,
    };
  }
  return null;
}

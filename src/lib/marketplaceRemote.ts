/**
 * When the app is hosted as static files (e.g. Vercel) without the Express API,
 * GET /api/marketplace/products returns HTML — use Supabase directly for public.marketplace rows.
 */
import type { Product } from '../types';
import { resolveMarketplaceListingImageUrl } from './marketplaceImage';
import { supabase } from './supabase';

export async function fetchMarketplaceTableRowsAsApiProducts(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('marketplace')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('Marketplace rows:', data ?? null, error ? { error } : null);

  if (error) {
    console.warn('[Marketplace] Supabase marketplace select failed:', error.message);
    return [];
  }
  if (!data?.length) return [];

  const ids = [...new Set(data.map((r: { user_id?: string }) => r.user_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, username').in('id', ids);
    (profs || []).forEach((p: { id: string; username?: string }) => {
      if (p.id) profileMap.set(p.id, p.username || 'Unknown');
    });
  }
  return data.map((m: Record<string, unknown>) => ({
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
    seller_username: profileMap.get(String(m.user_id)) || 'Unknown',
  }));
}

/** Map API / Supabase-shaped rows to Product[] without dropping rows for image validation. */
export function mapMarketplaceRowsToProducts(payload: Record<string, unknown>[]): Product[] {
  return payload
    .map((p: Record<string, unknown>) => {
      const id = String(p.id ?? '');
      const sellerId = String(p.seller_id ?? '').trim();
      if (!id || !sellerId) return null;
      const image = resolveMarketplaceListingImageUrl(String(p.image ?? ''));
      return {
        ...p,
        id,
        seller_id: sellerId,
        title: String(p.title ?? ''),
        price: Number(p.price) || 0,
        location: String(p.location ?? ''),
        image,
        category: String(p.category ?? ''),
        stock: p.stock != null ? Number(p.stock) : undefined,
        seller: { username: String(p.seller_username ?? 'seller').trim() || 'seller' },
      } as Product;
    })
    .filter((row): row is Product => row !== null);
}

export async function fetchSingleProductAsApiShape(id: string): Promise<Record<string, unknown> | null> {
  const { data: m, error: mErr } = await supabase.from('marketplace').select('*').eq('id', id).maybeSingle();
  if (!mErr && m) {
    let seller_username = 'Unknown';
    if (m.user_id) {
      const { data: prof } = await supabase.from('profiles').select('username').eq('id', m.user_id).maybeSingle();
      if (prof?.username) seller_username = prof.username;
    }
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
      seller_username,
    };
  }
  return null;
}

import { supabase } from './supabase';

/**
 * Resolve product `image` for display — same bucket and URL shape as Home feed post images
 * (`posts` bucket, paths like `feed/{userId}/{file}` via getPublicUrl).
 */
export function productImagePublicUrl(stored: string | null | undefined): string {
  if (!stored) return '';
  const s = stored.trim();

  if (s.startsWith('https://')) {
    console.log('PRODUCT IMAGE URL:', s);
    return s;
  }

  if (s.startsWith('http://') && !s.includes('localhost') && !s.includes('127.0.0.1')) {
    console.log('PRODUCT IMAGE URL:', s);
    return s;
  }

  // Dev / bad data: localhost or relative path — rebuild public URL from `posts` bucket path
  if (s.includes('localhost') || s.includes('127.0.0.1')) {
    const marker = '/object/public/posts/';
    const idx = s.indexOf(marker);
    if (idx !== -1) {
      const path = decodeURIComponent(s.slice(idx + marker.length).split('?')[0]);
      const { data } = supabase.storage.from('posts').getPublicUrl(path);
      console.log('PRODUCT IMAGE URL:', data.publicUrl);
      return data.publicUrl;
    }
  }

  const path = s.replace(/^\/+/, '');
  const { data } = supabase.storage.from('posts').getPublicUrl(path);
  console.log('PRODUCT IMAGE URL:', data.publicUrl);
  return data.publicUrl;
}

/**
 * Best-effort HTTPS URL for a listing (`image_url` or legacy `image`).
 * Does not drop rows — empty string if nothing usable (UI can show a placeholder).
 */
export function resolveMarketplaceListingImageUrl(stored: string | null | undefined): string {
  const fromBucket = productImagePublicUrl(stored);
  if (fromBucket) return fromBucket;
  const s = String(stored ?? '').trim();
  if (s.startsWith('https://')) return s;
  return '';
}

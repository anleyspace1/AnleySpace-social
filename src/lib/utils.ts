import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Optimizes image URLs by adding transformation parameters for Supabase or other CDNs.
 * @param url The original image URL
 * @param options Optimization options (width, height, quality, format)
 */
export function getOptimizedImageUrl(
  url: string | undefined | null,
  options: { width?: number; height?: number; quality?: number; format?: 'webp' | 'avif' | 'origin' } = {}
): string {
  if (!url) return '';

  const { width, height, quality = 80, format = 'webp' } = options;

  // Handle Supabase URLs
  if (url.includes('.supabase.co/storage/v1/object/public/')) {
    const baseUrl = url.split('?')[0];
    const params = new URLSearchParams();
    if (width) params.set('width', width.toString());
    if (height) params.set('height', height.toString());
    if (quality) params.set('quality', quality.toString());
    if (format && format !== 'origin') params.set('format', format);
    
    // Note: Supabase image transformation requires the project to have it enabled.
    // If not enabled, these params might be ignored, but it's good practice.
    return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  }

  // Handle Picsum Photos - it doesn't support format/quality via query params easily
  // but we can at least ensure the dimensions are what we requested.
  if (url.includes('picsum.photos')) {
    // Picsum URLs are often https://picsum.photos/seed/{seed}/{width}/{height}
    // or https://picsum.photos/{width}/{height}
    const parts = url.split('/');
    const isSeed = url.includes('/seed/');
    
    if (width && height) {
      if (isSeed) {
        // https://picsum.photos/seed/abc/200/300 -> parts: [https:, , picsum.photos, seed, abc, 200, 300]
        const seedIndex = parts.indexOf('seed');
        if (seedIndex !== -1 && parts[seedIndex + 1]) {
          return `https://picsum.photos/seed/${parts[seedIndex + 1]}/${width}/${height}`;
        }
      } else {
        // https://picsum.photos/200/300
        return `https://picsum.photos/${width}/${height}`;
      }
    }
  }

  return url;
}

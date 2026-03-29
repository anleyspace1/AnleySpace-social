/**
 * Shared guards so feeds and marketplace only surface real DB-backed identities and media.
 * (No demo usernames, no picsum/placeholder URLs treated as content.)
 */

const PLACEHOLDER_USERNAMES = new Set(
  ['', 'seller', 'user', 'demo', 'test', 'unknown', 'null', 'undefined', 'anonymous'].map((s) =>
    s.toLowerCase()
  )
);

export function isPlaceholderUsername(name: string | undefined | null): boolean {
  const t = String(name ?? '').trim().toLowerCase();
  if (!t) return true;
  if (PLACEHOLDER_USERNAMES.has(t)) return true;
  return false;
}

export function isDemoOrPlaceholderImageUrl(url: string | undefined | null): boolean {
  const s = String(url ?? '').trim();
  if (!s) return true;
  const l = s.toLowerCase();
  if (l.includes('picsum.photos') || l.includes('placehold') || l.includes('via.placeholder')) {
    return true;
  }
  return false;
}

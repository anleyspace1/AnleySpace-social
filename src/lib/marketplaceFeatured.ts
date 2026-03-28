/**
 * Featured only when flagged AND (no end date OR end date still in the future).
 */
export function isMarketplaceEffectivelyFeatured(row: {
  is_featured?: unknown;
  featured_until?: unknown;
}): boolean {
  if (!Boolean(row.is_featured)) return false;
  const until = row.featured_until;
  if (until == null || String(until).trim() === '') return true;
  const t = new Date(String(until)).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now();
}

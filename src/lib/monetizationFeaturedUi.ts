/**
 * DB / API row: `is_featured === true` means boosted for tips (when column exists).
 * Also accepts camelCase `isFeatured` from some clients.
 */
export function normalizePostRowIsFeatured(
  row: { is_featured?: unknown; isFeatured?: unknown } | null | undefined
): boolean {
  if (row == null) return false;
  const a = row.is_featured;
  const b = row.isFeatured;
  if (a === true || b === true) return true;
  if (a === 'true' || b === 'true') return true;
  if (a === 1 || b === 1) return true;
  return false;
}

/**
 * @deprecated Prefer `normalizePostRowIsFeatured` or `isPostBoostedForTips`.
 */
export function isPostFeaturedForMonetization(
  post: { is_featured?: unknown; isFeatured?: unknown } | null | undefined
): boolean {
  return normalizePostRowIsFeatured(post);
}

/** Normalize API/DB unlock signals (boolean, string, number, or `monetizationLocked` inverse). */
export function isMonetizationUnlockedForTips(
  monetization: { unlocked?: unknown; monetizationLocked?: unknown } | null | undefined
): boolean {
  if (monetization == null) return false;
  const u = monetization.unlocked;
  const ml = monetization.monetizationLocked;
  if (u === true || u === 'true' || u === 1 || u === '1') return true;
  if (typeof u === 'string' && u.toLowerCase() === 'true') return true;
  if (ml === false || ml === 'false' || ml === 0) return true;
  return false;
}

/**
 * Tip/gift UI: boosted when `posts.is_featured` is true OR monetization is unlocked
 * (`post_monetization` after coin boost — matches Reels which loads GET /monetization/post).
 */
export function isPostBoostedForTips(
  post: { is_featured?: unknown; isFeatured?: unknown } | null | undefined,
  monetization: { unlocked?: unknown; monetizationLocked?: unknown } | null | undefined
): boolean {
  if (normalizePostRowIsFeatured(post)) return true;
  return isMonetizationUnlockedForTips(monetization);
}

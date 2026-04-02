/** Coin packages sold via Stripe Checkout (must match checkout session + webhook). */
export const STRIPE_CHECKOUT_COIN_PACKAGES = [100, 250, 700] as const;

/** Supabase auth user ids are UUIDs; reject non-UUID strings so metadata cannot target arbitrary rows. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse Stripe Checkout Session metadata for coin credit. Rejects malformed UUIDs or unknown packages
 * so webhooks never credit the wrong user or arbitrary amounts.
 */
export function parseCheckoutCreditMetadata(
  meta: Record<string, string> | null | undefined
): { userId: string; coins: number } | null {
  if (!meta || typeof meta !== 'object') return null;
  const userId = typeof meta.user_id === 'string' ? meta.user_id.trim() : '';
  if (!userId || !UUID_RE.test(userId)) return null;
  const coinsRaw = meta.coins;
  const coins = typeof coinsRaw === 'string' ? Number(coinsRaw.trim()) : Number(coinsRaw);
  if (!Number.isInteger(coins) || coins <= 0) return null;
  if (!STRIPE_CHECKOUT_COIN_PACKAGES.includes(coins as (typeof STRIPE_CHECKOUT_COIN_PACKAGES)[number])) {
    return null;
  }
  return { userId, coins };
}

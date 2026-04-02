/** Preset tip amounts (coins) — UI only; `sendMonetizationGift(postId, amount)` accepts any positive amount. */
export const MONETIZATION_TIP_AMOUNTS = [10, 50, 100, 500] as const;

export type MonetizationTipAmount = (typeof MONETIZATION_TIP_AMOUNTS)[number];

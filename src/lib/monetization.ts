import { apiUrl } from './apiOrigin';
import { getBearerAuthHeaders } from './supabaseAuthHeaders';
import { emitMonetizationRefresh, emitPostMonetizationRefresh } from './monetizationRealtime';

/** 1 coin = $0.01 USD */
export const COIN_USD = 0.01;

export const BOOST_TIERS = [
  { id: 'basic' as const, label: 'Basic', priceUsd: 2, maxEarningsUsd: 7.6, days: 30 },
  { id: 'growth' as const, label: 'Growth', priceUsd: 5, maxEarningsUsd: 19, days: 30 },
  { id: 'pro' as const, label: 'Pro', priceUsd: 10, maxEarningsUsd: 38, days: 30 },
  { id: 'viral' as const, label: 'Viral', priceUsd: 25, maxEarningsUsd: 95, days: 30 },
  { id: 'mega' as const, label: 'Mega', priceUsd: 50, maxEarningsUsd: 190, days: 30 },
] as const;

export type BoostTierId = (typeof BOOST_TIERS)[number]['id'];

export function tierPriceCoins(tier: BoostTierId): number {
  const row = BOOST_TIERS.find((t) => t.id === tier);
  return row ? Math.round(row.priceUsd / COIN_USD) : 200;
}

/** $200 spend = 10,000 points → points = coins * 0.5 */
export function coinsToGiftPoints(coins: number): number {
  return Math.floor(coins * 0.5);
}

export const REWARD_LEVELS = [
  { id: 'bronze', minPoints: 10_000, multiplier: 1.0 },
  { id: 'silver', minPoints: 50_000, multiplier: 1.1 },
  { id: 'gold', minPoints: 100_000, multiplier: 1.25 },
  { id: 'platinum', minPoints: 500_000, multiplier: 1.5 },
  { id: 'diamond', minPoints: 1_000_000, multiplier: 2.0 },
] as const;

export type RewardLevel = (typeof REWARD_LEVELS)[number];

/** Tier badge only once points ≥ Bronze (10k). Below that, returns null. */
export function rewardTierForPoints(points: number): RewardLevel | null {
  if (points < REWARD_LEVELS[0].minPoints) return null;
  let cur: RewardLevel = REWARD_LEVELS[0];
  for (const r of REWARD_LEVELS) {
    if (points >= r.minPoints) cur = r;
  }
  return cur;
}

/** Legacy: returns Bronze tier when below 10k points (for older call sites). */
export function rewardLevelForPoints(points: number): RewardLevel {
  return rewardTierForPoints(points) ?? REWARD_LEVELS[0];
}

/** Monthly reward = activityScore × levelMultiplier (activity 0–1 composite). */
export function monthlyRewardPreview(activityScore: number, giftPoints: number): number {
  const level = rewardTierForPoints(giftPoints);
  const mult = level?.multiplier ?? 1;
  return activityScore * mult;
}

export type MonetizationPostStatus = {
  ok: boolean;
  unlocked: boolean;
  monetizationLocked: boolean;
  tier: string | null;
  expiresAt: string | null;
  boostEarningsCents: number;
  maxBoostEarningsCents: number;
  organicEarningsCents: number;
  boostProgress: number;
  creatorId?: string;
};

export async function fetchMonetizationPost(postId: string): Promise<MonetizationPostStatus | null> {
  try {
    const res = await fetch(apiUrl(`/api/monetization/post/${encodeURIComponent(postId)}`));
    const j = await res.json();
    if (!res.ok) return null;
    return j as MonetizationPostStatus;
  } catch {
    return null;
  }
}

export async function purchaseMonetizationBoost(postId: string, tier: BoostTierId): Promise<{ ok: boolean; error?: string }> {
  const headers = await getBearerAuthHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(apiUrl('/api/monetization/boost'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ postId, tier }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: typeof j.error === 'string' ? j.error : 'Boost failed' };
  emitPostMonetizationRefresh(postId);
  emitMonetizationRefresh();
  return { ok: true };
}

export async function sendMonetizationGift(
  postId: string,
  coins: number
): Promise<{ ok: boolean; error?: string; pointsToSender?: number }> {
  const headers = await getBearerAuthHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(apiUrl('/api/monetization/gift'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ postId, coins }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: typeof j.error === 'string' ? j.error : 'Gift failed' };
  emitPostMonetizationRefresh(postId);
  emitMonetizationRefresh();
  return { ok: true, pointsToSender: typeof j.pointsToSender === 'number' ? j.pointsToSender : undefined };
}

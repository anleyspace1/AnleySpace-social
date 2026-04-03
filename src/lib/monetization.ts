import { apiUrl, responseLooksLikeJsonApi } from './apiOrigin';
import { getBearerAuthHeaders } from './supabaseAuthHeaders';
import { emitMonetizationRefresh, emitPostMonetizationRefresh } from './monetizationRealtime';
import { isSupabaseConfigured, supabase } from './supabase';

/** Dev or `?debugMonetization=1` — log monetization / unlocked / is_featured for Vercel debugging. */
export function isMonetizationDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debugMonetization') === '1';
  } catch {
    return false;
  }
}

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

/** Same mapping as `server.ts` GET /api/monetization/post/:postId — used when the API host is unavailable (e.g. Vercel static). */
function monetizationStatusFromPostMonetizationRow(
  row: {
    creator_id?: string | null;
    tier?: string | null;
    max_boost_earnings_cents?: number | null;
    boost_earnings_cents?: number | null;
    organic_earnings_cents?: number | null;
    expires_at?: string | null;
  } | null
): MonetizationPostStatus {
  if (!row) {
    return {
      ok: true,
      unlocked: false,
      monetizationLocked: true,
      tier: null,
      expiresAt: null,
      boostEarningsCents: 0,
      maxBoostEarningsCents: 0,
      organicEarningsCents: 0,
      boostProgress: 0,
    };
  }
  const expiresAtMs = row.expires_at ? new Date(String(row.expires_at)).getTime() : 0;
  const now = Date.now();
  const unlocked = Number.isFinite(expiresAtMs) && expiresAtMs > now;
  if (isMonetizationDebugEnabled() && row.expires_at && !Number.isFinite(expiresAtMs)) {
    console.warn('[monetization] invalid expires_at', { raw: row.expires_at });
  }
  const maxC = Number(row.max_boost_earnings_cents) || 0;
  const boostC = Number(row.boost_earnings_cents) || 0;
  const organicC = Number(row.organic_earnings_cents) || 0;
  const boostProgress = maxC > 0 ? Math.min(1, boostC / maxC) : 0;
  return {
    ok: true,
    unlocked,
    monetizationLocked: !unlocked,
    tier: row.tier ?? null,
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
    boostEarningsCents: boostC,
    maxBoostEarningsCents: maxC,
    organicEarningsCents: organicC,
    boostProgress,
    creatorId: row.creator_id ?? undefined,
  };
}

/**
 * Read monetization from Supabase (anon can SELECT per RLS). Used when `/api/monetization/post` is missing
 * (static hosting) or returns non-JSON.
 */
async function fetchMonetizationPostFromSupabase(postId: string): Promise<MonetizationPostStatus | null> {
  if (!isSupabaseConfigured) return null;
  const pid = String(postId).trim();
  try {
    const { data: row, error } = await supabase
      .from('post_monetization')
      .select(
        'post_id, creator_id, tier, price_coins, max_boost_earnings_cents, boost_earnings_cents, organic_earnings_cents, expires_at, created_at'
      )
      .eq('post_id', pid)
      .maybeSingle();
    if (isMonetizationDebugEnabled()) {
      console.log('[monetization] RAW post_monetization', {
        postId: pid,
        error: error ? { message: error.message, code: error.code, details: error.details } : null,
        row: row ?? null,
        expires_at: row && (row as { expires_at?: unknown }).expires_at,
      });
    }
    if (error) {
      if (isMonetizationDebugEnabled()) console.warn('[monetization] Supabase post_monetization', error.message);
      return null;
    }
    return monetizationStatusFromPostMonetizationRow(row);
  } catch {
    return null;
  }
}

function isMonetizationPostPayload(j: unknown): j is MonetizationPostStatus {
  if (j == null || typeof j !== 'object') return false;
  const o = j as Record<string, unknown>;
  const u = o.unlocked;
  return (
    typeof u === 'boolean' ||
    typeof u === 'number' ||
    typeof u === 'string' ||
    typeof o.monetizationLocked === 'boolean'
  );
}

/** Normalize API JSON (numbers/strings) into MonetizationPostStatus shape. */
function normalizeMonetizationApiPayload(j: unknown): MonetizationPostStatus | null {
  if (j == null || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const uRaw = o.unlocked;
  const mlRaw = o.monetizationLocked;
  let unlocked: boolean;
  if (typeof uRaw === 'boolean') {
    unlocked = uRaw;
  } else if (uRaw === true || uRaw === 'true' || uRaw === 1 || uRaw === '1') {
    unlocked = true;
  } else if (typeof uRaw === 'string' && uRaw.toLowerCase() === 'true') {
    unlocked = true;
  } else if (uRaw === false || uRaw === 'false' || uRaw === 0) {
    unlocked = false;
  } else if (mlRaw === false || mlRaw === 'false') {
    unlocked = true;
  } else if (mlRaw === true) {
    unlocked = false;
  } else {
    return null;
  }
  return {
    ok: o.ok !== false && o.ok !== 'false',
    unlocked,
    monetizationLocked: !unlocked,
    tier: (o.tier as string | null) ?? null,
    expiresAt: o.expiresAt != null ? String(o.expiresAt) : null,
    boostEarningsCents: Number(o.boostEarningsCents) || 0,
    maxBoostEarningsCents: Number(o.maxBoostEarningsCents) || 0,
    organicEarningsCents: Number(o.organicEarningsCents) || 0,
    boostProgress: Number(o.boostProgress) || 0,
    creatorId: o.creatorId != null ? String(o.creatorId) : undefined,
  };
}

function logMonetizationDebug(
  label: string,
  payload: { postId: string; unlocked?: boolean; source: string }
): void {
  if (!isMonetizationDebugEnabled()) return;
  console.log('[monetization]', label, payload);
}

async function tryFetchMonetizationFromApi(postId: string): Promise<MonetizationPostStatus | null> {
  try {
    const res = await fetch(apiUrl(`/api/monetization/post/${encodeURIComponent(postId)}`));
    if (responseLooksLikeJsonApi(res) && res.ok) {
      const j: unknown = await res.json();
      if (isMonetizationPostPayload(j)) {
        const normalized = normalizeMonetizationApiPayload(j);
        if (normalized) return normalized;
      }
    }
  } catch {
    /* CORS, network, or invalid JSON */
  }
  return null;
}

/**
 * Loads boost / unlock state for tips & gifts UI.
 * - **Development:** tries Express `/api/monetization/post` first (local proxy), then Supabase.
 * - **Production:** reads Supabase `post_monetization` first (no CORS to a separate API host), then API if Supabase unavailable.
 */
export async function fetchMonetizationPost(postId: string): Promise<MonetizationPostStatus | null> {
  if (import.meta.env.DEV) {
    const fromApi = await tryFetchMonetizationFromApi(postId);
    logMonetizationDebug('fetch order: dev API first', {
      postId,
      source: fromApi ? 'api' : 'pending',
      unlocked: fromApi?.unlocked,
    });
    if (fromApi) return fromApi;
    const fromSb = await fetchMonetizationPostFromSupabase(postId);
    logMonetizationDebug('fetch order: dev Supabase fallback', {
      postId,
      source: fromSb ? 'supabase' : 'none',
      unlocked: fromSb?.unlocked,
    });
    return fromSb;
  }

  const fromSb = await fetchMonetizationPostFromSupabase(postId);
  logMonetizationDebug('fetch order: prod Supabase first', {
    postId,
    source: fromSb != null ? 'supabase' : 'none',
    unlocked: fromSb?.unlocked,
  });
  if (fromSb?.unlocked) return fromSb;

  const fromApi = await tryFetchMonetizationFromApi(postId);
  const merged = mergeMonetizationPostStatus(fromSb, fromApi);
  logMonetizationDebug('fetch order: prod merge Supabase+API', {
    postId,
    supabaseUnlocked: fromSb?.unlocked,
    apiUnlocked: fromApi?.unlocked,
    mergedUnlocked: merged?.unlocked,
  });
  if (merged) return merged;
  return fromSb ?? fromApi;
}

/** When Home post id ≠ reel row id, merge unlock signals so Tip/Gifts match Home. */
export function mergeMonetizationPostStatus(
  a: MonetizationPostStatus | null,
  b: MonetizationPostStatus | null
): MonetizationPostStatus | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const unlocked = !!(a.unlocked || b.unlocked);
  return {
    ...a,
    ...b,
    unlocked,
    ok: !!(a.ok || b.ok),
    monetizationLocked: unlocked ? false : !!(a.monetizationLocked || b.monetizationLocked),
  };
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

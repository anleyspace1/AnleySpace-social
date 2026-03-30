import { REWARD_LEVELS, rewardTierForPoints, type RewardLevel } from './monetization';

export const MIN_REWARD_ELIGIBILITY_POINTS = 10_000;

export type TierProgressInfo = {
  eligible: boolean;
  currentTier: RewardLevel | null;
  currentTierLabel: string;
  tierMultiplier: number | null;
  nextTierLabel: string | null;
  nextTierMinPoints: number | null;
  /** Progress within [rangeLo, rangeHi] toward next tier */
  rangeLo: number;
  rangeHi: number;
  progressPercent: number;
  pointsRemaining: number;
  pointsInRange: string;
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getRewardsTierProgress(points: number): TierProgressInfo {
  const eligible = points >= MIN_REWARD_ELIGIBILITY_POINTS;
  if (!eligible) {
    return {
      eligible: false,
      currentTier: null,
      currentTierLabel: 'Locked',
      tierMultiplier: null,
      nextTierLabel: 'Bronze',
      nextTierMinPoints: MIN_REWARD_ELIGIBILITY_POINTS,
      rangeLo: 0,
      rangeHi: MIN_REWARD_ELIGIBILITY_POINTS,
      progressPercent: Math.min(100, (points / MIN_REWARD_ELIGIBILITY_POINTS) * 100),
      pointsRemaining: Math.max(0, MIN_REWARD_ELIGIBILITY_POINTS - points),
      pointsInRange: `${Math.max(0, Math.floor(points)).toLocaleString()} / ${MIN_REWARD_ELIGIBILITY_POINTS.toLocaleString()}`,
    };
  }

  const cur = rewardTierForPoints(points)!;
  const idx = REWARD_LEVELS.findIndex((x) => x.id === cur.id);
  const next = REWARD_LEVELS[idx + 1];

  if (!next) {
    return {
      eligible: true,
      currentTier: cur,
      currentTierLabel: cap(cur.id),
      tierMultiplier: cur.multiplier,
      nextTierLabel: null,
      nextTierMinPoints: null,
      rangeLo: cur.minPoints,
      rangeHi: cur.minPoints,
      progressPercent: 100,
      pointsRemaining: 0,
      pointsInRange: `${Math.floor(points).toLocaleString()} / Max`,
    };
  }

  const lo = cur.minPoints;
  const hi = next.minPoints;
  const progressPercent = Math.min(100, Math.max(0, ((points - lo) / (hi - lo)) * 100));
  return {
    eligible: true,
    currentTier: cur,
    currentTierLabel: cap(cur.id),
    tierMultiplier: cur.multiplier,
    nextTierLabel: cap(next.id),
    nextTierMinPoints: next.minPoints,
    rangeLo: lo,
    rangeHi: hi,
    progressPercent,
    pointsRemaining: Math.max(0, hi - points),
    pointsInRange: `${Math.floor(points).toLocaleString()} / ${hi.toLocaleString()}`,
  };
}

/** Weighted activity: watch 40%, likes 20%, comments 20%, shares 20%. */
export function compositeActivityPercent(parts: {
  watch_pct: number;
  likes_pct: number;
  comments_pct: number;
  shares_pct: number;
}): number {
  const w = parts.watch_pct * 0.4 + parts.likes_pct * 0.2 + parts.comments_pct * 0.2 + parts.shares_pct * 0.2;
  return Math.min(100, Math.max(0, w));
}

/** Stable pseudo-random breakdown for demo when API omits fields (same user → same numbers). */
export function stableActivityBreakdown(seed: string): {
  watch_pct: number;
  likes_pct: number;
  comments_pct: number;
  shares_pct: number;
} {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const u = (n: number) => 55 + (Math.abs(h >> n) % 36);
  return {
    watch_pct: u(0),
    likes_pct: u(3),
    comments_pct: u(6),
    shares_pct: u(9),
  };
}

/** Reward = (composite% / 100) × 100 × tier multiplier — matches reference “78% × 100 × 2.5”. */
export function estimatedRewardCoins(compositePercent: number, points: number): number {
  const tier = rewardTierForPoints(points);
  const mult = tier?.multiplier ?? 1;
  return Math.round((compositePercent / 100) * 100 * mult);
}

/** Monthly claim allowed only on the 1st (local calendar). */
export function isMonthlyClaimDay(): boolean {
  return new Date().getDate() === 1;
}

export function nextFirstOfMonthDate(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

export function formatClaimAvailabilityNote(): string {
  if (isMonthlyClaimDay()) return 'You can claim today.';
  const next = nextFirstOfMonthDate();
  return `Available on the 1st of next month (${next.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })})`;
}

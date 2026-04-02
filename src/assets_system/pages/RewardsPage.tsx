import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Trophy,
  Gift,
  Coins,
  Sparkles,
  CheckCircle2,
  Lock,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { assetsApi, type RewardState } from '../api';
import { cn } from '../../lib/utils';
import {
  getRewardsTierProgress,
  MIN_REWARD_ELIGIBILITY_POINTS,
  formatClaimAvailabilityNote,
  compositeActivityPercent,
} from '../../lib/rewardsDashboard';
import { rewardTierForPoints } from '../../lib/monetization';
import { emitMonetizationRefresh, subscribeMonetizationRefresh } from '../../lib/monetizationRealtime';
import { supabase } from '../../lib/supabase';
import { apiUrl } from '../../lib/apiOrigin';
import { getBearerAuthHeaders } from '../../lib/supabaseAuthHeaders';

/** When true, POST /api/rewards/claim (Supabase RPC) is used instead of legacy assets/SQLite claim. */
const USE_SUPABASE_REWARDS_CLAIM = String(import.meta.env.VITE_USE_SUPABASE_REWARDS_CLAIM || '').toLowerCase() === 'true';

type MonthlyActivity = {
  watchCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  watchPct: number;
  likesPct: number;
  commentsPct: number;
  sharesPct: number;
  compositePct: number;
};

const MONTHLY_ACTIVITY_TARGETS = {
  watch: 1000,
  likes: 250,
  comments: 80,
  shares: 60,
} as const;

export default function RewardsPage() {
  const { user, profile } = useAuth();
  const userId = user?.id || 'u1';
  const [reward, setReward] = useState<RewardState | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [profilePointsSnapshot, setProfilePointsSnapshot] = useState<{ points: number; giftPoints: number }>({
    points: 0,
    giftPoints: 0,
  });
  const [monthlyActivity, setMonthlyActivity] = useState<MonthlyActivity>({
    watchCount: 0,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    watchPct: 0,
    likesPct: 0,
    commentsPct: 0,
    sharesPct: 0,
    compositePct: 0,
  });

  const load = useCallback(
    () => assetsApi.getRewards(userId).then(setReward).catch(() => setReward(null)),
    [userId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeMonetizationRefresh(() => void load());
  }, [load]);

  const loadProfilePoints = useCallback(async () => {
    if (!user?.id) {
      setProfilePointsSnapshot({ points: 0, giftPoints: 0 });
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('points, gift_points')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      const missingGiftPoints =
        String((error as { code?: string }).code || '') === '42703' &&
        /gift_points/i.test(String((error as { message?: string }).message || ''));
      if (!missingGiftPoints) {
        console.warn('[Rewards] profile points load failed', error);
        return;
      }
      const { data: pointsOnly, error: pointsErr } = await supabase
        .from('profiles')
        .select('points')
        .eq('id', user.id)
        .maybeSingle();
      if (pointsErr) {
        console.warn('[Rewards] profile points fallback failed', pointsErr);
        return;
      }
      setProfilePointsSnapshot({
        points: Number((pointsOnly as { points?: number } | null)?.points ?? 0) || 0,
        giftPoints: 0,
      });
      return;
    }
    setProfilePointsSnapshot({
      points: Number((data as { points?: number } | null)?.points ?? 0) || 0,
      giftPoints: Number((data as { gift_points?: number } | null)?.gift_points ?? 0) || 0,
    });
  }, [user?.id]);

  useEffect(() => {
    void loadProfilePoints();
  }, [loadProfilePoints]);

  useEffect(() => {
    return subscribeMonetizationRefresh(() => void loadProfilePoints());
  }, [loadProfilePoints]);

  const loadMonthlyActivity = useCallback(async () => {
    if (!user?.id) {
      setMonthlyActivity({
        watchCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        watchPct: 0,
        likesPct: 0,
        commentsPct: 0,
        sharesPct: 0,
        compositePct: 0,
      });
      return;
    }
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('user_behavior')
      .select('action_type')
      .eq('user_id', user.id)
      .gte('created_at', monthStart.toISOString());
    if (error) {
      console.warn('[Rewards] monthly activity load failed', error);
      return;
    }
    const rows = (data || []) as Array<{ action_type?: string | null }>;
    if (import.meta.env.DEV) {
      console.log('[Rewards][dev] user_behavior rows this month', { count: rows.length });
    }
    const watchCount = rows.filter((x) => x.action_type === 'view').length;
    const likesCount = rows.filter((x) => x.action_type === 'like').length;
    const commentsCount = rows.filter((x) => x.action_type === 'comment').length;
    const sharesCount = rows.filter((x) => x.action_type === 'share').length;
    const watchPct = Math.min(100, (watchCount / MONTHLY_ACTIVITY_TARGETS.watch) * 100);
    const likesPct = Math.min(100, (likesCount / MONTHLY_ACTIVITY_TARGETS.likes) * 100);
    const commentsPct = Math.min(100, (commentsCount / MONTHLY_ACTIVITY_TARGETS.comments) * 100);
    const sharesPct = Math.min(100, (sharesCount / MONTHLY_ACTIVITY_TARGETS.shares) * 100);
    const compositePct = compositeActivityPercent({
      watch_pct: watchPct,
      likes_pct: likesPct,
      comments_pct: commentsPct,
      shares_pct: sharesPct,
    });
    setMonthlyActivity({
      watchCount,
      likesCount,
      commentsCount,
      sharesCount,
      watchPct,
      likesPct,
      commentsPct,
      sharesPct,
      compositePct,
    });
  }, [user?.id]);

  useEffect(() => {
    void loadMonthlyActivity();
  }, [loadMonthlyActivity]);

  useEffect(() => {
    return subscribeMonetizationRefresh(() => void loadMonthlyActivity());
  }, [loadMonthlyActivity]);

  /**
   * Headline points: Supabase monetization only (gift_points + points).
   * Do not merge assets mock/reward.points — that layer used a 6400 demo default and is unrelated to gifts/boosts.
   */
  const points = useMemo(() => {
    const gp = Number(profile?.gift_points ?? 0);
    const pp = Number(profile?.points ?? 0);
    const sp = Number(profilePointsSnapshot.points ?? 0);
    const sgp = Number(profilePointsSnapshot.giftPoints ?? 0);
    const v = Math.max(
      Number.isFinite(gp) ? gp : 0,
      Number.isFinite(pp) ? pp : 0,
      Number.isFinite(sp) ? sp : 0,
      Number.isFinite(sgp) ? sgp : 0
    );
    return Math.max(0, v);
  }, [profile?.gift_points, profile?.points, profilePointsSnapshot.giftPoints, profilePointsSnapshot.points]);
  /** Source of truth: points ≥ 10k (aligned with server rules). */
  const isEligible = points >= MIN_REWARD_ELIGIBILITY_POINTS;

  const tierProgress = useMemo(() => getRewardsTierProgress(points), [points]);

  const activityPct = useMemo(() => monthlyActivity.compositePct, [monthlyActivity.compositePct]);

  const hasActivity =
    monthlyActivity.watchCount +
      monthlyActivity.likesCount +
      monthlyActivity.commentsCount +
      monthlyActivity.sharesCount >
    0;

  /** 100 coins at max points (10k); linear: 1 coin per 100 points. */
  const rewardCoins = useMemo(() => Math.floor(points / 100), [points]);

  const tierMeta = rewardTierForPoints(points);
  const displayMultiplier = tierMeta?.multiplier ?? reward?.tier_multiplier ?? 1;

  const handleClaimReward = async () => {
    if (claiming || !isEligible) return;
    try {
      setClaiming(true);
      if (USE_SUPABASE_REWARDS_CLAIM) {
        const headers = await getBearerAuthHeaders();
        if (!headers) throw new Error('Sign in required');
        const res = await fetch(apiUrl('/api/rewards/claim'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ activity_percent: activityPct }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) throw new Error(j?.error || 'Claim failed');
        emitMonetizationRefresh();
      } else {
        await assetsApi.claimRewards(userId);
      }
      await load();
      await loadProfilePoints();
    } catch (e) {
      console.error('[Rewards] claim failed', e);
      const msg = e instanceof Error ? e.message : 'Could not claim reward. Try again.';
      alert(msg);
    } finally {
      setClaiming(false);
    }
  };

  const r = 52;
  const c = 2 * Math.PI * r;
  const dashOffset = c - (c * Math.min(100, activityPct)) / 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen pb-16 px-4 lg:px-8"
      style={{ background: 'linear-gradient(165deg, #0a0a18 0%, #12122a 45%, #0d0d20 100%)' }}
    >
      <div className="max-w-4xl mx-auto pt-6 space-y-5">
        <div>
          <h1 className="text-3xl text-white font-black tracking-tight flex items-center gap-2">
            <Trophy className="text-amber-400" size={28} />
            Rewards
          </h1>
          <p className="text-white/50 text-sm mt-1">Assets · Monthly rewards & tier progress</p>
        </div>

        {!user ? (
          <p className="text-white/60 text-sm">Sign in to view rewards.</p>
        ) : !reward ? (
          <div className="h-48 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        ) : (
          <>
            {/* Top card — points, eligibility, tier badge, progress */}
            <div
              className={cn(
                'rounded-2xl border p-5 sm:p-6 backdrop-blur-xl',
                'border-violet-500/25 bg-gradient-to-br from-violet-950/80 via-[#12122a] to-indigo-950/60 shadow-lg shadow-indigo-950/40'
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-white/50 text-xs font-bold uppercase tracking-widest">Points</p>
                    {isEligible ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 border border-emerald-500/30">
                        <CheckCircle2 size={12} />
                        Eligible
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-200 text-[11px] font-bold px-2.5 py-0.5 border border-amber-500/25">
                        <Lock size={12} />
                        Eligibility: Locked
                      </span>
                    )}
                  </div>
                  <p className="text-4xl sm:text-5xl font-black text-white mt-2 tabular-nums">
                    {Math.floor(points).toLocaleString()}
                  </p>

                  <div
                    className={cn(
                      'mt-4 inline-flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl px-3 py-2 border max-w-full',
                      isEligible
                        ? 'bg-emerald-500/10 border-emerald-500/25'
                        : 'bg-white/5 border-white/10'
                    )}
                  >
                    {isEligible ? (
                      <>
                        <span className="text-emerald-300 text-xs font-black">Eligibility Unlocked!</span>
                        <span className="text-white/70 text-xs">
                          You&apos;re qualified for monthly rewards.
                        </span>
                      </>
                    ) : (
                      <span className="text-white/70 text-xs">
                        Earn {MIN_REWARD_ELIGIBILITY_POINTS.toLocaleString()} points to unlock rewards (gifts earn
                        points).
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center sm:items-end shrink-0">
                  <div
                    className={cn(
                      'relative w-28 h-28 rounded-2xl flex items-center justify-center border-2',
                      tierMeta?.id === 'diamond'
                        ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-500/20 to-violet-600/30'
                        : tierMeta?.id === 'platinum'
                          ? 'border-sky-400/50 bg-gradient-to-br from-sky-500/15 to-indigo-900/40'
                          : tierMeta?.id === 'gold'
                            ? 'border-amber-400/60 bg-gradient-to-br from-amber-500/25 to-yellow-900/30'
                            : tierMeta?.id === 'silver'
                              ? 'border-slate-300/40 bg-gradient-to-br from-slate-400/20 to-zinc-900/40'
                              : tierMeta
                                ? 'border-amber-700/50 bg-gradient-to-br from-amber-900/40 to-black/50'
                                : 'border-white/15 bg-white/5'
                    )}
                  >
                    <Shield
                      className={cn(
                        'w-14 h-14',
                        tierMeta ? 'text-amber-300' : 'text-white/30'
                      )}
                      strokeWidth={1.25}
                    />
                    <Sparkles className="absolute top-2 right-2 w-4 h-4 text-yellow-300/80" />
                  </div>
                  <p className="text-lg font-black text-amber-300 mt-2 tracking-tight">
                    {tierProgress.currentTierLabel}
                  </p>
                  <span className="text-[10px] font-bold text-violet-300/90 bg-violet-500/20 border border-violet-500/30 rounded-full px-2 py-0.5 mt-1">
                    Tier level
                  </span>
                  {tierMeta && (
                    <p className="text-white/50 text-[11px] mt-2">
                      Multiplier <span className="text-white font-bold">{tierMeta.multiplier}x</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-white/10">
                <div className="flex items-center justify-between gap-2 text-xs mb-2">
                  <span className="text-white/60 font-bold">Progress to next level</span>
                  <span className="text-white/80 font-mono tabular-nums">{tierProgress.pointsInRange}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-white/45 mb-2">
                  <span>
                    {tierProgress.nextTierLabel
                      ? `Target: ${tierProgress.nextTierLabel}`
                      : 'Max tier reached'}
                  </span>
                  <span>{tierProgress.progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-3 w-full rounded-full bg-black/40 overflow-hidden border border-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 shadow-[0_0_12px_rgba(251,191,36,0.35)] transition-all duration-500"
                    style={{ width: `${Math.min(100, tierProgress.progressPercent)}%` }}
                  />
                </div>
                {tierProgress.nextTierLabel && tierProgress.pointsRemaining > 0 && (
                  <p className="text-[11px] text-white/45 mt-2">
                    {tierProgress.pointsRemaining.toLocaleString()} points until {tierProgress.nextTierLabel} · Keep
                    going! 🚀
                  </p>
                )}
              </div>
            </div>

            {/* Activity + Estimated */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div
                className="rounded-2xl border border-emerald-500/20 bg-[#0f1420]/90 backdrop-blur-xl p-5 flex flex-col sm:flex-row gap-5 items-center"
              >
                <div className="relative w-36 h-36 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                    <circle
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      stroke="url(#actGrad)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={dashOffset}
                      className="transition-all duration-700"
                    />
                    <defs>
                      <linearGradient id="actGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-white tabular-nums">
                      {Math.round(activityPct)}%
                    </span>
                    <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Activity</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 w-full">
                  <p className="text-white font-black text-sm mb-2">This month&apos;s activity</p>
                  {!hasActivity ? (
                    <p className="text-[13px] text-white/50 leading-relaxed">
                      No activity yet. Start watching, liking, commenting, and sharing — each action increases points
                      and fills your activity ring.
                    </p>
                  ) : (
                    <>
                      <ActivityRow
                        icon={<Sparkles size={14} />}
                        label={`Watch time (${monthlyActivity.watchCount})`}
                        value={monthlyActivity.watchPct}
                      />
                      <ActivityRow
                        icon={<Sparkles size={14} />}
                        label={`Likes (${monthlyActivity.likesCount})`}
                        value={monthlyActivity.likesPct}
                      />
                      <ActivityRow
                        icon={<Sparkles size={14} />}
                        label={`Comments (${monthlyActivity.commentsCount})`}
                        value={monthlyActivity.commentsPct}
                      />
                      <ActivityRow
                        icon={<Sparkles size={14} />}
                        label={`Shares (${monthlyActivity.sharesCount})`}
                        value={monthlyActivity.sharesPct}
                      />
                      <p className="text-[12px] text-white/45 leading-relaxed">
                        Activity updates from this month&apos;s tracked actions and contributes to rewards in real time.
                      </p>
                      {activityPct >= 70 && (
                        <p className="text-[11px] font-bold text-emerald-400/90 pt-1">High engagement! 🔥</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div
                className="rounded-2xl border border-amber-500/25 bg-gradient-to-b from-[#1a1525] to-[#0e0e1a] p-5 flex flex-col justify-between"
              >
                <div>
                  <p className="text-white/55 text-xs font-bold uppercase tracking-widest mb-2">Estimated reward</p>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-4xl font-black text-amber-300 tabular-nums">
                      {rewardCoins.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-200/90 text-sm font-bold">
                      <Coins size={16} className="text-amber-400" />
                      Coins
                    </span>
                  </div>
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white/55 font-mono leading-relaxed">
                    Formula: ⌊points ÷ 100⌋ = {rewardCoins} coins · activity{' '}
                    {Math.round(activityPct)}% (10k pts = 100% · 10k pts = 100 coins max)
                    {tierMeta ? ` · tier ×${displayMultiplier}` : ''}
                  </div>
                </div>
                <div className="mt-6 relative z-10">
                  <button
                    type="button"
                    onClick={() => void handleClaimReward()}
                    disabled={claiming || !isEligible}
                    title={
                      isEligible
                        ? 'Claim your monthly activity reward'
                        : `Earn ${MIN_REWARD_ELIGIBILITY_POINTS.toLocaleString()} points to unlock`
                    }
                    className={cn(
                      'relative z-10 w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black text-white transition-all pointer-events-auto',
                      'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 shadow-lg shadow-fuchsia-950/50',
                      'hover:opacity-95 active:scale-[0.99]',
                      isEligible && !claiming && 'cursor-pointer hover:brightness-110',
                      (!isEligible || claiming) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Gift size={18} className="shrink-0" />
                    {claiming ? 'Claiming…' : 'Claim Monthly Reward'}
                  </button>
                  <p className="text-[11px] text-center text-white/40 mt-2">{formatClaimAvailabilityNote()}</p>
                  {!isEligible && (
                    <p className="text-[11px] text-center text-amber-200/70 mt-1">
                      Earn {MIN_REWARD_ELIGIBILITY_POINTS.toLocaleString()} points to enable claim (gifts earn points).
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom encouragement */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-start gap-3">
              <Trophy className="text-amber-400/90 shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-white/70 leading-relaxed">
                {isEligible ? (
                  <>
                    Great job! You&apos;ve unlocked rewards
                    {tierMeta ? (
                      <>
                        {' '}
                        and reached <span className="text-amber-300 font-bold">{tierProgress.currentTierLabel}</span>{' '}
                        tier.
                      </>
                    ) : (
                      '.'
                    )}{' '}
                    More activity = more rewards. Keep supporting creators!
                  </>
                ) : (
                  <>
                    Reach <span className="text-white font-semibold">{MIN_REWARD_ELIGIBILITY_POINTS.toLocaleString()}</span>{' '}
                    points to unlock eligibility. Points come from sending gifts — stay engaged!
                  </>
                )}
              </p>
            </div>

            {!!reward.logs?.length && (
              <div>
                <p className="text-sm font-bold text-white/80 mb-2">Recent reward history</p>
                <div className="space-y-2">
                  {reward.logs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 text-sm flex items-center justify-between"
                    >
                      <span className="text-white/60">{new Date(log.created_at).toLocaleDateString()}</span>
                      <span className="font-bold text-emerald-300">{Number(log.reward_amount).toFixed(0)} coins</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function ActivityRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="text-white/55 flex items-center gap-2 min-w-0">
        <span className="text-emerald-400/90 shrink-0">{icon}</span>
        {label}
      </span>
      <span className="text-emerald-300 font-black tabular-nums">{Math.round(value)}%</span>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  ArrowLeft,
  TrendingUp,
  Users,
  Heart,
  MessageCircle,
  Share2,
  Eye,
  LayoutGrid,
  LineChart as LineChartIcon,
  Trophy,
} from 'lucide-react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiOrigin';
import { useAuth } from '../contexts/AuthContext';

function isNonGroupPost(p: { category?: string | null }): boolean {
  const cat = typeof p?.category === 'string' ? p.category.trim().toLowerCase() : '';
  return !cat.startsWith('group:');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** One view total per post (view_count, views, valid_views may overlap — take max). */
function postDisplayViews(row: Record<string, unknown>): number {
  return Math.max(num(row.view_count), num(row.views), num(row.valid_views));
}

const ANALYTICS_IN_CHUNK = 60;

async function countTableRowsByPostIds(
  table: 'likes' | 'comments',
  postIds: string[]
): Promise<{ count: number; ok: boolean }> {
  if (postIds.length === 0) return { count: 0, ok: true };
  let total = 0;
  for (let i = 0; i < postIds.length; i += ANALYTICS_IN_CHUNK) {
    const slice = postIds.slice(i, i + ANALYTICS_IN_CHUNK);
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in('post_id', slice);
    if (error) {
      console.warn(`[Analytics] ${table} count batch failed`, error);
      return { count: 0, ok: false };
    }
    total += num(count);
  }
  return { count: total, ok: true };
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function prevMonthBounds(ref: Date): { start: Date; end: Date } {
  const start = startOfMonth(new Date(ref.getFullYear(), ref.getMonth() - 1, 1));
  const end = endOfMonth(new Date(ref.getFullYear(), ref.getMonth() - 1, 1));
  return { start, end };
}

function inRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

/** Local calendar date YYYY-MM-DD for grouping chart points. */
function toLocalDateKey(iso: unknown): string | null {
  if (iso == null) return null;
  const d = new Date(String(iso));
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sum views per day from posts (does not alter analytics aggregates). */
function buildViewsByDayFromPosts(posts: unknown[]): { date: string; views: number }[] {
  const bucket = new Map<string, number>();
  for (const p of posts) {
    const row = p as Record<string, unknown>;
    const key = toLocalDateKey(row.created_at);
    if (!key) continue;
    const v = postDisplayViews(row);
    bucket.set(key, (bucket.get(key) ?? 0) + v);
  }
  return Array.from(bucket.entries())
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const VIRAL_VIEWS_MIN = 1000;
const VIRAL_WINDOW_MS = 48 * 60 * 60 * 1000;

type ViralPostRow = {
  id: string;
  imageUrl: string | null;
  views: number;
};

/** Top 3 posts by views: viral = views threshold + created in last 48h (same `posts` as analytics). */
function pickViralPosts(posts: unknown[], now: Date): ViralPostRow[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];

  const rows: ViralPostRow[] = [];
  for (const p of posts) {
    const row = p as Record<string, unknown>;
    const views = postDisplayViews(row);
    if (views < VIRAL_VIEWS_MIN) continue;

    const createdRaw = row.created_at;
    if (createdRaw == null) continue;
    const createdMs = new Date(String(createdRaw)).getTime();
    if (!Number.isFinite(createdMs)) continue;
    if (createdMs > nowMs) continue;
    if (nowMs - createdMs > VIRAL_WINDOW_MS) continue;

    const id = String(row.id ?? '').trim();
    if (!id) continue;

    const rawImg = row.image_url;
    const imageUrl =
      typeof rawImg === 'string' && rawImg.trim().length > 0 ? rawImg.trim() : null;

    rows.push({ id, imageUrl, views });
  }

  return rows.sort((a, b) => b.views - a.views).slice(0, 3);
}

function formatHourApprox(hour24: number): string {
  if (hour24 < 0 || hour24 > 23 || !Number.isFinite(hour24)) return `${hour24}:00`;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12}:00 ${period}`;
}

function isVideoPostRow(row: Record<string, unknown>): boolean {
  const t = String(row.type ?? '').trim().toLowerCase();
  if (t === 'video') return true;
  const vu = String(row.video_url ?? '').trim();
  if (vu.length > 0) return true;
  const cat = String(row.category ?? '').trim().toLowerCase();
  if (cat === 'reel') return true;
  return false;
}

function isImagePostRow(row: Record<string, unknown>): boolean {
  if (isVideoPostRow(row)) return false;
  const iu = String(row.image_url ?? '').trim();
  return iu.length > 0;
}

/** Pure insights from posts + viral count (no API). */
function buildAiInsights(posts: unknown[], viralCount: number): string[] {
  if (!posts.length) {
    return ['Start posting to see insights'];
  }

  const insights: string[] = [];

  const hourBuckets = new Map<number, { sum: number; n: number }>();
  for (const p of posts) {
    const row = p as Record<string, unknown>;
    const created = row.created_at;
    if (created == null) continue;
    const d = new Date(String(created));
    if (!Number.isFinite(d.getTime())) continue;
    const h = d.getHours();
    const v = postDisplayViews(row);
    const cur = hourBuckets.get(h) ?? { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    hourBuckets.set(h, cur);
  }

  let bestHour: number | null = null;
  let bestAvg = -1;
  for (const [h, { sum, n }] of hourBuckets) {
    if (n <= 0) continue;
    const avg = sum / n;
    if (
      bestHour === null ||
      avg > bestAvg ||
      (avg === bestAvg && bestHour !== null && h < bestHour)
    ) {
      bestAvg = avg;
      bestHour = h;
    }
  }
  if (bestHour !== null && hourBuckets.size > 0) {
    insights.push(`Your best posting time is around ${formatHourApprox(bestHour)}`);
  }

  let videoSum = 0;
  let videoN = 0;
  let imageSum = 0;
  let imageN = 0;
  for (const p of posts) {
    const row = p as Record<string, unknown>;
    const v = postDisplayViews(row);
    if (isVideoPostRow(row)) {
      videoSum += v;
      videoN += 1;
    } else if (isImagePostRow(row)) {
      imageSum += v;
      imageN += 1;
    }
  }
  if (videoN > 0 && imageN > 0) {
    const avgV = videoSum / videoN;
    const avgI = imageSum / imageN;
    if (avgV > avgI) {
      insights.push('Videos perform better than images');
    } else {
      insights.push('Images perform better than videos');
    }
  }

  if (viralCount > 0) {
    insights.push('You have trending posts driving engagement');
  }

  if (insights.length === 0) {
    insights.push('Keep posting consistently to grow your reach');
  }

  return insights;
}

const TX_CREDIT_TYPES = new Set([
  'credit',
  'earn',
  'receive',
  'game_win',
  'gift',
  'support',
  'deposit',
  'refund',
]);
const TX_DEBIT_TYPES = new Set([
  'debit',
  'send',
  'withdraw',
  'game_loss',
  'game_start',
  'purchase',
  'fee',
  'spend',
]);

/** Sum earned vs spent from local API transaction rows (null-safe). */
function aggregateWalletTransactions(rows: unknown[]): { earned: number; spent: number } {
  let earned = 0;
  let spent = 0;
  for (const item of rows) {
    const tx = item as Record<string, unknown>;
    const type = String(tx?.type ?? '').toLowerCase().trim();
    const rawAmt = Number(tx?.amount);
    const amt = Number.isFinite(rawAmt) ? Math.abs(rawAmt) : 0;
    if (TX_CREDIT_TYPES.has(type)) {
      earned += amt;
    } else if (TX_DEBIT_TYPES.has(type)) {
      spent += amt;
    } else if (rawAmt > 0) {
      earned += amt;
    } else if (rawAmt < 0) {
      spent += Math.abs(rawAmt);
    }
  }
  return { earned, spent };
}

type AnalyticsStats = {
  totalPosts: number;
  totalViews: number;
  engagementRate: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
  postsTrend: string;
  viewsTrend: string;
};

const EMPTY_STATS: AnalyticsStats = {
  totalPosts: 0,
  totalViews: 0,
  engagementRate: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  followers: 0,
  postsTrend: '0 this month',
  viewsTrend: 'No views yet',
};

type TopPostSummary = {
  id: string;
  imageUrl: string | null;
  views: number;
  likes: number;
};

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AnalyticsStats>(EMPTY_STATS);
  const [topPost, setTopPost] = useState<TopPostSummary | null>(null);
  const [followersThisWeek, setFollowersThisWeek] = useState(0);
  const [viewsTimeSeries, setViewsTimeSeries] = useState<{ date: string; views: number }[]>([]);
  const [viralPosts, setViralPosts] = useState<ViralPostRow[]>([]);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [coinsActivity, setCoinsActivity] = useState<{
    loading: boolean;
    earned: number;
    spent: number;
  }>({ loading: true, earned: 0, spent: 0 });

  const coinBalance = num(profile?.coins);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setCoinsActivity({ loading: false, earned: 0, spent: 0 });
      return;
    }
    setCoinsActivity((p) => ({ ...p, loading: true }));
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/transactions/${encodeURIComponent(user.id)}`));
        const raw = await res.json().catch(() => null);
        if (cancelled) return;
        const rows = Array.isArray(raw) ? raw : [];
        const { earned, spent } = aggregateWalletTransactions(rows);
        setCoinsActivity({ loading: false, earned, spent });
      } catch {
        if (!cancelled) {
          setCoinsActivity({ loading: false, earned: 0, spent: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setStats(EMPTY_STATS);
          setTopPost(null);
          setFollowersThisWeek(0);
          setViewsTimeSeries([]);
          setViralPosts([]);
          setAiInsights([]);
          setLoading(false);
        }
        return;
      }

      const uid = String(user.id).trim().toLowerCase();
      if (!uid) {
        if (!cancelled) {
          setStats(EMPTY_STATS);
          setTopPost(null);
          setFollowersThisWeek(0);
          setViewsTimeSeries([]);
          setViralPosts([]);
          setAiInsights([]);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(true);

      try {
        let rows: unknown[] = [];

        const { data: directRows, error: directErr } = await supabase
          .from('posts')
          .select('*')
          .eq('user_id', uid);

        if (directErr) {
          console.warn('[Analytics] posts select:', directErr);
          if (isSupabaseConfigured) {
            try {
              const res = await fetch(apiUrl('/api/posts'));
              const all = await res.json().catch(() => null);
              if (Array.isArray(all)) {
                rows = all.filter((p: Record<string, unknown>) => {
                  const pid = String(p.user_id ?? '').trim().toLowerCase();
                  return pid === uid && isNonGroupPost(p);
                });
              }
            } catch (apiErr) {
              console.warn('[Analytics] /api/posts fallback failed', apiErr);
            }
          }
          if (rows.length === 0) {
            if (!cancelled) {
              setStats(EMPTY_STATS);
              setTopPost(null);
              setFollowersThisWeek(0);
              setViewsTimeSeries([]);
              setViralPosts([]);
              setAiInsights([]);
              setLoading(false);
            }
            return;
          }
        } else {
          rows = Array.isArray(directRows) ? directRows : [];
        }

        const posts = rows.filter(isNonGroupPost);
        const viewsByDay = buildViewsByDayFromPosts(posts);
        const postIds = posts.map((p: { id?: string }) => p?.id).filter(Boolean) as string[];

        const safeSharesCol = (p: Record<string, unknown>) =>
          num(p.shares_count ?? p.share_count ?? p.shares);

        const totalPosts = posts.length;
        const totalViews = posts.reduce(
          (s, p) => s + postDisplayViews(p as Record<string, unknown>),
          0
        );
        const sharesFromPosts = posts.reduce((s, p) => s + safeSharesCol(p as Record<string, unknown>), 0);

        const now = new Date();
        const viralTop = pickViralPosts(posts, now);
        const curStart = startOfMonth(now);
        const curEnd = endOfMonth(now);
        const { start: prevStart, end: prevEnd } = prevMonthBounds(now);

        const postsThisMonth = posts.filter((p: { created_at?: string }) =>
          inRange(p.created_at, curStart, curEnd)
        ).length;
        const postsLastMonth = posts.filter((p: { created_at?: string }) =>
          inRange(p.created_at, prevStart, prevEnd)
        ).length;

        const viewsThisMonth = posts
          .filter((p: { created_at?: string }) => inRange(p.created_at, curStart, curEnd))
          .reduce((s, p) => s + postDisplayViews(p as Record<string, unknown>), 0);
        const viewsLastMonth = posts
          .filter((p: { created_at?: string }) => inRange(p.created_at, prevStart, prevEnd))
          .reduce((s, p) => s + postDisplayViews(p as Record<string, unknown>), 0);

        const [likesCounted, commentsCounted, followersRes, profileRow] = await Promise.all([
          postIds.length > 0 ? countTableRowsByPostIds('likes', postIds) : Promise.resolve({ count: 0, ok: true }),
          postIds.length > 0 ? countTableRowsByPostIds('comments', postIds) : Promise.resolve({ count: 0, ok: true }),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
          supabase.from('profiles').select('followers_count').eq('id', uid).maybeSingle(),
        ]);

        const likesFromPosts = posts.reduce(
          (s, p) => s + num((p as Record<string, unknown>).likes_count),
          0
        );
        const commentsFromPosts = posts.reduce(
          (s, p) => s + num((p as Record<string, unknown>).comments_count),
          0
        );

        const likes = likesCounted.ok
          ? Math.max(likesCounted.count, likesFromPosts)
          : likesFromPosts;
        const comments = commentsCounted.ok
          ? Math.max(commentsCounted.count, commentsFromPosts)
          : commentsFromPosts;
        const followersFromFollows = followersRes.error ? 0 : num(followersRes.count);
        const followersFromProfile = num(
          (profileRow.data as { followers_count?: unknown } | null)?.followers_count
        );
        const followers = Math.max(followersFromFollows, followersFromProfile);

        let top: TopPostSummary | null = null;
        if (posts.length > 0) {
          let bestRow: Record<string, unknown> | null = null;
          let bestViews = -1;
          for (const p of posts) {
            const row = p as Record<string, unknown>;
            const v = postDisplayViews(row);
            if (v > bestViews) {
              bestViews = v;
              bestRow = row;
            }
          }
          if (bestRow) {
            const id = String(bestRow.id ?? '').trim();
            if (id) {
              const rawImg = bestRow.image_url;
              const imageUrl =
                typeof rawImg === 'string' && rawImg.trim().length > 0 ? rawImg.trim() : null;
              top = {
                id,
                imageUrl,
                views: Math.max(0, bestViews),
                likes: num(bestRow.likes_count),
              };
            }
          }
        }

        let newFollowersThisWeek = 0;
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        const weekIso = weekAgo.toISOString();
        const { count: weekCount, error: weekFollowErr } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', uid)
          .gte('created_at', weekIso);
        if (!weekFollowErr && weekCount != null) {
          newFollowersThisWeek = num(weekCount);
        }

        const sharesTotal = sharesFromPosts;

        const engagementNumerator = likes + comments + sharesTotal;
        const engagementRate =
          totalViews > 0
            ? Math.min(999.9, Math.round((engagementNumerator / totalViews) * 1000) / 10)
            : 0;

        const postsTrend = `${postsThisMonth} this month`;

        let viewsTrend = 'No views yet';
        if (viewsLastMonth > 0) {
          const pct = Math.round(((viewsThisMonth - viewsLastMonth) / viewsLastMonth) * 100);
          viewsTrend = `${pct >= 0 ? '+' : ''}${pct}% vs last month`;
        } else if (viewsThisMonth > 0) {
          viewsTrend = 'New activity this month';
        } else if (totalViews > 0) {
          viewsTrend = 'All-time on your posts';
        }

        const next: AnalyticsStats = {
          totalPosts,
          totalViews,
          engagementRate,
          likes,
          comments,
          shares: sharesTotal,
          followers,
          postsTrend,
          viewsTrend,
        };

        console.log('[Analytics] stats', next);

        const insightsList = buildAiInsights(posts, viralTop.length);

        if (!cancelled) {
          setStats(next);
          setTopPost(top);
          setFollowersThisWeek(newFollowersThisWeek);
          setViewsTimeSeries(viewsByDay);
          setViralPosts(viralTop);
          setAiInsights(insightsList);
        }
      } catch (e) {
        console.warn('[Analytics] load failed', e);
        if (!cancelled) {
          setStats(EMPTY_STATS);
          setTopPost(null);
          setFollowersThisWeek(0);
          setViewsTimeSeries([]);
          setViralPosts([]);
          setAiInsights([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const engagementTrend =
    stats.engagementRate >= 5
      ? 'Above average'
      : stats.totalPosts > 0
        ? 'Keep growing'
        : 'Post to start tracking';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl mx-auto p-4 md:p-8 pb-24"
    >
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">Posts & Views Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          icon={<LayoutGrid className="text-indigo-500" />} 
          label="Total Posts" 
          value={loading ? '—' : stats.totalPosts} 
          trend={loading ? '…' : stats.postsTrend}
          color="indigo"
        />
        <StatCard 
          icon={<Eye className="text-emerald-500" />} 
          label="Total Views" 
          value={loading ? '—' : stats.totalViews} 
          trend={loading ? '…' : stats.viewsTrend}
          color="emerald"
        />
        <StatCard 
          icon={<TrendingUp className="text-purple-500" />} 
          label="Engagement Rate" 
          value={loading ? '—' : `${stats.engagementRate}%`} 
          trend={loading ? '…' : engagementTrend}
          color="purple"
        />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-8 mb-8">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <BarChart3 size={20} className="text-indigo-500" />
          Engagement Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <EngagementStat icon={<Heart className="text-red-500" />} label="Likes" value={loading ? '—' : stats.likes} />
          <EngagementStat icon={<MessageCircle className="text-blue-500" />} label="Comments" value={loading ? '—' : stats.comments} />
          <EngagementStat icon={<Share2 className="text-indigo-500" />} label="Shares" value={loading ? '—' : stats.shares} />
          <EngagementStat icon={<Users className="text-purple-500" />} label="Followers" value={loading ? '—' : stats.followers} />
        </div>
      </div>

      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 mb-8">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <LineChartIcon size={20} className="text-indigo-500" />
          Views Over Time
        </h3>
        <ViewsOverTimeChart loading={loading} data={viewsTimeSeries} />
      </div>

      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 mb-8">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <Trophy size={20} className="text-indigo-500" />
          Top Performing Post
        </h3>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">…</p>
        ) : !topPost ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No posts yet</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              const id = String(topPost.id ?? '').trim();
              if (!id) return;
              navigate(`/post/${encodeURIComponent(id)}`);
            }}
            className="w-full flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          >
            <div className="w-full sm:w-28 aspect-square sm:aspect-auto sm:h-28 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 flex items-center justify-center">
              {topPost.imageUrl ? (
                <img
                  src={topPost.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xs text-gray-400 font-medium px-2 text-center">No image</span>
              )}
            </div>
            <div className="flex flex-1 flex-wrap gap-6 sm:gap-10">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Views</p>
                <p className="text-xl font-black text-gray-900 dark:text-white">
                  {topPost.views >= 1000 ? `${(topPost.views / 1000).toFixed(1)}K` : topPost.views}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Likes</p>
                <p className="text-xl font-black text-gray-900 dark:text-white">
                  {topPost.likes >= 1000 ? `${(topPost.likes / 1000).toFixed(1)}K` : topPost.likes}
                </p>
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 mb-8">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Users size={20} className="text-indigo-500" />
          Followers Growth
        </h3>
        <p className="text-2xl font-black text-gray-900 dark:text-white">
          {loading ? '—' : `+${followersThisWeek} this week`}
        </p>
      </div>

      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 mb-8">
        <h3 className="font-bold text-lg mb-4 sm:mb-6">🔥 Viral Posts</h3>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">…</p>
        ) : viralPosts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No viral posts yet</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {viralPosts.map((vp) => (
              <li
                key={vp.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 sm:p-4"
              >
                <div className="w-full sm:w-20 md:w-24 aspect-square sm:aspect-auto sm:h-20 md:h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 flex items-center justify-center mx-auto sm:mx-0">
                  {vp.imageUrl ? (
                    <img
                      src={vp.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400 font-medium px-1 text-center">No image</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
                  <div className="min-w-0 text-center sm:text-left">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      Views
                    </p>
                    <p className="text-lg sm:text-xl font-black text-gray-900 dark:text-white tabular-nums">
                      {vp.views >= 1000 ? `${(vp.views / 1000).toFixed(1)}K` : vp.views}
                    </p>
                  </div>
                  <span className="self-center sm:self-auto inline-flex items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider border border-orange-200/60 dark:border-orange-800/50">
                    Trending
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 mb-8">
        <h3 className="font-bold text-lg mb-4 sm:mb-6">🧠 AI Insights</h3>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">…</p>
        ) : aiInsights.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Start posting to see insights</p>
        ) : (
          <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
            {aiInsights.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`} className="flex gap-2">
                <span className="text-indigo-500 dark:text-indigo-400 shrink-0" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 sm:p-8 mb-8">
        <h3 className="font-bold text-lg mb-4 sm:mb-6">💰 Coins &amp; Earnings</h3>
        <dl className="space-y-4 text-sm sm:text-base text-gray-700 dark:text-gray-200">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <dt className="text-gray-500 dark:text-gray-400 font-medium">Coins Balance</dt>
            <dd className="font-black tabular-nums text-lg text-gray-900 dark:text-white">
              {coinBalance.toLocaleString()}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <dt className="text-gray-500 dark:text-gray-400 font-medium">Earned</dt>
            <dd className="font-black tabular-nums text-lg text-emerald-600 dark:text-emerald-400">
              {coinsActivity.loading ? '…' : `+${coinsActivity.earned.toLocaleString()}`}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <dt className="text-gray-500 dark:text-gray-400 font-medium">Spent</dt>
            <dd className="font-black tabular-nums text-lg text-rose-600 dark:text-rose-400">
              {coinsActivity.loading ? '…' : `-${coinsActivity.spent.toLocaleString()}`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="bg-gradient-to-tr from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="text-xl font-bold mb-2">Grow your audience faster!</h4>
            <p className="text-indigo-100 text-sm opacity-80">Check out our creator tips to boost your engagement and reach more viewers.</p>
          </div>
          <button 
            onClick={() => navigate('/creator-tips')}
            className="bg-white text-indigo-600 px-8 py-3 rounded-2xl font-black hover:bg-indigo-50 transition-colors whitespace-nowrap"
          >
            View Creator Tips
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ViewsOverTimeChart({
  loading,
  data,
}: {
  loading: boolean;
  data: { date: string; views: number }[];
}) {
  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">…</p>;
  }
  if (!data.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No data yet</p>;
  }

  return (
    <div className="w-full h-[220px] min-h-[200px] sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.35)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'currentColor' }}
            stroke="rgb(148 163 184 / 0.8)"
            tickFormatter={(v) => {
              try {
                const d = new Date(String(v) + 'T12:00:00');
                if (!Number.isFinite(d.getTime())) return String(v);
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              } catch {
                return String(v);
              }
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'currentColor' }}
            stroke="rgb(148 163 184 / 0.8)"
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid rgb(229 231 235)',
              fontSize: 12,
            }}
            labelFormatter={(v) => String(v)}
            formatter={(value: number | string) => [value, 'Views']}
          />
          <Line
            type="monotone"
            dataKey="views"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3, fill: '#6366f1' }}
            activeDot={{ r: 5 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCard({ icon, label, value, trend, color }: { icon: React.ReactNode; label: string; value: string | number; trend: string; color: string }) {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  }[color as keyof typeof colorClasses];

  const displayMain =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isFinite(value)
        ? value >= 1000
          ? `${(value / 1000).toFixed(1)}K`
          : String(value)
        : '0';

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl hover:shadow-lg transition-shadow">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4", colorClasses)}>
        {icon}
      </div>
      <p className="text-gray-500 text-sm font-medium mb-1">{label}</p>
      <h4 className="text-3xl font-black mb-2">
        {displayMain}
      </h4>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{trend}</p>
    </div>
  );
}

function EngagementStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  const display =
    typeof value === 'string'
      ? value
      : value >= 1000
        ? `${(value / 1000).toFixed(1)}K`
        : String(value);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-10 h-10 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center mb-3">
        {icon}
      </div>
      <h5 className="font-black text-lg">
        {display}
      </h5>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

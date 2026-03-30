import { getEngagementScore } from './postViews';
import { supabase, isSupabaseConfigured } from './supabase';

const LS_WATCH = 'watchTimeMap';
const LS_INTEREST = 'userInterest';

const DEBOUNCE_DB_MS = 13000;
let debounceDbTimer: ReturnType<typeof setTimeout> | null = null;

/** Aggregated boost weight per post (sum of boost_amount from post_boosts). */
const boostMap = new Map<string, number>();

export function addBoostAmount(postId: string, amount: number): void {
  const id = String(postId);
  const add = Math.max(0, Number(amount) || 0);
  if (add <= 0) return;
  boostMap.set(id, (boostMap.get(id) || 0) + add);
}

export async function refreshPostBoostsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { data, error } = await supabase.from('post_boosts').select('post_id, boost_amount');
    if (error || !Array.isArray(data)) return;
    boostMap.clear();
    for (const row of data) {
      const pid = String((row as { post_id: unknown }).post_id);
      const amt = Number((row as { boost_amount: unknown }).boost_amount) || 0;
      boostMap.set(pid, (boostMap.get(pid) || 0) + amt);
    }
  } catch {
    /* missing table / network */
  }
}

/**
 * Debounced save to Supabase (10–15s quiet period after last local persist).
 * Does not replace localStorage; flush uses current module state when the timer fires.
 */
export function debounceSaveToDB(
  userId: string | null | undefined,
  _watchMap: Map<string, number>,
  _interest: { video: number; image: number; reel: number }
): void {
  if (!userId || typeof window === 'undefined' || !isSupabaseConfigured) return;
  if (debounceDbTimer != null) clearTimeout(debounceDbTimer);
  debounceDbTimer = window.setTimeout(() => {
    debounceDbTimer = null;
    void flushPersonalizationToSupabaseForUser(userId);
  }, DEBOUNCE_DB_MS);
}

async function flushPersonalizationToSupabaseForUser(expectedUserId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id || user.id !== expectedUserId) return;
    const watch_time = Object.fromEntries(watchTimeMap);
    await supabase.from('user_personalization').upsert(
      {
        user_id: user.id,
        watch_time,
        interest: { ...userInterest },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {
    /* network / RLS / missing table */
  }
}

function scheduleDebouncedDbSave(): void {
  if (typeof window === 'undefined' || !isSupabaseConfigured) return;
  void supabase.auth.getUser().then(({ data: { user } }) => {
    if (user?.id) debounceSaveToDB(user.id, watchTimeMap, userInterest);
  });
}

/** Cumulative seconds watched per post (session memory, frontend only). */
const watchTimeMap = new Map<string, number>();

/** Lightweight preference counts for video vs image vs reel category. */
export const userInterest = { video: 0, image: 0, reel: 0 };

function persistWatchTimeMap(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_WATCH, JSON.stringify(Array.from(watchTimeMap.entries())));
  } catch {
    /* quota / private mode */
  }
}

function persistUserInterest(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_INTEREST, JSON.stringify(userInterest));
  } catch {
    /* quota / private mode */
  }
}

/** Restore maps from localStorage (browser only). */
export function loadPersonalizationFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const savedWatch = localStorage.getItem(LS_WATCH);
    if (savedWatch) {
      const entries = JSON.parse(savedWatch) as unknown;
      if (Array.isArray(entries)) {
        entries.forEach((pair: unknown) => {
          if (Array.isArray(pair) && pair.length >= 2) {
            const k = String(pair[0]);
            const v = Number(pair[1]);
            if (Number.isFinite(v)) watchTimeMap.set(k, Math.max(0, v));
          }
        });
      }
    }
  } catch {
    /* invalid JSON */
  }
  try {
    const savedInterest = localStorage.getItem(LS_INTEREST);
    if (savedInterest) {
      const parsed = JSON.parse(savedInterest) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        Object.assign(userInterest, {
          video: Number(parsed.video) || 0,
          image: Number(parsed.image) || 0,
          reel: Number(parsed.reel) || 0,
        });
      }
    }
  } catch {
    /* invalid JSON */
  }
}

export function trackWatchTime(postId: string, seconds: number): void {
  const id = String(postId);
  const add = Math.max(0, Number(seconds) || 0);
  if (add <= 0) return;
  const prev = watchTimeMap.get(id) || 0;
  watchTimeMap.set(id, prev + add);
  persistWatchTimeMap();
  scheduleDebouncedDbSave();
}

export function updateInterest(post: {
  video_url?: unknown;
  image_url?: unknown;
  category?: unknown;
} | null | undefined): void {
  if (post == null || typeof post !== 'object') return;
  const hasVideo = post.video_url != null && String(post.video_url).trim().length > 0;
  if (hasVideo) userInterest.video += 1;
  else userInterest.image += 1;
  const cat = typeof post.category === 'string' ? post.category.trim().toLowerCase() : '';
  if (cat === 'reel') userInterest.reel += 1;
  persistUserInterest();
  scheduleDebouncedDbSave();
}

/** Engagement + local watch time + light interest bias + boost weight (no API change to base engagement). */
export function getPersonalizedScore(
  post: {
    id?: unknown;
    view_count?: unknown;
    views?: unknown;
    likes_count?: unknown;
    comments_count?: unknown;
    isViral?: boolean;
    video_url?: unknown;
  } | null | undefined
): number {
  const base = getEngagementScore(post);
  const id = post != null && post.id != null ? String(post.id) : '';
  const watchTime = id ? watchTimeMap.get(id) || 0 : 0;
  let interestBoost = 0;
  const hasVideo = post != null && post.video_url != null && String(post.video_url).trim().length > 0;
  if (hasVideo && userInterest.video > userInterest.image) {
    interestBoost = 20;
  }
  const boost = id ? boostMap.get(id) || 0 : 0;
  return base + watchTime * 2 + interestBoost + boost;
}

/**
 * Load personalization from Supabase when the user is logged in.
 * If the row is missing or both payloads are empty, keeps data already restored from localStorage.
 */
export async function loadPersonalizationFromSupabase(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;
  try {
    const { data, error } = await supabase
      .from('user_personalization')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return;
    if (!data) return;

    const wt = data.watch_time as Record<string, unknown> | null | undefined;
    const hasWatch =
      wt != null &&
      typeof wt === 'object' &&
      !Array.isArray(wt) &&
      Object.keys(wt as Record<string, unknown>).length > 0;

    const intr = data.interest as Record<string, unknown> | null | undefined;
    let interestSum = 0;
    if (intr != null && typeof intr === 'object' && !Array.isArray(intr)) {
      interestSum =
        (Number(intr.video) || 0) + (Number(intr.image) || 0) + (Number(intr.reel) || 0);
    }
    const hasInterest = interestSum > 0;

    if (!hasWatch && !hasInterest) return;

    if (hasWatch && wt != null && typeof wt === 'object' && !Array.isArray(wt)) {
      watchTimeMap.clear();
      for (const [k, v] of Object.entries(wt)) {
        const n = Number(v);
        if (Number.isFinite(n)) watchTimeMap.set(k, Math.max(0, n));
      }
    }
    if (hasInterest && intr != null && typeof intr === 'object' && !Array.isArray(intr)) {
      Object.assign(userInterest, {
        video: Number(intr.video) || 0,
        image: Number(intr.image) || 0,
        reel: Number(intr.reel) || 0,
      });
    }

    persistWatchTimeMap();
    persistUserInterest();
  } catch {
    /* missing table / network */
  }
}

loadPersonalizationFromStorage();
void refreshPostBoostsFromSupabase();

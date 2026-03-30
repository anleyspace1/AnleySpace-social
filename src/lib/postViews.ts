/** Normalize post/reel view totals whether the row uses `view_count` or `views`. */
export function getViews(post: { view_count?: unknown; views?: unknown } | null | undefined): number {
  if (post == null || typeof post !== 'object') return 0;
  const n = Number((post as { view_count?: unknown; views?: unknown }).view_count ?? (post as { views?: unknown }).views ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Hours since `created_at` for velocity math; minimum 1 to avoid division by zero. */
export function getHoursSince(dateString: string | null | undefined): number {
  const created = new Date(dateString ?? '').getTime();
  const now = Date.now();
  const diffMs = now - created;
  if (!Number.isFinite(created) || !Number.isFinite(diffMs)) return 1;
  return Math.max(1, diffMs / (1000 * 60 * 60));
}

/** Views per hour — higher = faster growth (tune threshold in UI layer). */
export function getViralScore(
  post: { view_count?: unknown; views?: unknown; created_at?: string | null } | null | undefined
): number {
  const views = getViews(post);
  const hours = getHoursSince(post?.created_at ?? undefined);
  // Only “fresh” posts can score; old high-view posts won’t dominate the feed.
  if (hours > 48) return 0;
  return views / hours;
}

/** “For you” style ranking: views + likes + comments + viral boost. */
export function getEngagementScore(
  post: {
    view_count?: unknown;
    views?: unknown;
    likes_count?: unknown;
    comments_count?: unknown;
    isViral?: boolean;
  } | null | undefined
): number {
  const views = getViews(post);
  const likes = Number((post as { likes_count?: unknown }).likes_count ?? 0);
  const comments = Number((post as { comments_count?: unknown }).comments_count ?? 0);
  const lk = Number.isFinite(likes) ? likes : 0;
  const cm = Number.isFinite(comments) ? comments : 0;
  return views * 0.5 + lk * 2 + cm * 3 + (post && (post as { isViral?: boolean }).isViral ? 100 : 0);
}

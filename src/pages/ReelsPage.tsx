import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  Coins, 
  Gift,
  Music, 
  Plus,
  X,
  Video as VideoIcon,
  Home,
  PlaySquare,
  Search,
  Menu,
  Bell,
  Compass,
  User,
  Camera,
  ChevronRight,
  BadgeCheck,
  Send,
  Image as ImageIcon,
  ShoppingBag,
  MoreHorizontal,
  MapPin,
  Circle,
  Square,
  RefreshCw,
  Type,
  Sparkles,
  Scissors,
  Lock,
} from 'lucide-react';
import { MOCK_SOUNDS } from '../constants';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { apiUrl, fetchFeedApiSafe } from '../lib/apiOrigin';
import { notifyLikeCommentFollowDm } from '../lib/supabaseNotifications';
import { useAuth } from '../contexts/AuthContext';
import { Video } from '../types';
import ShareModal from '../components/ShareModal';
import { MonetizationTipPicker } from '../components/MonetizationTipPicker';
import { TipSuccessOverlay, type TipSuccessFlash } from '../components/TipSuccessOverlay';
import StoryEditor from '../components/StoryEditor';
import { ResponsiveImage } from '../components/ResponsiveImage';
import { isValidVideoUrl } from '../lib/videoUrl';
import { isPlaceholderUsername } from '../lib/realDataGuards';
import { getViews, getViralScore } from '../lib/postViews';
import { getPersonalizedScore, trackWatchTime, updateInterest } from '../lib/personalizedRanking';
import { maybeRewardViralPost } from '../lib/viralRewards';
import { startCreatorValidViewWatch, stopCreatorValidViewWatch } from '../lib/creatorValidViews';
import { trackMonetizationDebugBehavior, trackUserBehavior } from '../lib/userBehavior';
import {
  fetchMonetizationPost,
  isMonetizationDebugEnabled,
  mergeMonetizationPostStatus,
  sendMonetizationGift,
  type MonetizationPostStatus,
} from '../lib/monetization';
import { MONETIZATION_TIP_AMOUNTS } from '../lib/monetizationTipUi';
import {
  isMonetizationUnlockedForTips,
  isPostBoostedForTips,
  normalizePostRowIsFeatured,
} from '../lib/monetizationFeaturedUi';
import { subscribePostMonetization } from '../lib/monetizationRealtime';
import { hasRecordedViewThisSession, markPostViewRecordedSession } from '../lib/postViewTracking';
import { ReelsFeedSkeleton } from '../components/LoadingSkeletons';
import {
  feedStoragePath,
  resolveStorageExtension,
  storageUploadContentType,
} from '../lib/storageUpload';
import { fetchCommentsWithProfiles, resolveProfileUsername } from '../lib/postComments';
import { AdCard } from '../components/AdCard';
import { getActiveAds, type ActiveAdRow } from '../lib/activeAds';

/** Views per hour above this = show “Viral” badge and sort higher. */
const VIRAL_THRESHOLD = 50;
/** Minimum total views before a post can be marked viral. */
const MIN_VIEWS = 100;

/** Home → Reels: feed row id can differ from reel row id; keep `is_featured` from the tapped card when URL or id matches. */
function mergeFeaturedFromHomeSelectedPost(
  list: any[],
  selectedPost: any | null,
  targetId: string | null,
  normalizeUrl: (u: string) => string
): any[] {
  if (!selectedPost || !targetId) return list;
  const selUrl = normalizeUrl(String(selectedPost.video_url || selectedPost.url || '').trim());
  return list.map((v) => {
    if (String(v.id) !== String(targetId)) return v;
    const vUrl = normalizeUrl(String(v.url || v.videoUrl || '').trim());
    const sameId = String(selectedPost.id) === String(v.id);
    const sameUrl = selUrl && vUrl && selUrl === vUrl;
    if (!sameId && !sameUrl) return v;
    const mergedFeatured =
      normalizePostRowIsFeatured(selectedPost) || normalizePostRowIsFeatured(v);
    return { ...v, is_featured: mergedFeatured };
  });
}

export default function ReelsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const { user } = useAuth();
  const navState = location.state as any;
  const selectedVideoUrl: string | undefined = navState?.videoUrl;
  const selectedPost: any | null = navState?.selectedPost ?? null;
  /** Home feed post id when it differs from the reel row id (same video URL). Used for monetization API merge in VideoPost. */
  const homeNavPostId =
    navState?.postId != null && String(navState.postId).trim() !== ''
      ? String(navState.postId).trim()
      : '';
  const selectedVideoId: string | null =
    (navState?.selectedReelId ? String(navState.selectedReelId) : null) ||
    (navState?.videoId ? String(navState.videoId) : null) ||
    (params.id ? String(params.id) : null);

  // In the “selected from Home” mode, we replace the feed with a single video.
  const isSelectedMode = !!selectedVideoId;

  const [videos, setVideos] = useState<any[]>([]);
  const [feedAds, setFeedAds] = useState<ActiveAdRow[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preselectedSound, setPreselectedSound] = useState<any>(null);
  const [activeNav, setActiveNav] = useState<string>('for-you');
  const [reelsLoaded, setReelsLoaded] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [feedScrollRoot, setFeedScrollRoot] = useState<HTMLElement | null>(null);
  const videoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelVideoElsRef = useRef<Record<string, HTMLVideoElement | null>>({});
  /** After first programmatic alignment for this navigation; blocks scroll-driven feedback loops. */
  const isInitialScrollDone = useRef(false);
  /** True while programmatic scrollIntoView runs; observers/onScroll ignore updates. */
  const isAutoScrolling = useRef(false);
  /** Prevents duplicate scrollIntoView when `videos` identity changes before initial alignment finishes. */
  const initialScrollLockRef = useRef(false);

  useLayoutEffect(() => {
    setFeedScrollRoot(feedRef.current);
  }, [videos.length, feedAds.length]);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsTouchDevice(!!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await getActiveAds(supabase, { limit: 12 });
      if (cancelled || error) return;
      setFeedAds(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // New navigation → allow one programmatic scroll to target reel again.
  useEffect(() => {
    isInitialScrollDone.current = false;
    initialScrollLockRef.current = false;
  }, [location.key]);

  // If navigated from Home with a selected video, prioritize it once the feed loads
  // (do not replace the feed with a single video).
  useEffect(() => {
    if (!isSelectedMode || !selectedVideoId) return;
    setActiveVideoId(String(selectedVideoId));

    // Remember last selected reel so direct /reels can start from it.
    try {
      if (selectedVideoUrl) sessionStorage.setItem('reels_last_videoUrl', selectedVideoUrl);
      sessionStorage.setItem('reels_last_videoId', String(selectedVideoId));
      sessionStorage.setItem('reels_last_thumbnail', navState?.thumbnail || selectedVideoUrl || '');
      sessionStorage.setItem('reels_last_username', navState?.username || '');
      sessionStorage.setItem('reels_last_avatar', navState?.avatar || '');
      sessionStorage.setItem('reels_last_caption', navState?.caption || '');
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectedMode, selectedVideoUrl, selectedVideoId]);

  // (base "/reels" selection persistence is handled inside fetchReels)

  /** Prefetch feed from navigation (e.g. Home) so the list is never empty while the network loads. */
  useEffect(() => {
    const st = location.state as { videos?: any[]; startIndex?: number } | undefined;
    if (st?.videos?.length) {
      setVideos(st.videos);
      const si = typeof st.startIndex === 'number' ? st.startIndex : 0;
      const clamped = Math.max(0, Math.min(si, st.videos.length - 1));
      setCurrentIndex(clamped);
      const id = st.videos[clamped]?.id;
      if (id) setActiveVideoId(String(id));
      setReelsLoaded(true);
    }
  }, [location.key]);

  useEffect(() => {
    const st = location.state as { videos?: any[] } | undefined;
    if (st?.videos?.length) return;

    const fetchReels = async () => {
      try {
        const likedStorageKey = 'reels_liked_ids_v1';
        const readLikedIds = () => {
          try {
            const raw = localStorage.getItem(likedStorageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return new Set<string>();
            return new Set(parsed.map((x) => String(x)));
          } catch {
            return new Set<string>();
          }
        };

        const likedIds = readLikedIds();

        const normalizeUrl = (url: string) => {
          try {
            const parsed = new URL(url);
            return `${parsed.origin}${parsed.pathname}`;
          } catch {
            return url;
          }
        };

        const targetId = params.id ? String(params.id) : selectedVideoId ? String(selectedVideoId) : null;
        const targetUrl = selectedVideoUrl ? normalizeUrl(selectedVideoUrl) : null;

        const { data: reelsRows, error: reelsError } = await supabase
          .from('posts')
          .select('*')
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false });
        if (reelsError) {
          console.error('[Reels] fetch error:', reelsError);
          throw reelsError;
        }
        console.log('[Reels] fetched posts:', reelsRows);
        let reels = Array.isArray(reelsRows) ? reelsRows : [];
        if (selectedPost?.id != null) {
          const selectedPostId = String(selectedPost.id);
          const exists = reels.some((p: any) => String(p?.id) === selectedPostId);
          if (!exists) {
            reels = [selectedPost, ...reels];
          }
        }

        const reelsWithViral = reels.map((post: any) => {
          const views = getViews(post);
          const score = getViralScore(post);
          return {
            ...post,
            isViral: views >= MIN_VIEWS && score >= VIRAL_THRESHOLD,
            viralScore: score,
          };
        });

        for (const r of reelsWithViral) {
          if (r.isViral) {
            void maybeRewardViralPost({ id: r.id, user_id: r.user_id, isViral: true });
          }
        }

        const userIds = Array.from(new Set(reelsWithViral.map((r: any) => r.user_id).filter(Boolean)));
        let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds);
          profileMap = Object.fromEntries((profiles || []).map((p: any) => [String(p.id), p]));
        }

        // Match Home feed behavior: compute likes/comments counts from likes/comments tables.
        const postIds = reelsWithViral.map((r: any) => String(r.id)).filter(Boolean);
        let likesByPost: Record<string, number> = {};
        let commentsByPost: Record<string, number> = {};
        if (postIds.length > 0) {
          const [likesRes, commentsRes] = await Promise.all([
            supabase.from('likes').select('post_id').in('post_id', postIds),
            supabase.from('comments').select('post_id').in('post_id', postIds),
          ]);
          const { data: likeRows, error: likesAggErr } = likesRes;
          const { data: commentRows, error: commentsAggErr } = commentsRes;
          if (!likesAggErr && Array.isArray(likeRows)) {
            likeRows.forEach((row: any) => {
              const pid = String(row.post_id);
              likesByPost[pid] = (likesByPost[pid] || 0) + 1;
            });
          }
          if (!commentsAggErr && Array.isArray(commentRows)) {
            commentRows.forEach((row: any) => {
              const pid = String(row.post_id);
              commentsByPost[pid] = (commentsByPost[pid] || 0) + 1;
            });
          }
        }

        const enrichedForRank = reelsWithViral.map((r: any) => {
          const id = String(r.id);
          return {
            ...r,
            likes_count: likesByPost[id] ?? r.likes_count ?? 0,
            comments_count: commentsByPost[id] ?? r.comments_count ?? 0,
          };
        });
        const ranked = [...enrichedForRank].sort(
          (a: any, b: any) => getPersonalizedScore(b) - getPersonalizedScore(a)
        );

        const list = ranked
          // Mirror Home feed "no group:* posts" behavior
          .filter((r: any) => {
            const cat = typeof r?.category === 'string' ? r.category.trim().toLowerCase() : '';
            return !cat.startsWith('group:');
          })
          .map((r: any) => {
            const id = String(r.id);
            const playUrl = r.video_url || r.url || '';
            const uid = String(r.user_id ?? '').trim();
            const uname = String(profileMap[uid]?.username ?? r.username ?? '').trim();
            if (!uid || !uname || isPlaceholderUsername(uname)) return null;
            if (!isValidVideoUrl(playUrl)) return null;
            return {
              id,
              url: playUrl,
              videoUrl: playUrl,
              thumbnail: r.image_url || r.thumbnail || playUrl,
              user: {
                username: uname,
                avatar: profileMap[uid]?.avatar_url || r.avatar || '',
              },
              caption: String(r.content || r.caption || ''),
              likes: likesByPost[id] ?? 0,
              comments: commentsByPost[id] ?? 0,
              views: getViews(r),
              shares: typeof r.shares === 'number' ? r.shares : 0,
              saves: typeof r.saves === 'number' ? r.saves : 0,
              coins: typeof r.coins === 'number' ? r.coins : 0,
              sound: r.sound_title ? { title: r.sound_title, artist: r.sound_artist } : null,
              isLive: false,
              liked: likedIds.has(id),
              isViral: !!r.isViral,
              viralScore: typeof r.viralScore === 'number' ? r.viralScore : 0,
              created_at: r.created_at ?? null,
              category: r.category ?? null,
              post_user_id: uid,
              is_featured: normalizePostRowIsFeatured(r),
            };
          })
          .filter((v: any): v is NonNullable<typeof v> => v != null && !!v.url);

        let finalList = list;
        let followingIds: string[] = [];
        if (activeNav === 'following' && user?.id) {
          const { data: follows } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);
          followingIds = (follows || [])
            .map((f: { following_id?: string | null }) => String(f.following_id || '').trim())
            .filter(Boolean);

          const followingSet = new Set(followingIds);
          const filtered = list.filter((post: any) => {
            const ownerId = String(post?.post_user_id || post?.user_id || '').trim();
            return ownerId && followingSet.has(ownerId);
          });
          // Fallback: keep current trending list when user follows nobody or filtered list is empty.
          finalList = filtered.length > 0 ? filtered : list;
        }

        console.log('FOLLOWING FEED APPLIED:', {
          count: finalList.length,
          followingCount: followingIds.length,
        });

        finalList = mergeFeaturedFromHomeSelectedPost(finalList, selectedPost, targetId, normalizeUrl);

        setVideos(finalList);
        const targetById = targetId
          ? finalList.find((v: any) => String(v.id) === String(targetId))
          : null;
        const targetByUrl = targetUrl
          ? finalList.find((v: any) => normalizeUrl(String(v.url)) === targetUrl)
          : null;
        const target = targetById || targetByUrl || finalList[0] || null;
        setActiveVideoId(target ? String(target.id) : null);
      } catch (e) {
        console.error('[ReelsPage] fetchReels', e);
      } finally {
        setReelsLoaded(true);
      }
    };

    void fetchReels();
  }, [
    isSelectedMode,
    params.id,
    selectedVideoId,
    selectedVideoUrl,
    location.key,
    activeNav,
    user?.id,
    selectedPost?.id,
  ]);

  useEffect(() => {
    const channel = supabase
      .channel('posts-updates-reels')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          const rawId = row?.id;
          const id = rawId != null ? String(rawId) : '';
          if (!id) return;
          setVideos((prev) =>
            prev.map((v) => {
              if (String(v.id) !== id) return v;
              const merged = { ...v, ...row };
              const viewsVal = getViews(merged as { view_count?: unknown; views?: unknown });
              const viralScore = getViralScore({
                view_count: (merged as { view_count?: unknown }).view_count,
                views: viewsVal,
                created_at: (merged as { created_at?: string | null }).created_at ?? null,
              });
              const isViralNow = viewsVal >= MIN_VIEWS && viralScore >= VIRAL_THRESHOLD;
              const ownerId = String(
                (merged as { user_id?: unknown }).user_id ?? (v as { post_user_id?: string }).post_user_id ?? ''
              ).trim();
              if (isViralNow && ownerId) {
                void maybeRewardViralPost({ id, user_id: ownerId, isViral: true });
              }
              return {
                ...merged,
                likes: typeof v.likes === 'number' ? v.likes : 0,
                comments: typeof v.comments === 'number' ? v.comments : 0,
                liked: v.liked,
                user: v.user,
                url: v.url,
                videoUrl: v.videoUrl,
                thumbnail: v.thumbnail,
                caption: v.caption,
                sound: v.sound,
                views: viewsVal,
                isViral: isViralNow,
                viralScore,
                post_user_id: ownerId || (v as { post_user_id?: string }).post_user_id,
                is_featured: normalizePostRowIsFeatured(merged as { is_featured?: unknown; isFeatured?: unknown }),
              };
            })
          );
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const state = location.state as any;
    if (!state || videos.length === 0) return;
    if (state?.videoUrl) return;
    console.log('[Reels] open state', { videoId: state.videoId, postId: state.postId, index: state.index, videoUrl: state.videoUrl });

    // Primary selection: exact reel id from navigation state.
    if (state.videoId) {
      const matched = videos.find((v) => v.id === state.videoId);
      if (matched) {
        console.log('[Reels] matched by videoId', { videoId: state.videoId, matchedIndex: videos.findIndex(v => v.id === matched.id) });
        setActiveVideoId(String(matched.id));
        return;
      }

      // Don't choose a fallback until reels data has been loaded at least once.
      if (!reelsLoaded) {
        console.log('[Reels] waiting for reels load before fallback', { videoId: state.videoId, videosCount: videos.length });
        return;
      }
    }

    // Secondary selection: exact video URL from navigation state.
    if (state.videoUrl) {
      const normalizeUrl = (url: string) => {
        try {
          const parsed = new URL(url);
          return `${parsed.origin}${parsed.pathname}`;
        } catch {
          return url;
        }
      };
      const targetUrl = normalizeUrl(state.videoUrl);
      const byUrl = videos.find((v) => normalizeUrl(v.url) === targetUrl);
      if (byUrl) {
        console.log('[Reels] matched by videoUrl', { videoId: byUrl.id });
        setActiveVideoId(String(byUrl.id));
        return;
      }
    }

    // Fallback: index from navigation state.
    if (typeof state.index === 'number' && state.index >= 0 && state.index < videos.length) {
      console.log('[Reels] fallback by index', { index: state.index, selectedId: videos[state.index].id });
      setActiveVideoId(String(videos[state.index].id));
    }
  }, [location.state, videos, reelsLoaded]);

  useEffect(() => {
    if (!videos.length) return;
    if (!activeVideoId) {
      setCurrentIndex(0);
      return;
    }
    const idx = videos.findIndex((v) => String(v.id) === String(activeVideoId));
    if (idx >= 0) setCurrentIndex(idx);
  }, [videos, activeVideoId]);

  /**
   * Single initial alignment per navigation (replaces duplicate scroll effects on activeVideoId + selectedPost).
   * After isInitialScrollDone, activeVideoId changes from IntersectionObserver no longer call scrollIntoView.
   */
  useEffect(() => {
    if (!videos.length || !feedRef.current) return;
    if (isInitialScrollDone.current) return;
    if (!activeVideoId) {
      isInitialScrollDone.current = true;
      return;
    }
    const targetIndex = videos.findIndex((p) => String(p.id) === String(activeVideoId));
    if (targetIndex === -1) {
      isInitialScrollDone.current = true;
      return;
    }
    if (initialScrollLockRef.current) return;
    const target = feedRef.current.querySelector(`[data-reel-id="${activeVideoId}"]`) as HTMLElement | null;
    if (!target) return;

    initialScrollLockRef.current = true;

    const instantSnap =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    const fromHomePost = !!selectedPost?.id && String(selectedPost.id) === String(activeVideoId);
    const scrollBlock: ScrollLogicalPosition = fromHomePost ? 'center' : 'start';

    isAutoScrolling.current = true;
    const runScroll = () => {
      target.scrollIntoView({ block: scrollBlock, behavior: instantSnap ? 'auto' : 'smooth' });
    };
    if (fromHomePost) {
      requestAnimationFrame(() => requestAnimationFrame(runScroll));
    } else {
      runScroll();
    }
    const done = window.setTimeout(() => {
      isAutoScrolling.current = false;
      isInitialScrollDone.current = true;
    }, 300);
    return () => {
      window.clearTimeout(done);
      if (!isInitialScrollDone.current) {
        initialScrollLockRef.current = false;
        isAutoScrolling.current = false;
      }
    };
  }, [activeVideoId, videos.length, selectedPost?.id]);

  const updateVideoCounts = useCallback(
    (
      videoId: string,
      patch: Partial<{ likes: number; comments: number; views: number; liked: boolean }>
    ) => {
      setVideos((prev) =>
        prev.map((v) => (String(v.id) === String(videoId) ? { ...v, ...patch } : v))
      );
    },
    []
  );

  /** Pause every reel <video> inside the feed only (avoids touching other pages’ media). */
  const pauseAllReelVideos = useCallback(() => {
    const root = feedRef.current;
    if (!root) return;
    root.querySelectorAll('video').forEach((el) => {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    });
  }, []);

  const setActiveReel = useCallback((id: string) => {
    setActiveVideoId(id);
  }, []);

  const refreshPostCounts = useCallback(async (postId: string) => {
    try {
      const { count: likesCount, error: likesCountErr } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
      if (likesCountErr) throw likesCountErr;

      const { count: commentsCount, error: commentsCountErr } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
      if (commentsCountErr) throw commentsCountErr;

      let likedByUser = false;
      if (user?.id) {
        const { data: likeRow, error: likeRowErr } = await supabase
          .from('likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!likeRowErr) likedByUser = !!likeRow;
      }

      setVideos((prev) =>
        prev.map((v) =>
          String(v.id) === String(postId)
            ? {
                ...v,
                likes: typeof likesCount === 'number' ? likesCount : v.likes,
                comments: typeof commentsCount === 'number' ? commentsCount : v.comments,
                liked: typeof likedByUser === 'boolean' ? likedByUser : v.liked,
              }
            : v
        )
      );
    } catch (err) {
      console.error('[ReelsPage] refreshPostCounts failed:', err);
    }
  }, [user?.id]);

  const handleUpload = (newVideo: any) => {
    setVideos([newVideo, ...videos]);
    setActiveVideoId(String(newVideo.id));
    navigate('/reels');
    setIsUploadModalOpen(false);
    setPreselectedSound(null);
  };

  const activeVideo =
    (activeVideoId ? videos.find((v) => String(v.id) === String(activeVideoId)) : null) ||
    videos[currentIndex] ||
    videos[0];

  const reelFeedItems = useMemo(() => {
    const out: Array<{ kind: 'video'; video: any } | { kind: 'ad'; ad: ActiveAdRow }> = [];
    videos.forEach((video, index) => {
      out.push({ kind: 'video', video });
      if (index % 5 === 0 && feedAds.length > 0) {
        out.push({ kind: 'ad', ad: feedAds[index % feedAds.length] });
      }
    });
    return out;
  }, [videos, feedAds]);

  if (!videos.length && !reelsLoaded) {
    return <ReelsFeedSkeleton />;
  }

  if (!videos.length && reelsLoaded) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0A0A0A]">
        <div className="text-center text-white/80 px-6">
          <div className="text-sm font-bold">No videos available</div>
          <div className="text-xs text-white/50 mt-1">Please try again later.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 max-lg:h-[100dvh] max-lg:max-h-[100dvh] flex-1 flex-col bg-[#0A0A0A] font-sans max-lg:overflow-x-hidden max-lg:overflow-y-visible lg:overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 z-[100] bg-gradient-to-b from-black/80 to-transparent">
        <div className="w-20" /> {/* Spacer for symmetry */}
        
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setActiveNav('for-you')}
            className={cn(
              "text-sm font-bold transition-all",
              activeNav === 'for-you' ? "text-white scale-110" : "text-white/60 hover:text-white"
            )}
          >
            For You
            {activeNav === 'for-you' && <div className="h-0.5 w-4 bg-white mx-auto mt-1 rounded-full" />}
          </button>
          <button 
            onClick={() => setActiveNav('following')}
            className={cn(
              "text-sm font-bold transition-all",
              activeNav === 'following' ? "text-white scale-110" : "text-white/60 hover:text-white"
            )}
          >
            Following
            {activeNav === 'following' && <div className="h-0.5 w-4 bg-white mx-auto mt-1 rounded-full" />}
          </button>
          <button 
            onClick={() => navigate('/live')}
            className="flex items-center gap-1.5 bg-pink-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white animate-pulse"
          >
            Go Live
          </button>
        </div>

        <div className="flex items-center gap-4 w-20 justify-end">
          <button
            onClick={() => navigate('/reels/create')}
            className="text-white/80 hover:text-white transition-colors"
            title="Create Reel"
          >
            <Plus size={22} />
          </button>
          <button className="text-white/80 hover:text-white transition-colors">
            <Search size={22} />
          </button>
          <button 
            onClick={() => navigate('/messages')}
            className="text-white/80 hover:text-white transition-colors relative"
          >
            <MessageCircle size={22} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-black" />
          </button>
        </div>
      </div>

      {/* Main Content Area — single scroll: feed is the only vertical overflow (matches App main min-h-0 chain) */}
      <div className="flex min-h-0 flex-1 max-lg:overflow-visible lg:overflow-hidden">
        {/* Reels Feed — sole vertical scroll; mobile: explicit 100dvh + snap-mandatory + touch momentum */}
        <div
          className={cn(
            'relative w-full flex-1 min-h-0 overflow-y-auto no-scrollbar',
            'max-lg:h-[100dvh] max-lg:max-h-[100dvh]',
            'lg:h-full',
            'snap-y snap-mandatory',
            'max-lg:overscroll-y-auto lg:overscroll-y-contain',
            '[-webkit-overflow-scrolling:touch]',
            'lg:transition-all lg:duration-500 lg:ease-in-out lg:touch-auto',
            isCommentsOpen ? 'lg:mr-0' : ''
          )}
          ref={feedRef}
          onClick={() => {
            if (!hasUserInteracted) setHasUserInteracted(true);
          }}
          onTouchStart={() => {
            if (!hasUserInteracted) setHasUserInteracted(true);
          }}
          onScroll={() => {
            if (!isInitialScrollDone.current) return;
            if (isAutoScrolling.current) return;
            if (!hasUserInteracted) setHasUserInteracted(true);
          }}
        >
          {(() => {
            let videoLayoutIndex = 0;
            return reelFeedItems.map((entry, index) => {
              if (entry.kind === 'ad') {
                return (
                  <div
                    key={`ad-${entry.ad.id}-${index}`}
                    className={cn(
                      'relative box-border w-full shrink-0 snap-start p-0 m-0',
                      'max-lg:h-[100dvh] max-lg:min-h-[100dvh] max-lg:max-h-[100dvh]',
                      'lg:h-full flex items-center justify-center bg-black'
                    )}
                    style={isTouchDevice ? { scrollSnapAlign: 'start', backgroundColor: '#000' } : { scrollSnapAlign: 'start' }}
                  >
                    <div className="w-full max-w-lg px-4 py-6">
                      <AdCard
                        ad={entry.ad}
                        tone="dark"
                        className="w-full border border-white/10 bg-[#0A0A0A] rounded-2xl"
                      />
                    </div>
                  </div>
                );
              }
              const video = entry.video;
              const refIdx = videoLayoutIndex++;
              return (
                <div
                  key={video.id}
                  ref={(el) => {
                    videoRefs.current[refIdx] = el;
                  }}
                  data-reel-id={video.id}
                  className={cn(
                    'relative box-border w-full shrink-0 snap-start p-0 m-0',
                    'max-lg:h-[100dvh] max-lg:min-h-[100dvh] max-lg:max-h-[100dvh]',
                    'lg:h-full'
                  )}
                  style={isTouchDevice ? { scrollSnapAlign: 'start', backgroundColor: '#000' } : { scrollSnapAlign: 'start' }}
                >
                  <VideoPost
                    video={video}
                    reelId={String(video.id)}
                    monetizationPostIdOverride={
                      homeNavPostId && homeNavPostId !== String(video.id) ? homeNavPostId : undefined
                    }
                    feedScrollRoot={feedScrollRoot}
                    isAutoScrollingRef={isAutoScrolling}
                    hasUserInteracted={hasUserInteracted}
                    isTouchDevice={isTouchDevice}
                    globalMuted={isMuted}
                    activeVideoId={activeVideoId}
                    pauseAllReelVideos={pauseAllReelVideos}
                    onToggleGlobalMute={() => setIsMuted((prev) => !prev)}
                    onUserInteract={() => setHasUserInteracted(true)}
                    onVideoElementRef={(videoId, el) => {
                      reelVideoElsRef.current[String(videoId)] = el;
                    }}
                    onToggleComments={() => setIsCommentsOpen(!isCommentsOpen)}
                    onReelActive={setActiveReel}
                    onCountsChange={updateVideoCounts}
                    onRefreshPostCounts={(postId) => void refreshPostCounts(postId)}
                    onUseSound={(sound) => {
                      setPreselectedSound(sound);
                      setIsUploadModalOpen(true);
                    }}
                  />
                </div>
              );
            });
          })()}
        </div>

        {/* Tablet/Desktop Sidebar */}
        <div className={cn(
          "hidden lg:flex flex-col w-[380px] bg-[#0A0A0A] border-l border-white/10 transition-all duration-500 overflow-hidden",
          !isCommentsOpen && "w-0 border-none"
        )}>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <CommentsSection 
              video={activeVideo} 
              onCountsChange={updateVideoCounts}
              onRefreshPostCounts={(postId) => void refreshPostCounts(postId)}
              onClose={() => setIsCommentsOpen(false)} 
            />
            <SuggestedReels videos={videos} onSelect={(id) => setActiveVideoId(id)} />
          </div>
        </div>
      </div>

      {/* Mobile Comments Overlay */}
      <AnimatePresence>
        {isCommentsOpen && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="lg:hidden fixed bottom-0 left-0 right-0 h-[70%] bg-[#0A0A0A] flex flex-col rounded-t-3xl shadow-2xl z-[150] border-t border-white/10"
          >
            <CommentsSection 
              video={activeVideo} 
              onCountsChange={updateVideoCounts}
              onRefreshPostCounts={(postId) => void refreshPostCounts(postId)}
              onClose={() => setIsCommentsOpen(false)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isUploadModalOpen && (
          <UploadReelModal 
            onClose={() => {
              setIsUploadModalOpen(false);
              setPreselectedSound(null);
            }} 
            onUpload={handleUpload}
            initialSound={preselectedSound}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UploadReelModal({ onClose, onUpload, initialSound }: { onClose: () => void; onUpload: (video: any) => void; initialSound?: any }) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<'select' | 'record' | 'edit'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSound, setSelectedSound] = useState<any>(initialSound || null);
  const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false);
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Editing states
  const [overlayText, setOverlayText] = useState('');
  const [filter, setFilter] = useState('none');

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', aspectRatio: 16/9 }, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      setMode('select');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startRecording = () => {
    if (!videoRef.current?.srcObject) return;
    
    const stream = videoRef.current.srcObject as MediaStream;
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreview(url);
      setFile(new File([blob], "recorded-reel.webm", { type: 'video/webm' }));
      setMode('edit');
    };

    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 60) {
          stopRecording();
          return 60;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      stopCamera();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setMode('edit');
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const { data: authData, error: authError } = await supabase.auth.getUser();
      console.log('[REELS_DEBUG][ReelsPage] env + auth', {
        mode: import.meta.env.MODE,
        host: typeof window !== 'undefined' ? window.location.host : '(ssr)',
        supabaseHost: supabaseUrl ? new URL(supabaseUrl).host : '(missing)',
        authUser: authData?.user ?? null,
        authError: authError ?? null,
      });

      const uid = user?.id;
      if (!uid) {
        throw new Error('You must be logged in to upload a reel.');
      }
      const ext = resolveStorageExtension(file);
      const filePath = feedStoragePath(uid, ext);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, file, {
          contentType: storageUploadContentType(file),
        });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
          throw new Error('The "reels" storage bucket was not found in your Supabase project. Please create a public bucket named "reels" in your Supabase Storage dashboard.');
        }
        throw uploadError;
      }

      const uploadedPath = uploadData?.path || filePath;
      const { data: { publicUrl } } = supabase.storage
        .from('posts')
        .getPublicUrl(uploadedPath);
      console.log('[REELS_DEBUG][ReelsPage] storage upload result', {
        uploadData,
        uploadError: uploadError ?? null,
        uploadedPath,
        publicUrl,
      });
      if (!publicUrl) throw new Error('Failed to generate public URL for uploaded reel');

      // Save reel metadata to posts table (same stable path as Home posts).
      const insertPayload = {
        user_id: uid,
        content: caption || '',
        image_url: null,
        video_url: publicUrl,
        category: 'reel',
      };
      console.log('[REELS_DEBUG][ReelsPage] posts insert payload', insertPayload);
      const { data: insertedPost, error: insertError } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select('id')
        .single();
      console.log('[REELS_DEBUG][ReelsPage] posts insert response', {
        data: insertedPost ?? null,
        error: insertError ?? null,
      });
      if (insertError) throw insertError;
      const createdId = insertedPost?.id != null ? String(insertedPost.id) : `${Date.now()}`;

      const { data: probeRows, error: probeError } = await supabase
        .from('posts')
        .select('id, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      console.log('[REELS_DEBUG][ReelsPage] supabase reels probe', {
        rows: probeRows ?? [],
        error: probeError ?? null,
      });

      const newVideo = {
        id: createdId,
        url: publicUrl,
        user: {
          username: resolveProfileUsername(profile?.username),
          avatar: profile?.avatar_url || ''
        },
        caption: caption || 'New Reel!',
        likes: 0,
        comments: 0,
        views: 0,
        shares: 0,
        saves: 0,
        coins: 0,
        sound: selectedSound ? { title: selectedSound.title, artist: selectedSound.artist } : null,
        thumbnail: publicUrl
      };
      
      onUpload(newVideo);
      setIsUploading(false);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Error uploading reel: ${error.message}. Make sure you have a 'reels' bucket in Supabase Storage.`);
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (mode === 'record') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-0 sm:p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-black sm:bg-gray-900 w-full h-full sm:max-w-md sm:h-[90vh] sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/50 backdrop-blur-md sticky top-0 z-20">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-bold"
          >
            <Home size={16} />
            <span className="hidden sm:inline">Home</span>
          </button>
          <h3 className="text-white font-bold text-sm">
            {mode === 'select' ? 'Create Reel' : mode === 'record' ? 'Recording' : 'Edit Reel'}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col">
          {mode === 'select' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className="w-24 h-24 bg-indigo-600/20 rounded-full flex items-center justify-center mb-4">
                <PlaySquare size={48} className="text-indigo-500" />
              </div>
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-xl font-black text-white">Create a Reel</h2>
                <p className="text-sm text-gray-500">Share your moments with the world</p>
              </div>
              
              <div className="w-full space-y-4">
                <button 
                  onClick={() => setMode('record')}
                  className="w-full bg-white text-black py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-gray-100 transition-all shadow-xl"
                >
                  <Camera size={20} />
                  Record Video
                </button>
                
                <label className="w-full bg-gray-800 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-gray-700 transition-all cursor-pointer">
                  <ImageIcon size={20} />
                  Upload from Gallery
                  <input type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
                </label>
              </div>
            </div>
          )}

          {mode === 'record' && (
            <div className="flex-1 relative bg-black flex flex-col">
              <video 
                ref={videoRef}
                autoPlay 
                muted 
                playsInline
                className="w-full h-full object-cover"
              />
              
              {/* Recording UI */}
              <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">
                <div className="flex justify-center">
                  {isRecording && (
                    <div className="bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-2 animate-pulse">
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between pointer-events-auto">
                  <button className="p-3 bg-black/40 text-white rounded-full backdrop-blur-md">
                    <RefreshCw size={24} />
                  </button>
                  
                  <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                      "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all",
                      isRecording ? "border-white bg-white/20" : "border-white bg-red-600"
                    )}
                  >
                    {isRecording ? <Square size={32} className="text-white fill-white" /> : <Circle size={32} className="text-white fill-white" />}
                  </button>
                  
                  <button 
                    onClick={() => setMode('select')}
                    className="p-3 bg-black/40 text-white rounded-full backdrop-blur-md"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === 'edit' && (
            <div className="flex-1 flex flex-col">
              <div className="relative aspect-[9/16] bg-black overflow-hidden sm:rounded-2xl mx-4 mt-4 border border-white/10 group">
                <video 
                  src={preview!} 
                  className={cn("w-full h-full object-cover", filter !== 'none' && `filter-${filter}`)} 
                  autoPlay 
                  muted 
                  loop 
                />
                
                {/* Overlay Text Preview */}
                {overlayText && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-white text-black px-4 py-2 rounded-lg font-black text-xl shadow-2xl">
                      {overlayText}
                    </span>
                  </div>
                )}

                <div className="absolute right-4 top-4 flex flex-col gap-4">
                  <button className="p-2 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                    <Type size={20} />
                  </button>
                  <button className="p-2 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                    <Sparkles size={20} />
                  </button>
                  <button className="p-2 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                    <Scissors size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Overlay Text</label>
                  <input 
                    type="text" 
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    placeholder="Add text to your video..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sound</label>
                  <button 
                    onClick={() => setIsSoundSelectorOpen(true)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between hover:bg-white/10 transition-all"
                  >
                    {selectedSound ? (
                      <div className="flex items-center gap-3">
                        <img src={selectedSound.cover} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        <div className="text-left">
                          <p className="text-white text-xs font-bold">{selectedSound.title}</p>
                          <p className="text-gray-500 text-[10px]">{selectedSound.artist}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-gray-400">
                        <Music size={18} />
                        <span className="text-xs">Add sound</span>
                      </div>
                    )}
                    <Plus size={16} className="text-gray-500" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Caption</label>
                  <textarea 
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all resize-none h-20"
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => { setFile(null); setPreview(null); setMode('select'); }}
                    className="flex-1 bg-gray-800 text-white py-4 rounded-2xl font-bold hover:bg-gray-700 transition-all"
                  >
                    Discard
                  </button>
                  <button 
                    disabled={isUploading}
                    onClick={handleSubmit}
                    className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send size={18} />
                        Share Reel
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {isSoundSelectorOpen && (
            <SoundSelector 
              onClose={() => setIsSoundSelectorOpen(false)}
              onSelect={(sound) => {
                setSelectedSound(sound);
                setIsSoundSelectorOpen(false);
              }}
              selectedSoundId={selectedSound?.id}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function SoundSelector({ onClose, onSelect, selectedSoundId }: { onClose: () => void; onSelect: (sound: any) => void; selectedSoundId?: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredSounds = MOCK_SOUNDS.filter(s => 
    (s.title || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || 
    (s.artist || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const togglePreview = (e: React.MouseEvent, sound: any) => {
    e.stopPropagation();
    if (previewingSoundId === sound.id) {
      audioRef.current?.pause();
      setPreviewingSoundId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = sound.audioUrl;
        audioRef.current.play();
      } else {
        audioRef.current = new Audio(sound.audioUrl);
        audioRef.current.play();
      }
      setPreviewingSoundId(sound.id);
      audioRef.current.onended = () => setPreviewingSoundId(null);
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-20 bg-gray-900 flex flex-col"
    >
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
        <h3 className="text-white font-bold text-sm">Select Sound</h3>
        <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sounds..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
        {filteredSounds.map((sound) => (
          <div 
            key={sound.id}
            className={cn(
              "w-full flex items-center gap-4 p-3 rounded-2xl transition-all border group",
              selectedSoundId === sound.id 
                ? "bg-indigo-600/20 border-indigo-500" 
                : "bg-white/5 border-transparent hover:bg-white/10"
            )}
          >
            <div className="relative cursor-pointer" onClick={(e) => togglePreview(e, sound)}>
              <img src={sound.cover} alt="" className="w-12 h-12 rounded-xl object-cover" />
              <div className={cn(
                "absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center transition-opacity",
                previewingSoundId === sound.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                {previewingSoundId === sound.id ? (
                  <div className="flex gap-0.5 items-end h-4">
                    <motion.div animate={{ height: [4, 12, 6, 10, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1 bg-white" />
                    <motion.div animate={{ height: [8, 4, 12, 6, 8] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1 bg-white" />
                    <motion.div animate={{ height: [12, 6, 10, 4, 12] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-1 bg-white" />
                  </div>
                ) : (
                  <PlaySquare size={20} className="text-white" />
                )}
              </div>
            </div>
            <div className="flex-1 text-left cursor-pointer" onClick={() => onSelect(sound)}>
              <h4 className="text-white font-bold text-sm">{sound.title}</h4>
              <p className="text-gray-500 text-xs">{sound.artist}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-gray-500 text-[10px] font-mono">{sound.duration}</span>
              <button 
                onClick={() => onSelect(sound)}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                  selectedSoundId === sound.id ? "bg-indigo-600 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {selectedSoundId === sound.id ? 'Selected' : 'Select'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function VideoPost({
  video,
  reelId,
  monetizationPostIdOverride,
  feedScrollRoot,
  isAutoScrollingRef,
  hasUserInteracted,
  isTouchDevice,
  globalMuted,
  activeVideoId,
  pauseAllReelVideos,
  onToggleGlobalMute,
  onUserInteract,
  onVideoElementRef,
  onToggleComments,
  onReelActive,
  onUseSound,
  onCountsChange,
  onRefreshPostCounts,
}: {
  video: any;
  reelId: string;
  /** When set, merge GET /monetization/post for this id with the reel row id (Home feed vs reel row). */
  monetizationPostIdOverride?: string | null;
  feedScrollRoot: HTMLElement | null;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
  hasUserInteracted: boolean;
  isTouchDevice: boolean;
  globalMuted: boolean;
  activeVideoId: string | null;
  pauseAllReelVideos: () => void;
  onToggleGlobalMute: () => void;
  onUserInteract: () => void;
  onVideoElementRef: (videoId: string, el: HTMLVideoElement | null) => void;
  onToggleComments: () => void;
  onReelActive: (id: string) => void;
  onUseSound: (sound: any) => void;
  onCountsChange: (videoId: string, patch: Partial<{ likes: number; comments: number; views: number; liked: boolean }>) => void;
  onRefreshPostCounts: (postId: string) => void;
  key?: React.Key;
}) {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(!!video?.liked);
  const [isSaved, setIsSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [activeGifts, setActiveGifts] = useState<any[]>([]);
  const [floatingHearts, setFloatingHearts] = useState<any[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const [showSoundIcon, setShowSoundIcon] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [monetization, setMonetization] = useState<MonetizationPostStatus | null>(null);
  const [monetizationReady, setMonetizationReady] = useState(false);
  const reelContainerRef = useRef<HTMLDivElement>(null);
  const intersectingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const blurVideoRef = useRef<HTMLVideoElement>(null);
  const soundIconTimerRef = useRef<number | null>(null);
  const hasReelViewCountedRef = useRef(false);
  const watchStartRef = useRef<number | null>(null);
  const monetizationPromoTimersRef = useRef<{ show?: number; hide?: number }>({});
  const [monetizationPromoVisible, setMonetizationPromoVisible] = useState(false);
  const [tipPickerOpen, setTipPickerOpen] = useState(false);
  const [tipFlash, setTipFlash] = useState<TipSuccessFlash | null>(null);

  const REEL_GIFTS = [
    { id: 'g1', icon: '🎁', price: 500 },
    { id: 'g2', icon: '🧸', price: 100 },
    { id: 'g3', icon: '🧪', price: 300 },
    { id: 'g4', icon: '🎂', price: 490 },
    { id: 'g5', icon: '🏆', price: 490 },
    { id: 'g6', icon: '🌹', price: 50 },
  ];

  const ownerId = String(
    (video as { post_user_id?: string; user_id?: string })?.post_user_id ??
      (video as { user_id?: string })?.user_id ??
      (video as { user?: { id?: string } })?.user?.id ??
      ''
  ).trim();
  const isOwner = !!user?.id && ownerId === user.id;
  const monetizationUnlocked = isMonetizationUnlockedForTips(monetization);
  const postBoosted = isPostBoostedForTips(video, monetization);
  const canGiftOrTip = postBoosted && !isOwner && !!user?.id;

  useEffect(() => {
    if (!isMonetizationDebugEnabled() || !monetizationReady) return;
    const rid = video?.id != null ? String(video.id) : '';
    console.log('[canGiftOrTip debug]', {
      postId: rid,
      monetization,
      monetization_unlocked: monetization?.unlocked,
      monetization_monetizationLocked: monetization?.monetizationLocked,
      video_is_featured: (video as { is_featured?: unknown })?.is_featured,
      isOwner,
      user_id: user?.id,
      postBoosted,
      canGiftOrTip,
    });
  }, [monetizationReady, video, monetization, isOwner, user?.id, postBoosted, canGiftOrTip]);

  useEffect(() => {
    if (!monetizationReady || !video?.id || !user?.id) return;
    const pid = String(video.id);
    void trackMonetizationDebugBehavior('view_video', pid);
  }, [monetizationReady, video?.id, user?.id]);

  useEffect(() => {
    if (!monetizationReady || !video?.id || !user?.id) return;
    const pid = String(video.id);
    if (canGiftOrTip) {
      void trackMonetizationDebugBehavior('tip_available', pid);
    } else {
      void trackMonetizationDebugBehavior('tip_not_visible', pid);
    }
  }, [monetizationReady, video?.id, user?.id, canGiftOrTip]);

  useEffect(() => {
    if (!monetizationReady || !video?.id || !user?.id) return;
    const pid = String(video.id);
    void trackMonetizationDebugBehavior(`can_tip_${canGiftOrTip}`, pid);
    void trackMonetizationDebugBehavior(`is_owner_${isOwner}`, pid);
    void trackMonetizationDebugBehavior(`post_boosted_${postBoosted}`, pid);
  }, [monetizationReady, video?.id, user?.id, canGiftOrTip, isOwner, postBoosted]);

  const reloadMonetization = useCallback(async () => {
    const rid = video?.id != null ? String(video.id) : null;
    if (!rid) {
      setMonetizationReady(true);
      return;
    }
    setMonetizationReady(false);
    const alt =
      monetizationPostIdOverride && String(monetizationPostIdOverride) !== String(rid)
        ? String(monetizationPostIdOverride)
        : null;
    const [primary, secondary] = await Promise.all([
      fetchMonetizationPost(rid),
      alt ? fetchMonetizationPost(alt) : Promise.resolve(null),
    ]);
    const merged = mergeMonetizationPostStatus(primary, secondary);
    setMonetization(merged);
    setMonetizationReady(true);
    if (isMonetizationDebugEnabled()) {
      // Production: label [Monetization][Vercel] for ?debugMonetization=1 on Vercel
      console.log(import.meta.env.PROD ? '[Monetization][Vercel]' : '[Monetization][Reels]', rid, {
        is_featured: (video as { is_featured?: unknown })?.is_featured,
        unlocked: merged?.unlocked,
        monetization: merged,
        mergedWithHomePostId: alt ?? null,
      });
    }
  }, [video?.id, monetizationPostIdOverride]);

  useEffect(() => {
    void reloadMonetization();
  }, [reloadMonetization]);

  useEffect(() => {
    return subscribePostMonetization((postId) => {
      const rid = video?.id != null ? String(video.id) : null;
      const alt =
        monetizationPostIdOverride && String(monetizationPostIdOverride) !== String(rid)
          ? String(monetizationPostIdOverride)
          : null;
      if (rid && (postId === rid || (alt && postId === alt))) void reloadMonetization();
    });
  }, [video?.id, monetizationPostIdOverride, reloadMonetization]);

  useEffect(() => {
    if (!tipFlash) return;
    const t = window.setTimeout(() => setTipFlash(null), 2600);
    return () => window.clearTimeout(t);
  }, [tipFlash]);

  const playUrl = String((video as any).videoUrl || video.url || '').trim();
  console.log("VIDEO URL:", playUrl);
  const urlOk = isValidVideoUrl(playUrl);
  const thumbStr = String((video as any).thumbnail || '').trim();
  const thumbOk = isValidVideoUrl(thumbStr);
  const posterForPlayer = thumbOk ? thumbStr : urlOk ? `${playUrl}#t=0.1` : undefined;

  /** Short timed promo when monetization is locked; resets on reel / unlock / player state change. */
  useEffect(() => {
    const t = monetizationPromoTimersRef.current;
    if (t.show != null) window.clearTimeout(t.show);
    if (t.hide != null) window.clearTimeout(t.hide);
    t.show = undefined;
    t.hide = undefined;
    setMonetizationPromoVisible(false);

    const eligible = !postBoosted && urlOk && !videoFailed && monetizationReady;
    if (!eligible) return;

    const DELAY_MS = 2600;
    const VISIBLE_MS = 2600;

    t.show = window.setTimeout(() => {
      setMonetizationPromoVisible(true);
      t.hide = window.setTimeout(() => {
        setMonetizationPromoVisible(false);
        t.hide = undefined;
      }, VISIBLE_MS);
      t.show = undefined;
    }, DELAY_MS);

    return () => {
      if (t.show != null) window.clearTimeout(t.show);
      if (t.hide != null) window.clearTimeout(t.hide);
    };
  }, [video?.id, postBoosted, urlOk, videoFailed, monetizationReady]);

  const flushMainVideoWatchSegment = useCallback(() => {
    if (watchStartRef.current != null) {
      const seconds = (Date.now() - watchStartRef.current) / 1000;
      if (video?.id != null && seconds > 0) {
        trackWatchTime(String(video.id), seconds);
      }
      watchStartRef.current = null;
    }
  }, [video?.id]);

  const handleMainVideoPlay = useCallback(() => {
    watchStartRef.current = Date.now();
    updateInterest({
      video_url: playUrl || undefined,
      image_url: thumbStr || undefined,
      category: (video as any)?.category,
    });
  }, [playUrl, thumbStr, video]);

  const handleMainVideoPauseOrEnd = useCallback(() => {
    flushMainVideoWatchSegment();
  }, [flushMainVideoWatchSegment]);

  useEffect(() => {
    return () => {
      flushMainVideoWatchSegment();
    };
  }, [video?.id, flushMainVideoWatchSegment]);

  const handleLike = async () => {
    const reelId = video?.id != null ? String(video.id) : null;
    if (!user?.id) {
      console.error('User not authenticated');
      return;
    }
    const userId = user.id;
    if (!reelId) {
      console.error('[LikeError]', { message: 'Missing post_id', postId: reelId, userId });
      return;
    }
    const previous = isLiked;
    console.log('[ReelsPage] like click', { reelId, userId, previousLiked: previous });
    const prevLikesCount = typeof video?.likes === 'number' ? video.likes : 0;
    const nextLiked = !previous;
    const jsonHeaders = { 'Content-Type': 'application/json' } as const;
    setIsLiked(nextLiked);
    onCountsChange(reelId, { likes: prevLikesCount + (nextLiked ? 1 : -1), liked: nextLiked });
    try {
      const response = await fetchFeedApiSafe(apiUrl('/api/feed/post-like'), {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ userId, postId: reelId })
      });
      if (!response || !response.ok) throw new Error('Failed to like post');
      const data = await response.json().catch(() => null);
      console.log('[ReelsPage] post-like response', { postId: reelId, data });
      if (nextLiked && reelId) {
        if (import.meta.env.DEV) {
          console.log('[ReelsPage][userBehavior] calling trackUserBehavior', {
            action: 'like',
            userId,
            targetId: reelId,
            via: 'post-like API',
          });
        }
        void trackUserBehavior({
          userId,
          actionType: 'like',
          targetType: 'post',
          targetId: reelId,
          category: String((video as { category?: string })?.category || 'reel'),
        });
      }

      // Persist liked UI across refresh.
      try {
        const likedStorageKey = 'reels_liked_ids_v1';
        const raw = localStorage.getItem(likedStorageKey);
        const arr = raw ? JSON.parse(raw) : [];
        const set = new Set(Array.isArray(arr) ? arr.map((x: any) => String(x)) : []);
        if (nextLiked) set.add(reelId);
        else set.delete(reelId);
        localStorage.setItem(likedStorageKey, JSON.stringify(Array.from(set)));
      } catch {
        /* non-fatal */
      }

      // If server returned explicit state, sync to it; otherwise keep optimistic values.
      if (data && typeof data?.liked === 'boolean') {
        setIsLiked(data.liked);
        onCountsChange(reelId, { liked: data.liked });
      }

      if (nextLiked && ownerId && ownerId !== userId) {
        const likerName = (profile?.username || user.email?.split('@')[0] || 'Someone').trim();
        notifyLikeCommentFollowDm({
          recipientUserId: ownerId,
          type: 'like',
          message: `${likerName} liked your post`,
          storyId: reelId,
          entityId: reelId,
        });
      }
    } catch (err) {
      console.error('[LikeError]', err);
      console.error('[ReelsPage] like API failed, trying supabase fallback:', err);
      try {
        if (nextLiked) {
          const { error: insErr } = await supabase
            .from('likes')
            .insert({ post_id: reelId, user_id: userId });
          if (insErr) throw insErr;
          if (reelId) {
            if (import.meta.env.DEV) {
              console.log('[ReelsPage][userBehavior] calling trackUserBehavior', {
                action: 'like',
                userId,
                targetId: reelId,
                via: 'supabase fallback',
              });
            }
            void trackUserBehavior({
              userId,
              actionType: 'like',
              targetType: 'post',
              targetId: reelId,
              category: String((video as { category?: string })?.category || 'reel'),
            });
          }

          // Best-effort notification (non-fatal).
          try {
            const notifyRes = await fetchFeedApiSafe(apiUrl('/api/notifications/from-feed-like'), {
              method: 'POST',
              headers: jsonHeaders,
              body: JSON.stringify({ userId, postId: reelId }),
            });
            await notifyRes?.text();
          } catch {
            /* non-fatal */
          }
          if (ownerId && ownerId !== userId) {
            const likerName = (profile?.username || user.email?.split('@')[0] || 'Someone').trim();
            notifyLikeCommentFollowDm({
              recipientUserId: ownerId,
              type: 'like',
              message: `${likerName} liked your post`,
              storyId: reelId,
              entityId: reelId,
            });
          }
        } else {
          const { error: delErr } = await supabase
            .from('likes')
            .delete()
            .eq('post_id', reelId)
            .eq('user_id', userId);
          if (delErr) throw delErr;
        }

        // Keep optimistic values; sync localStorage likedIds to nextLiked.
        try {
          const likedStorageKey = 'reels_liked_ids_v1';
          const raw = localStorage.getItem(likedStorageKey);
          const arr = raw ? JSON.parse(raw) : [];
          const set = new Set(Array.isArray(arr) ? arr.map((x: any) => String(x)) : []);
          if (nextLiked) set.add(reelId);
          else set.delete(reelId);
          localStorage.setItem(likedStorageKey, JSON.stringify(Array.from(set)));
        } catch {
          /* non-fatal */
        }
      } catch (fallbackErr) {
        console.error('[LikeError]', fallbackErr);
        console.error('[ReelsPage] like supabase fallback failed:', fallbackErr);
        setIsLiked(previous);
        onCountsChange(reelId, { likes: prevLikesCount, liked: previous });
        try {
          const likedStorageKey = 'reels_liked_ids_v1';
          const raw = localStorage.getItem(likedStorageKey);
          const arr = raw ? JSON.parse(raw) : [];
          const set = new Set(Array.isArray(arr) ? arr.map((x: any) => String(x)) : []);
          if (previous) set.add(reelId);
          else set.delete(reelId);
          localStorage.setItem(likedStorageKey, JSON.stringify(Array.from(set)));
        } catch {
          /* non-fatal */
        }
      }
    }

    // Deterministic sync with persisted counts.
    if (reelId) {
      await onRefreshPostCounts(reelId);
    }

    const newHearts = Array.from({ length: 5 }).map((_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 60 - 30,
    }));
    setFloatingHearts(prev => [...prev, ...newHearts]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
    }, 2000);
  };

  useEffect(() => {
    // Keep local like UI synced with the parent `videos` array.
    setIsLiked(!!video?.liked);
  }, [video?.liked, video?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || video?.id == null) {
        setIsSaved(false);
        return;
      }
      const { data, error } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('post_id', String(video.id))
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) setIsSaved(false);
      else setIsSaved(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [video?.id, user?.id]);

  const handleSaveToggle = async () => {
    const reelId = video?.id != null ? String(video.id) : null;
    if (!user?.id) {
      alert('Please sign in to save posts.');
      return;
    }
    if (!reelId) return;
    const userId = user.id;
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    try {
      if (wasSaved) {
        const { error } = await supabase
          .from('saved_posts')
          .delete()
          .eq('post_id', reelId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_posts')
          .insert({ post_id: reelId, user_id: userId });
        if (error) throw error;
      }
    } catch (e) {
      console.error('[ReelsPage] saved_posts toggle', e);
      setIsSaved(wasSaved);
    }
  };

  const handleSelectGift = (gift: { id: string }) => {
    setSelectedGiftId(gift?.id ?? null);
    console.log('[ReelsPage] gift select', { reelId: video?.id != null ? String(video.id) : null, giftId: gift?.id });
  };

  const handleSendGift = async () => {
    const reelId = video?.id != null ? String(video.id) : null;
    if (!reelId) {
      console.log('[ReelsPage] gift send: missing reelId', { reelId, video });
      return;
    }
    const userId = user?.id;
    if (!userId) {
      alert('Sign in to send gifts.');
      return;
    }
    if (!isPostBoostedForTips(video, monetization)) {
      alert('Tips and gifts are only available on boosted posts.');
      return;
    }
    if (isOwner) {
      alert('You cannot gift your own content.');
      return;
    }
    const giftToSend =
      selectedGiftId ? REEL_GIFTS.find((g) => g.id === selectedGiftId) : undefined;
    const finalGift = giftToSend || REEL_GIFTS[0];
    const coins = finalGift?.price ?? 50;

    const effectivePostId = monetizationPostIdOverride
      ? String(monetizationPostIdOverride)
      : reelId;
    if (import.meta.env.DEV) {
      console.log('[Gifts] effectivePostId:', effectivePostId);
      console.log('[Gifts] reelId:', reelId);
      console.log('[Gifts] overridePostId:', monetizationPostIdOverride ?? null);
    }

    console.log('[ReelsPage] gift send', {
      reelId,
      effectivePostId,
      userId,
      giftId: finalGift?.id,
      giftPrice: coins,
    });

    const res = await sendMonetizationGift(effectivePostId, coins);
    if (!res.ok) {
      alert(res.error || 'Gift failed');
      return;
    }
    void trackMonetizationDebugBehavior('send_gift', reelId);
    if (import.meta.env.DEV) {
      console.log('[Gifts][AfterSend] postId used:', effectivePostId);
    }
    await refreshProfile();
    await reloadMonetization();

    setActiveGifts((prev) => [
      ...prev,
      {
        id: Date.now(),
        reelId,
        senderId: userId,
        giftId: finalGift?.id,
        coins,
      },
    ]);

    const newHearts = Array.from({ length: 8 }).map((_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 60 - 30,
    }));
    setFloatingHearts((prev) => [...prev, ...newHearts]);
    setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => !newHearts.find((nh) => nh.id === h.id)));
    }, 2000);
  };

  const handleSendTip = async (amount: number) => {
    const reelId = video?.id != null ? String(video.id) : null;
    if (!reelId || !user?.id) {
      alert('Sign in to tip.');
      return;
    }
    if (!isPostBoostedForTips(video, monetization)) {
      alert('Tips and gifts are only available on boosted posts.');
      return;
    }
    if (isOwner) return;
    const bal = Number(profile?.coins) || 0;
    if (bal < amount) {
      alert(`You need at least ${amount} coins to tip.`);
      return;
    }
    const effectivePostId = monetizationPostIdOverride
      ? String(monetizationPostIdOverride)
      : reelId;
    if (import.meta.env.DEV) {
      console.log('[Gifts] effectivePostId:', effectivePostId);
      console.log('[Gifts] reelId:', reelId);
      console.log('[Gifts] overridePostId:', monetizationPostIdOverride ?? null);
    }
    const res = await sendMonetizationGift(effectivePostId, amount);
    if (!res.ok) {
      alert(res.error || 'Tip failed');
      return;
    }
    void trackMonetizationDebugBehavior('send_tip', reelId);
    if (import.meta.env.DEV) {
      console.log('[Gifts][AfterSend] postId used:', effectivePostId);
    }
    await refreshProfile();
    await reloadMonetization();
    const u = (profile?.username || user.email?.split('@')[0] || '').trim();
    setTipFlash({
      id: Date.now(),
      text: u ? `${u} ${amount} Tip` : `+${amount} Tip`,
    });
    const newHearts = Array.from({ length: 5 }).map((_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 60 - 30,
    }));
    setFloatingHearts((prev) => [...prev, ...newHearts]);
    setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => !newHearts.find((nh) => nh.id === h.id)));
    }, 2000);
  };

  const togglePlay = useCallback(async () => {
    if (!urlOk) return;
    if (videoRef.current) {
      try {
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        } else {
          pauseAllReelVideos();
          onReelActive(reelId);
          const v = videoRef.current;
          const b = blurVideoRef.current;
          v.currentTime = 0;
          if (b) b.currentTime = 0;
          void b?.play().catch(() => {});
          await v.play();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error("Video play failed:", error);
      }
    }
  }, [isPlaying, urlOk, pauseAllReelVideos, onReelActive, reelId]);

  const handleVideoSurfaceTap = useCallback(() => {
    if (!urlOk) return;
    const el = videoRef.current;
    if (!el) return;

    if (isTouchDevice) {
      onToggleGlobalMute();
      setShowSoundIcon(true);
      if (soundIconTimerRef.current) {
        window.clearTimeout(soundIconTimerRef.current);
      }
      soundIconTimerRef.current = window.setTimeout(() => {
        setShowSoundIcon(false);
      }, 2000);
      if (el.paused) {
        pauseAllReelVideos();
        onReelActive(reelId);
        el.currentTime = 0;
        const b = blurVideoRef.current;
        if (b) b.currentTime = 0;
        void b?.play().catch(() => {});
        void el.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        el.pause();
        blurVideoRef.current?.pause();
        setIsPlaying(false);
      }
      return;
    }

    if (!hasUserInteracted) {
      onUserInteract();
      el.muted = false;
      pauseAllReelVideos();
      onReelActive(reelId);
      el.currentTime = 0;
      const b = blurVideoRef.current;
      if (b) b.currentTime = 0;
      void b?.play().catch(() => {});
      void el.play().then(() => setIsPlaying(true)).catch(() => {});
      return;
    }
    void togglePlay();
  }, [hasUserInteracted, onToggleGlobalMute, onUserInteract, togglePlay, isTouchDevice, urlOk, pauseAllReelVideos, onReelActive, reelId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isTouchDevice ? globalMuted : videoRef.current.muted;
    }
  }, [globalMuted, activeVideoId, isTouchDevice]);

  useEffect(() => {
    setIsReady(false);
    setVideoFailed(false);
  }, [video?.id]);

  useEffect(() => {
    hasReelViewCountedRef.current = false;
  }, [video?.id]);

  useEffect(() => {
    return () => {
      if (soundIconTimerRef.current) {
        window.clearTimeout(soundIconTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      const v = videoRef.current;
      const b = blurVideoRef.current;
      if (v) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      if (b) {
        b.pause();
        try {
          b.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const tryPlayMain = useCallback(() => {
    const v = videoRef.current;
    const b = blurVideoRef.current;
    if (!v || !urlOk || videoFailed) return;
    const run = () => {
      if (!intersectingRef.current) return;
      void b?.play().catch(() => {});
      void v.play().then(() => setIsPlaying(true)).catch(() => {});
    };
    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      run();
    } else {
      const onCanPlay = () => {
        v.removeEventListener('canplay', onCanPlay);
        run();
      };
      v.addEventListener('canplay', onCanPlay);
    }
  }, [urlOk, videoFailed]);

  /** Observe the full reel cell (not the letterboxed <video>) so visibility matches viewport / scroll root. */
  useEffect(() => {
    if (!urlOk || videoFailed) return;
    const root = reelContainerRef.current;
    if (!root) return;

    const REEL_VISIBLE_RATIO = 0.65;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isAutoScrollingRef.current) return;
        entries.forEach((entry) => {
          if (entry.target !== root) return;
          const visible = entry.isIntersecting && entry.intersectionRatio >= REEL_VISIBLE_RATIO;

          if (visible) {
            intersectingRef.current = true;
            pauseAllReelVideos();
            onReelActive(reelId);
            if (reelId) {
              console.log('VIDEO VISIBLE:', reelId);
            }
            if (user?.id && reelId) {
              startCreatorValidViewWatch(user.id, reelId);
            }
            const v = videoRef.current;
            const b = blurVideoRef.current;
            if (v) {
              try {
                v.currentTime = 0;
              } catch {
                /* ignore */
              }
            }
            if (b) {
              try {
                b.currentTime = 0;
              } catch {
                /* ignore */
              }
            }
            tryPlayMain();

            if (
              reelId &&
              !hasReelViewCountedRef.current &&
              !hasRecordedViewThisSession(reelId)
            ) {
              hasReelViewCountedRef.current = true;
              markPostViewRecordedSession(reelId);
              if (user?.id && reelId) {
                if (import.meta.env.DEV) {
                  console.log('[ReelsPage][userBehavior] calling trackUserBehavior', {
                    action: 'view',
                    userId: user.id,
                    targetId: reelId,
                  });
                }
                void trackUserBehavior({
                  userId: user.id,
                  actionType: 'view',
                  targetType: 'video',
                  targetId: reelId,
                  category: String((video as { category?: string })?.category || 'reel'),
                });
              }
              const next = getViews(video) + 1;
              onCountsChange(reelId, { views: next });
              void supabase
                .from('posts')
                .update({ view_count: next })
                .eq('id', reelId)
                .then(async ({ error }) => {
                  if (error) {
                    const { error: e2 } = await supabase.from('posts').update({ views: next }).eq('id', reelId);
                    if (e2) console.warn('[Reels VideoPost] views/view_count update', e2);
                  }
                });
            }
          } else {
            intersectingRef.current = false;
            if (user?.id && reelId) {
              void stopCreatorValidViewWatch(user.id, reelId);
            }
            const v = videoRef.current;
            const b = blurVideoRef.current;
            if (v) {
              v.pause();
              try {
                v.currentTime = 0;
              } catch {
                /* ignore */
              }
            }
            if (b) {
              b.pause();
              try {
                b.currentTime = 0;
              } catch {
                /* ignore */
              }
            }
            setIsPlaying(false);
          }
        });
      },
      {
        root: feedScrollRoot,
        rootMargin: '0px',
        threshold: [0, 0.15, 0.35, 0.5, 0.65, 0.75, 0.85, 1],
      }
    );

    observer.observe(root);
    return () => {
      if (user?.id && reelId) {
        void stopCreatorValidViewWatch(user.id, reelId);
      }
      observer.disconnect();
    };
  }, [
    feedScrollRoot,
    isAutoScrollingRef,
    onReelActive,
    onCountsChange,
    pauseAllReelVideos,
    reelId,
    tryPlayMain,
    urlOk,
    videoFailed,
    video,
    user?.id,
  ]);

  /** If metadata loads after the reel became active, ensure playback starts once the element is ready. */
  useEffect(() => {
    if (!isReady || !intersectingRef.current || !urlOk || videoFailed) return;
    const v = videoRef.current;
    if (!v || !v.paused) return;
    tryPlayMain();
  }, [isReady, urlOk, videoFailed, tryPlayMain]);

  const desktopMuted = !hasUserInteracted;

  return (
    <div
      ref={reelContainerRef}
      className="relative isolate h-full min-h-0 w-full flex-shrink-0 overflow-hidden bg-black group"
    >
      {video.isViral && (
        <div className="pointer-events-none absolute top-2 left-2 z-[30] bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg">
          🔥 Viral
        </div>
      )}
      {urlOk && !videoFailed ? (
        <>
          {thumbOk && (
            <img
              src={thumbStr}
              alt=""
              className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
              aria-hidden
            />
          )}
          {!thumbOk && (
            <div className="pointer-events-none absolute inset-0 z-0 bg-neutral-900" aria-hidden />
          )}
          {/* Blurred background — same src as main; fills letterbox edges */}
          <video
            ref={blurVideoRef}
            src={playUrl}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover blur-2xl"
            poster={posterForPlayer}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
            onError={() => setVideoFailed(true)}
            style={{ backgroundColor: '#000' }}
          />
          {/* Main player — shrink-wrapped + centered so sides/top-bottom show blur, not black pillarbox */}
          <div className="absolute inset-0 z-[10] flex h-full w-full min-h-0 min-w-0 items-center justify-center">
            <video
              key={video.id}
              ref={(el) => {
                videoRef.current = el;
                onVideoElementRef(String(video.id), el);
              }}
              src={playUrl}
              poster={posterForPlayer}
              className={cn(
                'relative z-[10] max-h-full max-w-full object-contain',
                !isReady && 'invisible'
              )}
              controls={!isTouchDevice}
              loop
              muted={isTouchDevice ? globalMuted : desktopMuted}
              playsInline
              preload="metadata"
              onLoadedData={() => setIsReady(true)}
              onError={() => setVideoFailed(true)}
              onPlay={handleMainVideoPlay}
              onPause={handleMainVideoPauseOrEnd}
              onEnded={handleMainVideoPauseOrEnd}
              onClick={handleVideoSurfaceTap}
              style={!isTouchDevice ? { cursor: 'pointer' } : undefined}
            />
          </div>
        </>
      ) : urlOk && videoFailed ? (
        <div className="absolute inset-0 z-[1] flex flex-col items-stretch">
          {thumbOk ? (
            <img src={thumbStr} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-neutral-900" aria-hidden />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm font-semibold px-4 text-center">
            Video unavailable
          </div>
        </div>
      ) : thumbOk ? (
        <>
          <img
            src={thumbStr}
            alt=""
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover blur-[20px]"
            aria-hidden
          />
          <img
            src={thumbStr}
            alt=""
            className="relative z-[10] h-full w-full object-cover"
            onLoad={() => setIsReady(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 z-[1] bg-black" aria-hidden />
      )}

      {urlOk && !videoFailed && isTouchDevice && showSoundIcon && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleGlobalMute();
            setShowSoundIcon(true);
            if (soundIconTimerRef.current) {
              window.clearTimeout(soundIconTimerRef.current);
            }
            soundIconTimerRef.current = window.setTimeout(() => {
              setShowSoundIcon(false);
            }, 2000);
          }}
          style={{
            position: 'absolute',
            bottom: '80px',
            right: '16px',
            zIndex: 30,
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '50%',
            padding: '8px',
          }}
        >
          {globalMuted ? '🔇' : '🔊'}
        </div>
      )}

      {urlOk && !videoFailed && !hasUserInteracted && !isTouchDevice && (
        <button
          type="button"
          className="absolute left-1/2 top-1/2 z-[30] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-[12px] font-bold text-white shadow-sm touch-manipulation"
          aria-label="Tap for sound"
          onClick={(e) => {
            e.stopPropagation();
            onUserInteract();
            const el = videoRef.current;
            if (el) {
              el.muted = false;
              void el
                .play()
                .then(() => setIsPlaying(true))
                .catch(() => {});
            }
          }}
        >
          Tap for sound
        </button>
      )}

      {/* Overlays — above video (z-10), below controls (z-30) */}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      {/* LIVE Badge */}
      {video.isLive && (
        <div className="absolute top-20 left-6 z-[30] flex flex-col gap-1">
          <div className="flex items-center gap-2 bg-pink-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest text-white w-fit">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-md">{getViews(video)} views</span>
        </div>
      )}

      {/* Right Action Bar */}
      <div className="absolute right-4 top-1/2 z-[30] flex -translate-y-1/2 flex-col items-center gap-6">
        <ActionButton 
          icon={<Heart className={cn("transition-all duration-300", isLiked ? "text-red-500 fill-red-500 scale-125" : "text-white")} size={30} />} 
          label={video.likes || 0}
          onClick={handleLike}
        />
        <ActionButton 
          icon={<MessageCircle className="text-white" size={30} />} 
          label={video.comments || 0} 
          onClick={onToggleComments}
        />
        <ActionButton 
          icon={<Share2 className="text-white" size={30} />} 
          label="320" 
          onClick={() => setIsShareModalOpen(true)}
        />
        <ActionButton 
          icon={<Bookmark className={cn("transition-all duration-300", isSaved ? "text-white fill-white" : "text-white")} size={30} />} 
          label="" 
          onClick={() => void handleSaveToggle()}
        />
        {canGiftOrTip && (
          <ActionButton
            icon={<Gift className="text-orange-400" size={30} />}
            label="Gift"
            onClick={() => {
              const el = document.getElementById('gift-selection-row');
              el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
              void handleSendGift();
            }}
          />
        )}
        {canGiftOrTip && (
          <ActionButton
            icon={<Coins className="text-yellow-400" size={30} />}
            label="Tip"
            onClick={(e) => {
              e.stopPropagation();
              if (video?.id != null) {
                void trackMonetizationDebugBehavior('click_tip', String(video.id));
              }
              setTipPickerOpen(true);
            }}
          />
        )}
        {!postBoosted && monetizationReady && !isOwner && (
          <ActionButton
            icon={<Sparkles className="text-amber-300/90" size={28} />}
            label="Boost tips"
            onClick={(e) => {
              e.stopPropagation();
              navigate(user ? '/profile' : '/login');
            }}
          />
        )}
        <ActionButton 
          icon={<Camera className="text-white" size={30} />} 
          label="" 
        />
      </div>

      {/* Bottom Content Overlay — pointer-events-none so vertical swipes reach the feed scroller; actions stay on the right rail */}
      <div className="pointer-events-none absolute bottom-12 left-6 right-20 z-[30] sm:bottom-24">
        <div className="flex flex-col gap-3">
          {monetizationUnlocked && monetization && (
            <div className="max-w-sm space-y-1.5 rounded-xl border border-emerald-500/30 bg-black/70 px-3 py-2">
              <p className="text-emerald-300 text-[10px] font-black uppercase tracking-wider">Earnings (boost cap)</p>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                  style={{
                    width: `${Math.round((monetization.boostProgress || 0) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-white/90 text-[10px] font-mono">
                Boost: ${(monetization.boostEarningsCents / 100).toFixed(2)} / $
                {(monetization.maxBoostEarningsCents / 100).toFixed(2)} · Organic: $
                {(Number(monetization.organicEarningsCents) / 100).toFixed(2)}
              </p>
            </div>
          )}
          {/* Product Integration */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden shadow-xl bg-white/10 flex items-center justify-center">
              {video.user.avatar ? (
              <img src={video.user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-sm font-black">{(video.user.username || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white font-black text-sm tracking-tight">@{video.user.username}</span>
                <BadgeCheck size={14} className="text-indigo-400 fill-indigo-400/20" />
              </div>
              <p className="text-white text-xs font-medium mt-0.5">{(video.caption ?? '').split('#')[0]}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {video.tags?.map((tag: string) => (
              <span key={tag} className="text-white font-bold text-xs hover:text-indigo-400 transition-colors cursor-pointer">#{(tag || '').toLowerCase()}</span>
            ))}
          </div>

          <div className="flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5">
            <Music size={12} className="text-white animate-spin-slow" />
              <span className="text-white text-[10px] font-bold">
                {video.sound?.title || 'Original Audio'}
              </span>
          </div>
        </div>
      </div>

      {/* Timed monetization promo (locked reels only; mutually exclusive with earnings card above) */}
      <AnimatePresence>
        {monetizationPromoVisible && !postBoosted && urlOk && !videoFailed && (
          <motion.button
            key={`monetization-promo-${String(video?.id ?? '')}`}
            type="button"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(user ? '/profile' : '/login');
            }}
            className={cn(
              'pointer-events-auto absolute left-1/2 z-[30] max-w-sm -translate-x-1/2 cursor-pointer select-none',
              'bottom-[6.75rem] sm:bottom-[8.25rem]',
              'rounded-xl border border-[#D97706] bg-black/90 px-3.5 py-2.5 text-left shadow-lg shadow-black/40',
              'transition-transform active:scale-[0.99] hover:brightness-110'
            )}
            aria-label="Open profile to boost and earn"
          >
            <p className="text-white text-xs font-black tracking-tight">Boost to receive tips</p>
            <p className="text-gray-300 text-[11px] font-medium mt-0.5">Boost this post to unlock gifts & tips</p>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tablet Gift Selection Row */}
      <div
        id="gift-selection-row"
        className="hidden lg:flex absolute bottom-6 left-6 right-6 z-[30] min-h-16 items-center justify-between rounded-2xl border border-white/10 bg-black/75 px-6 py-2"
      >
        {canGiftOrTip ? (
          <>
            <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
              {REEL_GIFTS.map((gift) => (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => handleSelectGift(gift)}
                  className="flex flex-col items-center gap-1 group"
                >
                  <span className="text-2xl group-hover:scale-125 transition-transform">{gift.icon}</span>
                  <div className="flex items-center gap-1 text-yellow-500 text-[9px] font-black">
                    <Coins size={10} />
                    {gift.price}
                  </div>
                </button>
              ))}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                  Tip {MONETIZATION_TIP_AMOUNTS[0]}–{MONETIZATION_TIP_AMOUNTS[MONETIZATION_TIP_AMOUNTS.length - 1]}c
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-yellow-500" />
                <span className="text-white font-black text-sm">{Number(profile?.coins ?? 0)}</span>
              </div>
              <button
                type="button"
                className="bg-white/10 p-2 rounded-full text-white hover:bg-white/20 transition-colors"
                aria-label="Add coins"
                onClick={() => navigate('/wallet')}
              >
                <Plus size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex w-full items-center justify-center gap-2 py-2 text-white/70 text-sm font-semibold">
            <Lock size={16} />
            <span>
              {isOwner
                ? 'Boost from your profile to unlock gifts & tips.'
                : !postBoosted
                  ? 'Boost to receive tips — the creator can boost this post from their profile.'
                  : 'Sign in to send gifts & tips.'}
            </span>
          </div>
        )}
      </div>

      <TipSuccessOverlay flash={tipFlash} className="z-[30]" />

      {/* Floating Hearts Overlay */}
      <div className="absolute bottom-48 right-12 pointer-events-none z-[90]">
        <AnimatePresence>
          {floatingHearts.map((heart) => (
            <motion.div
              key={heart.id}
              initial={{ opacity: 0, y: 0, x: heart.x, scale: 0.5 }}
              animate={{ 
                opacity: [0, 1, 0], 
                y: -300, 
                x: heart.x + (Math.random() * 40 - 20),
                scale: [0.5, 1.5, 1]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="absolute"
            >
              <Heart size={24} className="text-red-500 fill-red-500" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <MonetizationTipPicker
        open={tipPickerOpen}
        onClose={() => setTipPickerOpen(false)}
        balanceCoins={profile?.coins != null ? Number(profile.coins) : undefined}
        onPick={(amount) => {
          setTipPickerOpen(false);
          void handleSendTip(amount);
        }}
      />

      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)}
        onAddStory={() => {
          setIsShareModalOpen(false);
          setIsStoryEditorOpen(true);
        }}
        postUrl={`${window.location.origin}/reels?video=${video.id}`}
        onShareRecorded={
          user?.id && video?.id != null
            ? () => {
                if (import.meta.env.DEV) {
                  console.log('[ReelsPage][userBehavior] calling trackUserBehavior', {
                    action: 'share',
                    userId: user.id,
                    targetId: String(video.id),
                  });
                }
                void trackUserBehavior({
                  userId: user.id,
                  actionType: 'share',
                  targetType: 'post',
                  targetId: String(video.id),
                  category: String((video as { category?: string })?.category || 'reel'),
                });
              }
            : undefined
        }
      />

      <StoryEditor 
        isOpen={isStoryEditorOpen}
        onClose={() => setIsStoryEditorOpen(false)}
        content={{
          image: video.thumbnail,
          user: {
            username: video.user.username,
            avatar: video.user.avatar
          }
        }}
      />

    </div>
  );
}

function SuggestedReels({ videos, onSelect }: { videos: any[]; onSelect: (id: string) => void }) {
  const renderSuggestedMedia = (video: any, thumbWidth: number, thumbHeight: number) => {
    const reelSrc = String((video as any).video_url || video.url || '').trim();
    console.log("VIDEO URL:", reelSrc);
    if (isValidVideoUrl(reelSrc)) {
      return (
        <video
          src={reelSrc}
          muted
          autoPlay
          loop
          playsInline
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          preload="metadata"
        />
      );
    }
    const t = String(video.thumbnail || '').trim();
    if (isValidVideoUrl(t)) {
      return (
        <ResponsiveImage
          src={t}
          alt=""
          width={thumbWidth}
          height={thumbHeight}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
      );
    }
    return <div className="w-full h-full bg-zinc-900" aria-hidden />;
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-white/20 rounded flex items-center justify-center">
          <PlaySquare size={10} className="text-white" />
        </div>
        <h3 className="text-white font-bold text-xs uppercase tracking-widest opacity-60">Suggested Reels</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {videos.map((video) => (
          <button 
            key={video.id} 
            onClick={() => onSelect(video.id)}
            className="relative aspect-[9/16] rounded-xl overflow-hidden group border border-white/5"
          >
            {renderSuggestedMedia(video, 400, 711)}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full overflow-hidden border border-white/20">
                <img src={video.user.avatar} alt="" className="w-full h-full object-cover" />
              </div>
              <span className="text-white text-[8px] font-bold">@{video.user.username}</span>
            </div>
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <Heart size={8} className="text-white fill-white/30" />
              <span className="text-white text-[8px] font-bold">{(video.likes / 100).toFixed(1)}K</span>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <h3 className="text-white font-bold text-xs uppercase tracking-widest opacity-60">Suggested Reels</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {videos.slice(0, 3).map((video) => (
          <button 
            key={`grid-${video.id}`} 
            onClick={() => onSelect(video.id)}
            className="relative aspect-[9/16] rounded-lg overflow-hidden group border border-white/5"
          >
            {renderSuggestedMedia(video, 300, 533)}
            <div className="absolute bottom-1 right-1">
              <span className="text-white text-[7px] font-bold">{(video.likes / 10).toFixed(1)}K</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CommentsSection({
  video,
  onClose,
  onCountsChange,
  onRefreshPostCounts,
}: {
  video: any;
  onClose: () => void;
  onCountsChange: (videoId: string, patch: Partial<{ likes: number; comments: number; views: number; liked: boolean }>) => void;
  onRefreshPostCounts: (postId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    const loadComments = async () => {
      if (!video?.id) return;
      const postId = String(video.id);
      try {
        const rows = await fetchCommentsWithProfiles(supabase, postId);
        setComments(rows.map((r) => ({ ...r, likes: '0' })));
      } catch (err) {
        console.error('Failed to fetch reel(post) comments:', err);
      }
    };

    void loadComments();
  }, [video?.id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const postId = video?.id != null ? String(video.id) : null;
    if (!user?.id) {
      console.error('User not authenticated');
      return;
    }
    const userId = user.id;
    if (!postId) {
      console.error('[CommentError]', { message: 'Missing post_id', postId, userId });
      return;
    }
    if (!newComment.trim()) {
      console.error('[CommentError]', { message: 'Comment content is empty', postId, userId });
      return;
    }
    const text = newComment.trim();
    console.log('[ReelsPage] comment submit', { postId, userId, text });
    setNewComment('');
    try {
      const commentRes = await fetchFeedApiSafe(apiUrl('/api/feed/post-comment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          postId,
          content: text,
        })
      });
      let inserted: any = null;
      if (commentRes && commentRes.ok) {
        const payload = await commentRes.json().catch(() => ({}));
        inserted = payload?.comment ?? null;
      }

      // Fallback: direct supabase insert + non-fatal notifications (same pattern as Home).
      if (!inserted && (!commentRes || !commentRes.ok)) {
        const { data: ins, error } = await supabase
          .from('comments')
          .insert({
            post_id: postId,
            user_id: userId,
            content: text,
            created_at: new Date(),
          })
          .select('id, post_id, user_id, content, created_at')
          .single();
        if (error) throw error;
        inserted = ins;

        try {
          const notifyRes = await fetchFeedApiSafe(apiUrl('/api/notifications/from-feed-comment'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              postId,
              commentId: inserted?.id,
            }),
          });
          await notifyRes?.text();
        } catch {
          /* non-fatal */
        }
      }
      if (!inserted) {
        inserted = {
          id: `temp-${Date.now()}`,
          user_id: userId,
          content: text,
          created_at: new Date().toISOString(),
        };
      }

      const ownerComment = String(
        (video as { post_user_id?: string; user_id?: string })?.post_user_id ??
          (video as { user_id?: string })?.user_id ??
          (video as { user?: { id?: string } })?.user?.id ??
          ''
      ).trim();
      const commentSavedForNotify = inserted && !String(inserted.id).startsWith('temp-');
      if (commentSavedForNotify && ownerComment && ownerComment !== userId) {
        const commenterName = (profile?.username || user.email?.split('@')[0] || 'Someone').trim();
        notifyLikeCommentFollowDm({
          recipientUserId: ownerComment,
          type: 'comment',
          message: `${commenterName} commented on your post`,
          storyId: postId,
          entityId: postId,
        });
      }

      // Optimistic UI append so the new comment shows immediately.
      if (inserted?.id) {
        setComments((prev) => [
          {
            id: inserted.id,
            user: resolveProfileUsername(profile?.username),
            text: inserted.content,
            avatar: profile?.avatar_url || '',
            time: 'now',
            likes: '0',
          },
          ...(Array.isArray(prev) ? prev : []),
        ]);
      }

      const freshRows = await fetchCommentsWithProfiles(supabase, postId);
      setComments(freshRows.map((r) => ({ ...r, likes: '0' })));

      const { count, error: countErr } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
      if (!countErr && typeof count === 'number') {
        onCountsChange(postId, { comments: count });
      }
      // Deterministic sync with persisted counts.
      if (postId) {
        await onRefreshPostCounts(postId);
      }
      if (inserted && !String(inserted.id).startsWith('temp-')) {
        if (import.meta.env.DEV) {
          console.log('[ReelsPage][userBehavior] calling trackUserBehavior', {
            action: 'comment',
            userId,
            targetId: postId,
          });
        }
        void trackUserBehavior({
          userId,
          actionType: 'comment',
          targetType: 'post',
          targetId: postId,
          category: String((video as { category?: string })?.category || 'reel'),
        });
      }
    } catch (err) {
      console.error('[CommentError]', err);
      console.error('Failed to add reel(post) comment:', err);
      setNewComment(text);
    }
  };

  return (
    <div className="flex flex-col h-[450px] bg-[#0A0A0A]">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold text-sm">Comments</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="lg:hidden p-2 text-white/40 hover:text-white">
            <X size={20} />
          </button>
          <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center">
            <PlaySquare size={12} className="text-white" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3 group">
            {comment.avatar ? (
            <ResponsiveImage src={comment.avatar} alt="" width={40} height={40} className="w-8 h-8 rounded-full object-cover border border-white/10" />
            ) : (
              <div className="w-8 h-8 rounded-full border border-white/10 bg-white/10 shrink-0" aria-hidden />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-white/60 font-bold text-[10px]">@{comment.user}</span>
                <div className="flex flex-col items-center gap-0.5">
                  <Heart size={12} className="text-white/40 hover:text-red-500 transition-colors cursor-pointer" />
                  <span className="text-[8px] text-white/40">{comment.likes}</span>
                </div>
              </div>
              <p className="text-white text-xs mt-0.5 leading-relaxed">{comment.text}</p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1 opacity-20">
                  <PlaySquare size={10} className="text-white" />
                  <span className="text-[9px] text-white">Lovers comment...</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-white/10">
        <form onSubmit={handleAddComment} className="relative">
          <input 
            type="text" 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..." 
            className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-4 pr-12 text-xs text-white focus:ring-1 focus:ring-white/20 transition-all"
          />
          <button 
            type="submit"
            disabled={!newComment.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-indigo-400 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string | number;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onClick}
        className="flex items-center justify-center transition-all duration-300 drop-shadow-lg"
      >
        {icon}
      </motion.button>
      {label && (
        <span className="text-[10px] font-bold text-white tracking-tight drop-shadow-md text-center leading-tight">
          {label}
        </span>
      )}
    </div>
  );
}

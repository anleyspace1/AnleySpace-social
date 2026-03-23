import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, isSupabaseConfigured, getCachedSession } from '../lib/supabase';
import { API_ORIGIN } from '../lib/apiOrigin';
import { fetchActiveStories } from '../lib/activeStories';

/** Only stories that can be rendered: persisted id, real user, and media from the API (no seed/dummy rows). */
function isValidStoryRecord(s: any): boolean {
  if (!s || typeof s !== 'object') return false;
  const id = typeof s.id === 'string' ? s.id.trim() : '';
  const uid = typeof s.user_id === 'string' ? s.user_id.trim() : '';
  const mediaUrl =
    (typeof s.media_url === 'string' && s.media_url.trim()) ||
    (typeof s.image_url === 'string' && s.image_url.trim());
  return Boolean(id && uid && mediaUrl);
}

function hasValidStoryTimestamp(s: any): boolean {
  const t = new Date(s.created_at || s.createdAt).getTime();
  return Number.isFinite(t);
}

/** Same order as Home: first occurrence of each user in /api/stories response order (user_id only). */
function orderedUserIdsFromActiveStories(active: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of active) {
    const uid = s.user_id?.trim();
    if (uid && !seen.has(uid)) {
      seen.add(uid);
      out.push(uid);
    }
  }
  return out;
}

function currentUserIndexInOrder(
  routeId: string | undefined,
  ordered: string[],
  matched: any[]
): number {
  if (!routeId || !ordered.length || !matched.length) return -1;
  const u0 = matched[0]?.user_id?.trim();
  const un = matched[0]?.username;
  return ordered.findIndex(
    (u) => u === routeId || (u0 && u === u0) || (un && u === un)
  );
}

function getNextUserId(
  routeId: string | undefined,
  ordered: string[],
  matched: any[]
): string | null {
  const idx = currentUserIndexInOrder(routeId, ordered, matched);
  if (idx === -1 || idx >= ordered.length - 1) return null;
  return ordered[idx + 1];
}

function getPrevUserId(
  routeId: string | undefined,
  ordered: string[],
  matched: any[]
): string | null {
  const idx = currentUserIndexInOrder(routeId, ordered, matched);
  if (idx <= 0) return null;
  return ordered[idx - 1];
}

/** Must match progress bar animation duration (`storyProgressFill` in JSX). */
const STORY_DURATION_MS = 5000;

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedUserId = (location.state as { userId?: string; storyIndex?: string } | null)?.userId;
  const effectiveUserId = selectedUserId ? String(selectedUserId).trim() : undefined;
  const { user, profile } = useAuth();
  const skipResetAfterOpenLastRef = useRef(false);
  /** Synchronous guard so two submits in the same tick cannot both call fetch before replySending updates. */
  const replySubmitLockRef = useRef(false);
  const [stories, setStories] = useState<any[]>([]);
  const [orderedUserIds, setOrderedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyInputFocused, setReplyInputFocused] = useState(false);
  const [reactions, setReactions] = useState<{ emoji: string; id: number }[]>([]);
  const [durationMs, setDurationMs] = useState(STORY_DURATION_MS);
  const [mediaTimingReady, setMediaTimingReady] = useState(true);
  const [viewers, setViewers] = useState<
    { user_id: string; username: string | null; avatar_url: string | null }[]
  >([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const pressRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const storiesRef = useRef(stories);
  const orderedUserIdsRef = useRef(orderedUserIds);
  const currentIndexRef = useRef(currentIndex);
  storiesRef.current = stories;
  orderedUserIdsRef.current = orderedUserIds;
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    const st = location.state as { storyIndex?: 'last' } | undefined;
    if (st?.storyIndex === 'last' && stories.length > 0) {
      setCurrentIndex(stories.length - 1);
      skipResetAfterOpenLastRef.current = true;
      navigate(location.pathname + location.search, { replace: true, state: {} });
      return;
    }
    if (skipResetAfterOpenLastRef.current) {
      skipResetAfterOpenLastRef.current = false;
      return;
    }
    // Route param `id` may be a story UUID (e.g. from Messages) — open that slide, not the first.
    const storyIdx = stories.findIndex((s: any) => String(s?.id ?? '') === String(id ?? ''));
    if (storyIdx >= 0) {
      setCurrentIndex(storyIdx);
      return;
    }
    setCurrentIndex(0);
  }, [stories, id, location.state, location.pathname, location.search, navigate]);

  const handleStoryPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pressRef.current = { t: Date.now(), x: e.clientX, y: e.clientY };
    setIsPaused(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const goNextManual = () => {
    const list = storiesRef.current;
    const order = orderedUserIdsRef.current;
    const ci = currentIndexRef.current;
    if (list.length === 0) return;
    if (ci < list.length - 1) {
      setCurrentIndex(ci + 1);
      return;
    }
    const nextId = getNextUserId(id, order, list);
    if (nextId) navigate(`/story/${nextId}`, { state: { userId: nextId } });
    else navigate(-1);
  };

  const goPrevManual = () => {
    const list = storiesRef.current;
    const order = orderedUserIdsRef.current;
    const ci = currentIndexRef.current;
    if (list.length === 0) return;
    if (ci > 0) {
      setCurrentIndex(ci - 1);
      return;
    }
    const prevId = getPrevUserId(id, order, list);
    if (prevId) {
      navigate(`/story/${prevId}`, { state: { storyIndex: 'last', userId: prevId } });
    } else navigate(-1);
  };

  const handleStoryPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsPaused(false);
    const p = pressRef.current;
    pressRef.current = null;
    if (!p) return;
    const dur = Date.now() - p.t;
    const dx = e.clientX - p.x;
    const dy = Math.abs(e.clientY - p.y);
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
      if (dx < -50) {
        goNextManual();
      } else if (dx > 50) {
        goPrevManual();
      }
      return;
    }
    if (dur >= 400) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width / 2) {
      goPrevManual();
    } else {
      goNextManual();
    }
  };

  function handleReaction(emoji: string) {
    const id = Date.now();
    setReactions((prev) => [...prev, { emoji, id }]);

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 1000);
  }

  const handleStoryPointerCancelOrLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsPaused(false);
    pressRef.current = null;
  };

  const toggleSound = () => {
    if (!videoRef.current) return;

    const newMuted = !videoRef.current.muted;

    videoRef.current.muted = newMuted;
    videoRef.current.volume = newMuted ? 0 : 1;

    setIsMuted(newMuted);
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        console.log('ID:', id);
        const fetchedStories = await fetchActiveStories();
        console.log('Fetched stories (active, same source as Home):', fetchedStories);
        const validStories = fetchedStories.filter(isValidStoryRecord);

        const userOrder = orderedUserIdsFromActiveStories(
          validStories.filter(hasValidStoryTimestamp)
        );
        if (!cancelled) setOrderedUserIds(userOrder);

        let matched: any[];
        if (effectiveUserId) {
          matched = validStories.filter(
            (s: any) => String(s.user_id || '').trim() === effectiveUserId
          );
        } else {
          const byStoryId = validStories.find((s: any) => s.id === id);
          if (byStoryId && byStoryId.user_id) {
            matched = validStories.filter(
              (s: any) => String(s.user_id || '').trim() === String(byStoryId.user_id).trim()
            );
          } else {
            // Match by author id only (no username fallback — avoids wrong stories).
            matched = validStories.filter(
              (s: any) => String(s.user_id || '').trim() === String(id || '').trim()
            );
          }
        }
        const storiesWithValidTimestamp = matched.filter(hasValidStoryTimestamp);
        const sortedStories = [...storiesWithValidTimestamp].sort((a, b) => {
          const tb = new Date(b.created_at || b.createdAt).getTime();
          const ta = new Date(a.created_at || a.createdAt).getTime();
          if (tb !== ta) return tb - ta;
          return String(b.id ?? '').localeCompare(String(a.id ?? ''));
        });

        if (!cancelled) setStories(sortedStories);
      } catch (e) {
        console.error('StoryPage: failed to load stories', e);
        if (!cancelled) {
          setStories([]);
          setOrderedUserIds([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, effectiveUserId]);

  useEffect(() => {
    setReplyText('');
  }, [currentIndex, id]);

  const activeStory = stories[currentIndex];

  useEffect(() => {
    setIsMuted(true);
  }, [activeStory?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = isMuted;
    v.volume = isMuted ? 0 : 1;
  }, [isMuted, activeStory?.id]);

  const activeMediaSrc = activeStory?.image_url || activeStory?.media_url;
  const isActiveVideoStory =
    Boolean(activeMediaSrc) &&
    (activeStory?.media_type === 'video' ||
      /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(String(activeMediaSrc)));

  const isStoryOwner =
    Boolean(user?.id && activeStory?.user_id) &&
    String(user?.id) === String(activeStory?.user_id).trim();

  const displayName =
    (isStoryOwner && (profile?.full_name || profile?.display_name)) ||
    activeStory?.username ||
    'unknown';

  useEffect(() => {
    setShowViewers(false);
  }, [activeStory?.id]);

  useEffect(() => {
    if (!activeStory?.id || !isStoryOwner) {
      setViewers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/stories/${activeStory.id}/views`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setViewers(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStory?.id, isStoryOwner]);

  useEffect(() => {
    const st = activeStory;
    if (!st) return;
    const mediaSrc = st.image_url || st.media_url;
    const isVideo =
      st.media_type === 'video' ||
      (!!mediaSrc && /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(String(mediaSrc)));
    if (!isVideo) {
      setDurationMs(STORY_DURATION_MS);
      setMediaTimingReady(true);
    } else {
      setDurationMs(STORY_DURATION_MS);
      setMediaTimingReady(false);
    }
  }, [activeStory?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPaused || replyInputFocused) {
      v.pause();
    } else {
      void v.play().catch(() => {});
    }
  }, [isPaused, replyInputFocused, activeStory?.id]);

  useEffect(() => {
    if (loading || stories.length === 0 || isPaused || replyInputFocused || !mediaTimingReady) return;
    const timer = window.setTimeout(() => {
      setCurrentIndex((prev) => {
        const list = storiesRef.current;
        const order = orderedUserIdsRef.current;
        if (prev < list.length - 1) return prev + 1;
        const nextId = getNextUserId(id, order, list);
        if (nextId) {
          navigate(`/story/${nextId}`, { state: { userId: nextId } });
        } else {
          navigate(-1);
        }
        return prev;
      });
    }, durationMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    currentIndex,
    loading,
    stories.length,
    isPaused,
    replyInputFocused,
    id,
    navigate,
    durationMs,
    mediaTimingReady,
  ]);

  function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    const sec = v.duration;
    if (Number.isFinite(sec) && sec > 0) {
      setDurationMs(Math.round(sec * 1000));
    } else {
      setDurationMs(STORY_DURATION_MS);
    }
    setMediaTimingReady(true);
  }

  useEffect(() => {
    setReactions([]);
  }, [activeStory?.id]);

  useEffect(() => {
    const uid = activeStory?.user_id?.trim();
    if (!uid) return;
    try {
      const raw = localStorage.getItem('seenUsers') || localStorage.getItem('seenStories');
      const prev = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(prev)) return;
      if (prev.includes(uid)) return;
      const next = [...new Set([...prev.map(String), uid])];
      localStorage.setItem('seenUsers', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, [activeStory]);

  useEffect(() => {
    if (!isSupabaseConfigured || !activeStory?.id || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await getCachedSession();
        const token = session?.access_token;
        if (!token || cancelled) return;
        const res = await fetch(`${API_ORIGIN}/api/story-views`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ story_id: activeStory.id }),
        });
        if (!res.ok && !cancelled) {
          console.warn('POST /api/story-views failed:', res.status);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStory?.id, user?.id]);

  const handleStoryReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Story reply] handleStoryReplySubmit invoked');
    if (replySubmitLockRef.current) {
      console.warn('[Story reply] blocked — request already in flight');
      return;
    }
    if (!user || !activeStory?.id || !activeStory.user_id) {
      console.warn('[Story reply] early return — missing:', {
        user: !!user,
        activeStoryId: activeStory?.id ?? null,
        activeStoryUserId: activeStory?.user_id ?? null,
      });
      return;
    }
    const msg = replyText.trim();
    if (!msg || replySending) {
      console.warn('[Story reply] early return — empty message or already sending:', {
        msgLength: msg.length,
        replySending,
      });
      return;
    }
    const storyId = activeStory.id;
    const senderId = user.id;
    const receiverId = activeStory.user_id;
    const payload = { storyId, senderId, receiverId, message: msg };
    console.log('[Story reply] sending POST /api/story-replies', {
      url: `${API_ORIGIN}/api/story-replies`,
      ...payload,
    });
    replySubmitLockRef.current = true;
    setReplySending(true);
    try {
      const res = await fetch(`${API_ORIGIN}/api/story-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      console.log('[Story reply] response', { status: res.status, ok: res.ok, body: bodyText });
      if (!res.ok) {
        let err: { error?: string } = {};
        try {
          err = JSON.parse(bodyText) as { error?: string };
        } catch {
          /* not JSON */
        }
        throw new Error(err.error || res.statusText);
      }
      setReplyText('');
      console.log('[Story reply] saved successfully');
    } catch (err) {
      console.error('[Story reply] fetch failed:', err);
    } finally {
      replySubmitLockRef.current = false;
      setReplySending(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-4 space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-indigo-600"
      >
        <ArrowLeft size={18} />
        Back
      </button>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-gray-500">No stories for this user.</p>
      ) : !activeStory ? (
        <p className="text-sm text-gray-500">No stories for this user.</p>
      ) : (
        <div className="space-y-4">
          <style>
            {`
              @keyframes storyProgressFill {
                from { transform: scaleX(0); }
                to { transform: scaleX(1); }
              }
              @keyframes floatUp {
                0% { transform: translateY(20px); opacity: 1; }
                100% { transform: translateY(-80px); opacity: 0; }
              }
              .animate-float {
                animation: floatUp 1s ease-out forwards;
              }
            `}
          </style>
          <div className="flex gap-1 w-full" aria-hidden>
            {stories.map((story, index) => (
              <div
                key={story.id ?? index}
                className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
              >
                <div
                  key={
                    index === currentIndex
                      ? `active-${currentIndex}-${story.id ?? index}-${durationMs}`
                      : `fill-${index}`
                  }
                  className="h-full rounded-full bg-gray-800 dark:bg-gray-200"
                  style={
                    index < currentIndex
                      ? { width: '100%', transform: 'scaleX(1)' }
                      : index === currentIndex
                        ? {
                            width: '100%',
                            transformOrigin: 'left',
                            transform: 'scaleX(0)',
                            animation: 'storyProgressFill linear forwards',
                            animationDuration: `${durationMs}ms`,
                            animationPlayState:
                              isPaused || replyInputFocused ? 'paused' : 'running',
                          }
                        : { width: '0%', transform: 'scaleX(0)' }
                  }
                />
              </div>
            ))}
          </div>
          <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900">
            {isStoryOwner && (
              <div className="absolute top-2 right-2 z-[25] pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setShowViewers(true)}
                  className="rounded-full bg-black/45 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm"
                >
                  👁️ {viewers.length}
                </button>
              </div>
            )}
            <div className="pointer-events-none absolute top-0 left-0 right-0 z-20 p-3 bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex items-center gap-3">
                <img
                  src={activeStory?.avatar || '/default-avatar.png'}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = '/default-avatar.png';
                  }}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">
                    {displayName}
                  </span>
                  <span className="text-xs text-gray-300">
                    {activeStory?.created_at
                      ? new Date(activeStory.created_at).toLocaleTimeString()
                      : ''}
                  </span>
                </div>
              </div>
            </div>
            {(() => {
              const mediaSrc = activeStory.image_url || activeStory.media_url;
              if (!mediaSrc) return null;
              const isVideo =
                activeStory.media_type === 'video' ||
                /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(String(mediaSrc));
              return isVideo ? (
                <div className="relative w-full h-full">
                  <video
                    key={mediaSrc}
                    ref={videoRef}
                    src={mediaSrc}
                    className="w-full max-h-[70vh] object-contain bg-black"
                    playsInline
                    autoPlay
                    muted={isMuted}
                    onLoadedMetadata={handleLoadedMetadata}
                  />
                </div>
              ) : (
                <img src={mediaSrc} alt="" className="w-full max-h-[70vh] object-contain bg-black" />
              );
            })()}
            <div className="pointer-events-none absolute inset-0 z-[15] flex flex-wrap items-center justify-center gap-2">
              {reactions.map((r) => (
                <span key={r.id} className="text-3xl animate-float">
                  {r.emoji}
                </span>
              ))}
            </div>
            <div
              className="absolute inset-0 z-10"
              onPointerDown={handleStoryPointerDown}
              onPointerUp={handleStoryPointerUp}
              onPointerCancel={handleStoryPointerCancelOrLeave}
              onPointerLeave={handleStoryPointerCancelOrLeave}
              aria-hidden
            />
            {isActiveVideoStory && (
              <div className="absolute inset-0 z-[20] pointer-events-none">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSound();
                  }}
                  className="absolute bottom-4 right-4 cursor-pointer text-white pointer-events-auto select-none"
                  role="button"
                  tabIndex={0}
                  aria-label={isMuted ? 'Unmute story' : 'Mute story'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSound();
                    }
                  }}
                >
                  {isMuted ? '🔇' : '🔊'}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {['❤️', '🔥', '😂', '😮', '😢'].map((e) => (
              <button key={e} type="button" onClick={() => handleReaction(e)} className="text-xl leading-none p-0.5">
                {e}
              </button>
            ))}
          </div>
          <form onSubmit={handleStoryReplySubmit} className="flex gap-2 w-full pt-1">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setReplyInputFocused(true)}
              onBlur={() => setReplyInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).form?.requestSubmit();
              }}
              placeholder={user ? 'Message…' : 'Log in to reply'}
              disabled={!user || replySending}
              autoComplete="off"
              className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500"
            />
            <button
              type="submit"
              disabled={!user || replySending || !replyText.trim()}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>

          {showViewers && isStoryOwner && (
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowViewers(false);
              }}
            >
              <div className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-900">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Viewers</span>
                  <button
                    type="button"
                    onClick={() => setShowViewers(false)}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                  {viewers.length === 0 ? (
                    <p className="text-sm text-gray-500">No views yet.</p>
                  ) : (
                    viewers.map((v) => (
                      <div key={v.user_id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-2 dark:bg-gray-800/80">
                        <img
                          src={v.avatar_url || '/default-avatar.png'}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {v.username || v.user_id || 'User'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

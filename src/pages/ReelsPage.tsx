import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Zap,
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
  Scissors
} from 'lucide-react';
import { MOCK_VIDEOS, MOCK_USER, MOCK_SOUNDS, MOCK_PRODUCTS } from '../constants';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiOrigin';
import { useAuth } from '../contexts/AuthContext';
import { Video } from '../types';
import ShareModal from '../components/ShareModal';
import StoryEditor from '../components/StoryEditor';
import { ResponsiveImage } from '../components/ResponsiveImage';

const resolveProfileUsername = (username?: string | null) => {
  const value = (username || '').trim();
  if (!value) return 'User';
  return value;
};

export default function ReelsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const { user } = useAuth();
  const navState = location.state as any;
  const selectedVideoUrl: string | undefined = navState?.videoUrl;
  const selectedPost: any | null = navState?.selectedPost ?? null;
  const selectedVideoId: string | null =
    (navState?.selectedReelId ? String(navState.selectedReelId) : null) ||
    (navState?.videoId ? String(navState.videoId) : null) ||
    (params.id ? String(params.id) : null);

  // In the “selected from Home” mode, we replace the feed with a single video.
  const isSelectedMode = !!selectedVideoId;

  const [videos, setVideos] = useState<any[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preselectedSound, setPreselectedSound] = useState<any>(null);
  const [activeNav, setActiveNav] = useState<string>('for-you');
  const [reelsLoaded, setReelsLoaded] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelVideoElsRef = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsTouchDevice(!!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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

  useEffect(() => {
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
          .select('id, user_id, content, video_url, image_url, created_at, category')
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false });
        if (reelsError) throw reelsError;
        let reels = Array.isArray(reelsRows) ? reelsRows : [];
        if (selectedPost?.id != null) {
          const selectedPostId = String(selectedPost.id);
          const exists = reels.some((p: any) => String(p?.id) === selectedPostId);
          if (!exists) {
            reels = [selectedPost, ...reels];
          }
        }

        const userIds = Array.from(new Set(reels.map((r: any) => r.user_id).filter(Boolean)));
        let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds);
          profileMap = Object.fromEntries((profiles || []).map((p: any) => [String(p.id), p]));
        }

        // Match Home feed behavior: compute likes/comments counts from likes/comments tables.
        const postIds = reels.map((r: any) => String(r.id)).filter(Boolean);
        let likesByPost: Record<string, number> = {};
        let commentsByPost: Record<string, number> = {};
        if (postIds.length > 0) {
          const { data: likeRows, error: likesAggErr } = await supabase
            .from('likes')
            .select('post_id')
            .in('post_id', postIds);
          if (!likesAggErr && Array.isArray(likeRows)) {
            likeRows.forEach((row: any) => {
              const pid = String(row.post_id);
              likesByPost[pid] = (likesByPost[pid] || 0) + 1;
            });
          }

          const { data: commentRows, error: commentsAggErr } = await supabase
            .from('comments')
            .select('post_id')
            .in('post_id', postIds);
          if (!commentsAggErr && Array.isArray(commentRows)) {
            commentRows.forEach((row: any) => {
              const pid = String(row.post_id);
              commentsByPost[pid] = (commentsByPost[pid] || 0) + 1;
            });
          }
        }

        const list = reels
          // Mirror Home feed "no group:* posts" behavior
          .filter((r: any) => {
            const cat = typeof r?.category === 'string' ? r.category.trim().toLowerCase() : '';
            return !cat.startsWith('group:');
          })
          .map((r: any) => {
            const id = String(r.id);
            const playUrl = r.video_url || r.url || '';
            return {
              id,
              url: playUrl,
              videoUrl: playUrl,
              thumbnail: r.image_url || r.thumbnail || playUrl,
              user: {
                username: profileMap[String(r.user_id)]?.username || r.username || 'User',
                avatar: profileMap[String(r.user_id)]?.avatar_url || r.avatar || `https://picsum.photos/seed/${r.user_id || id}/100/100`,
              },
              caption: String(r.content || r.caption || ''),
              likes: likesByPost[id] ?? 0,
              comments: commentsByPost[id] ?? 0,
              views: typeof r.views === 'number' ? r.views : 0,
              shares: typeof r.shares === 'number' ? r.shares : 0,
              saves: typeof r.saves === 'number' ? r.saves : 0,
              coins: typeof r.coins === 'number' ? r.coins : 0,
              sound: r.sound_title ? { title: r.sound_title, artist: r.sound_artist } : null,
              isLive: false,
              liked: likedIds.has(id),
            };
          })
          .filter((v: any) => !!v.url);

        setVideos(list);
        const targetById = targetId
          ? list.find((v: any) => String(v.id) === String(targetId))
          : null;
        const targetByUrl = targetUrl
          ? list.find((v: any) => normalizeUrl(String(v.url)) === targetUrl)
          : null;
        const target = targetById || targetByUrl || list[0] || null;
        setActiveVideoId(target ? String(target.id) : null);
      } catch (e) {
        console.error('[ReelsPage] fetchReels', e);
        setVideos([]);
      } finally {
        setReelsLoaded(true);
      }
    };

    // In selected mode we already set the single video; no need to fetch the feed.
    fetchReels();
  }, [isSelectedMode, params.id, selectedVideoId, selectedVideoUrl]);

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

  useEffect(() => {
    if (!activeVideoId || !feedRef.current || videos.length <= 1) return;
    const target = feedRef.current.querySelector(`[data-reel-id="${activeVideoId}"]`) as HTMLElement | null;
    if (target) {
      const instantSnap =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
      target.scrollIntoView({ block: 'start', behavior: instantSnap ? 'auto' : 'smooth' });
    }
  }, [activeVideoId, videos.length]);

  // Home → Reels: center the clicked video once the feed list is ready.
  useEffect(() => {
    if (!selectedPost?.id || !videos.length) return;
    const targetId = String(selectedPost.id);
    const index = videos.findIndex((v) => String(v.id) === targetId);
    if (index === -1) return;
    const el = videoRefs.current[index];
    if (!el) return;
    const instantSnap =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: instantSnap ? 'auto' : 'smooth', block: 'center' });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [videos, selectedPost?.id]);

  const updateVideoCounts = (
    videoId: string,
    patch: Partial<{ likes: number; comments: number; views: number; liked: boolean }>
  ) => {
    setVideos(prev =>
      prev.map((v) => (String(v.id) === String(videoId) ? { ...v, ...patch } : v))
    );
  };

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

  useEffect(() => {
    if (!isTouchDevice || !videos.length) return;
    const activeId = activeVideoId ? String(activeVideoId) : String(videos[0]?.id ?? '');
    const activeIdx = videos.findIndex((v) => String(v.id) === activeId);

    if (activeIdx >= 0 && activeIdx + 1 < videos.length) {
      const nextId = String(videos[activeIdx + 1].id);
      const nextEl = reelVideoElsRef.current[nextId];
      if (nextEl) {
        nextEl.preload = 'auto';
      }
    }
  }, [activeVideoId, videos, isTouchDevice]);

  if (!reelsLoaded) {
    return (
      <div className="relative h-screen overflow-hidden bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (reelsLoaded && videos.length === 0) {
    return (
      <div className="relative h-screen overflow-hidden bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center text-white/80 px-6">
          <div className="text-sm font-bold">No videos available</div>
          <div className="text-xs text-white/50 mt-1">Please try again later.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0A0A0A] font-sans lg:h-screen lg:overflow-hidden">
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

      {/* Main Content Area — on mobile, do not clip overflow so the feed is the sole scroll/snap port */}
      <div className="flex min-h-0 flex-1 max-lg:overflow-visible lg:overflow-hidden">
        {/* Reels Feed — sole scroll container on mobile */}
        <div
          className={cn(
            'relative min-h-0 w-full flex-1 snap-y snap-mandatory overflow-y-scroll no-scrollbar',
            'max-lg:h-full max-lg:overscroll-y-contain max-lg:[-webkit-overflow-scrolling:touch] max-lg:touch-pan-y',
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
            if (!hasUserInteracted) setHasUserInteracted(true);
          }}
        >
          {videos.map((video, index) => (
            <div
              key={video.id}
              ref={(el) => {
                videoRefs.current[index] = el;
              }}
              data-reel-id={video.id}
              className={cn(
                'relative box-border w-full shrink-0 snap-start p-0 m-0',
                'max-lg:h-[100dvh] max-lg:min-h-[100dvh] max-lg:max-h-[100dvh] max-lg:[scroll-snap-stop:always]',
                'lg:h-full'
              )}
            >
              <VideoPost
                video={video}
                hasUserInteracted={hasUserInteracted}
                isTouchDevice={isTouchDevice}
                onUserInteract={() => setHasUserInteracted(true)}
                onVideoElementRef={(videoId, el) => {
                  reelVideoElsRef.current[String(videoId)] = el;
                }}
                onToggleComments={() => setIsCommentsOpen(!isCommentsOpen)}
                onActive={() => setActiveVideoId(String(video.id))}
                onCountsChange={updateVideoCounts}
                onRefreshPostCounts={(postId) => void refreshPostCounts(postId)}
                onUseSound={(sound) => {
                  setPreselectedSound(sound);
                  setIsUploadModalOpen(true);
                }}
              />
            </div>
          ))}
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

      // Upload directly to the "reels" bucket.
      // This avoids false negatives when listBuckets is restricted for anon keys.
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, file);

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
          throw new Error('The "reels" storage bucket was not found in your Supabase project. Please create a public bucket named "reels" in your Supabase Storage dashboard.');
        }
        throw uploadError;
      }

      const uploadedPath = uploadData?.path || fileName;
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
        user_id: user?.id || MOCK_USER.id,
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
          avatar: profile?.avatar_url || MOCK_USER.avatar
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
  hasUserInteracted,
  isTouchDevice,
  onUserInteract,
  onVideoElementRef,
  onToggleComments,
  onActive,
  onUseSound,
  onCountsChange,
  onRefreshPostCounts,
}: {
  video: any;
  hasUserInteracted: boolean;
  isTouchDevice: boolean;
  onUserInteract: () => void;
  onVideoElementRef: (videoId: string, el: HTMLVideoElement | null) => void;
  onToggleComments: () => void;
  onActive: () => void;
  onUseSound: (sound: any) => void;
  onCountsChange: (videoId: string, patch: Partial<{ likes: number; comments: number; views: number; liked: boolean }>) => void;
  onRefreshPostCounts: (postId: string) => void;
  key?: React.Key;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(!!video?.liked);
  const [isSaved, setIsSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [activeGifts, setActiveGifts] = useState<any[]>([]);
  const [floatingHearts, setFloatingHearts] = useState<any[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const REEL_GIFTS = [
    { id: 'g1', icon: '🎁', price: 500 },
    { id: 'g2', icon: '🧸', price: 100 },
    { id: 'g3', icon: '🧪', price: 300 },
    { id: 'g4', icon: '🎂', price: 490 },
    { id: 'g5', icon: '🏆', price: 490 },
    { id: 'g6', icon: '🌹', price: 50 },
  ];

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
      const response = await fetch(apiUrl('/api/feed/post-like'), {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ userId, postId: reelId })
      });
      if (!response.ok) throw new Error('Failed to like post');
      const data = await response.json().catch(() => null);
      console.log('[ReelsPage] post-like response', { postId: reelId, data });

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
    } catch (err) {
      console.error('[LikeError]', err);
      console.error('[ReelsPage] like API failed, trying supabase fallback:', err);
      try {
        if (nextLiked) {
          const { error: insErr } = await supabase
            .from('likes')
            .insert({ post_id: reelId, user_id: userId });
          if (insErr) throw insErr;

          // Best-effort notification (non-fatal).
          try {
            const notifyRes = await fetch(apiUrl('/api/notifications/from-feed-like'), {
              method: 'POST',
              headers: jsonHeaders,
              body: JSON.stringify({ userId, postId: reelId }),
            });
            await notifyRes.text();
          } catch {
            /* non-fatal */
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
    const userId = user?.id || MOCK_USER.id;
    const giftToSend =
      selectedGiftId ? REEL_GIFTS.find((g) => g.id === selectedGiftId) : undefined;
    const finalGift = giftToSend || REEL_GIFTS[0];

    console.log('[ReelsPage] gift send', {
      reelId,
      userId,
      giftId: finalGift?.id,
      giftPrice: finalGift?.price
    });

    // Local animation/UX fix (this page didn't previously wire any gift logic).
    // This restores click functionality without changing layout.
    setActiveGifts((prev) => [
      ...prev,
      {
        id: Date.now(),
        reelId,
        senderId: userId,
        giftId: finalGift?.id,
        coins: finalGift?.price
      }
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

  const togglePlay = useCallback(async () => {
    if (videoRef.current) {
      try {
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        } else {
          await videoRef.current.play();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error("Video play failed:", error);
      }
    }
  }, [isPlaying]);

  const handleVideoSurfaceTap = useCallback(() => {
    if (isTouchDevice) {
      if (!hasUserInteracted) {
        onUserInteract();
      }
      const el = videoRef.current;
      if (el) {
        el.muted = false;
        void el.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      return;
    }
    if (!hasUserInteracted) {
      onUserInteract();
      const el = videoRef.current;
      if (el) {
        el.muted = false;
        void el.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      return;
    }
    void togglePlay();
  }, [hasUserInteracted, onUserInteract, togglePlay, isTouchDevice]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            onActive();
            fetch(apiUrl(`/api/reels/${video.id}/view`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user?.id })
            })
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data && typeof data.views === 'number') {
                  onCountsChange(video.id, { views: data.views });
                }
              })
              .catch(() => {});
            try {
              if (videoRef.current) {
                await videoRef.current.play();
                setIsPlaying(true);
              }
            } catch (error) {
              setIsPlaying(false);
            }
          } else {
            videoRef.current?.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.75 }
    );

    if (videoRef.current) observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [onActive, onCountsChange, user?.id, video.id, hasUserInteracted]);

  return (
    <div className="relative h-full w-full bg-black overflow-hidden group flex items-center justify-center">
      {/* Blurred background using the same video */}
      <video
        src={(video as any).videoUrl || video.url}
        className="absolute inset-0 h-full w-full object-cover blur-[20px] scale-[1.2] z-0 [will-change:transform]"
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Video Player */}
      <video
        key={video.id}
        ref={(el) => {
          videoRef.current = el;
          onVideoElementRef(String(video.id), el);
        }}
        src={(video as any).videoUrl || video.url}
        className="relative z-[1] h-full w-full object-contain [will-change:transform]"
        controls={!isTouchDevice}
        loop
        defaultMuted
        autoPlay
        playsInline
        preload="metadata"
        onClick={handleVideoSurfaceTap}
      />

      {!hasUserInteracted && !isTouchDevice && (
        <button
          type="button"
          className="absolute left-1/2 top-1/2 z-[12] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3 py-2 text-[12px] font-bold text-white shadow-sm backdrop-blur-md touch-manipulation"
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

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

      {/* LIVE Badge */}
      {video.isLive && (
        <div className="absolute top-20 left-6 z-10 flex flex-col gap-1">
          <div className="flex items-center gap-2 bg-pink-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest text-white w-fit">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-md">{video.views || video.viewerCount || 0} views</span>
        </div>
      )}

      {/* Right Action Bar */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 z-10">
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
          onClick={() => setIsSaved(!isSaved)}
        />
        <ActionButton 
          icon={<Gift className="text-orange-400" size={30} />} 
          label="Send Gift" 
          onClick={() => {
            // Keep the existing scroll affordance, but also perform the send action.
            const el = document.getElementById('gift-selection-row');
            el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            void handleSendGift();
          }}
        />
        <ActionButton 
          icon={<Camera className="text-white" size={30} />} 
          label="" 
        />
      </div>

      {/* Bottom Content Overlay */}
      <div className="absolute bottom-12 sm:bottom-24 left-6 right-20 z-10">
        <div className="flex flex-col gap-3">
          {/* Product Integration */}
          {video.id === 'v1' && (
            <div className="flex flex-col gap-1">
              <span className="text-white font-bold text-xs drop-shadow-md">PS5 Wireless Headset 5K Coins</span>
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex items-center justify-between gap-4 max-w-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white rounded-xl overflow-hidden flex-shrink-0">
                    <img src="https://picsum.photos/seed/headset/100/100" alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-xs">PS5 Wireless Headset</h4>
                    <div className="flex items-center gap-1 text-yellow-500 text-[10px] font-black">
                      <Coins size={10} />
                      5K Coins
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="bg-white/20 px-2 py-0.5 rounded text-[8px] font-black text-white uppercase tracking-widest">70%</div>
                  <button className="bg-gradient-to-r from-orange-400 to-yellow-500 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20">
                    BUY NOW
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden shadow-xl">
              <img src={video.user.avatar} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white font-black text-sm tracking-tight">@{video.user.username}</span>
                <BadgeCheck size={14} className="text-indigo-400 fill-indigo-400/20" />
              </div>
              <p className="text-white text-xs font-medium mt-0.5">{video.caption.split('#')[0]}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {video.tags?.map((tag: string) => (
              <span key={tag} className="text-white font-bold text-xs hover:text-indigo-400 transition-colors cursor-pointer">#{(tag || '').toLowerCase()}</span>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md w-fit px-3 py-1.5 rounded-full border border-white/10">
            <Music size={12} className="text-white animate-spin-slow" />
              <span className="text-white text-[10px] font-bold">
                {video.sound?.title || 'Original Audio'}
              </span>
          </div>
        </div>
      </div>

      {/* Tablet Gift Selection Row */}
      <div id="gift-selection-row" className="hidden lg:flex absolute bottom-6 left-6 right-6 h-16 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl items-center justify-between px-6 z-10">
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
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">50 Coins</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-yellow-500" />
            <span className="text-white font-black text-sm">824</span>
          </div>
          <button className="bg-white/10 p-2 rounded-full text-white hover:bg-white/20 transition-colors">
            <Plus size={18} />
          </button>
        </div>
      </div>

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

      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)}
        onAddStory={() => {
          setIsShareModalOpen(false);
          setIsStoryEditorOpen(true);
        }}
        postUrl={`${window.location.origin}/reels?video=${video.id}`}
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
            {((video as any).video_url || video.url) ? (
              <video
                src={(video as any).video_url || video.url}
                muted
                autoPlay
                loop
                playsInline
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                preload="metadata"
              />
            ) : (
              <ResponsiveImage
                src={video.thumbnail}
                alt=""
                width={400}
                height={711}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full overflow-hidden border border-white/20">
                <img src={video.user.avatar} alt="" className="w-full h-full object-cover" />
              </div>
              <span className="text-white text-[8px] font-bold">@{video.user.username}</span>
            </div>
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <Zap size={8} className="text-white" />
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
            {((video as any).video_url || video.url) ? (
              <video
                src={(video as any).video_url || video.url}
                muted
                autoPlay
                loop
                playsInline
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                preload="metadata"
              />
            ) : (
              <ResponsiveImage
                src={video.thumbnail}
                alt=""
                width={300}
                height={533}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            )}
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
        const { data, error } = await supabase
          .from('comments')
          .select('id, post_id, user_id, content, created_at')
          .eq('post_id', postId)
          .order('created_at', { ascending: true });
        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((c: any) => c.user_id).filter(Boolean)));
        let profilesMap: Record<string, any> = {};
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesErr } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds);
          if (profilesErr) {
            console.error('Failed to fetch comment profiles:', profilesErr);
          } else {
            profilesMap = (profilesData || []).reduce((acc: any, p: any) => {
              acc[String(p.id)] = p;
              return acc;
            }, {});
          }
        }

        setComments((data || []).map((c: any) => ({
          id: c.id,
          user: resolveProfileUsername(profilesMap[String(c.user_id)]?.username),
          text: c.content,
          avatar: profilesMap[String(c.user_id)]?.avatar_url || `https://picsum.photos/seed/${c.user_id}/100/100`,
          time: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now',
          likes: '0',
        })));
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
      const commentRes = await fetch(apiUrl('/api/feed/post-comment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          postId,
          content: text,
        })
      });
      let inserted: any = null;
      if (commentRes.ok) {
        const payload = await commentRes.json().catch(() => ({}));
        inserted = payload?.comment ?? null;
      }

      // Fallback: direct supabase insert + non-fatal notifications (same pattern as Home).
      if (!inserted && !commentRes.ok) {
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
          await fetch(apiUrl('/api/notifications/from-feed-comment'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              postId,
              commentId: inserted?.id,
            }),
          });
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

      // Optimistic UI append so the new comment shows immediately.
      if (inserted?.id) {
        setComments((prev) => [
          {
            id: inserted.id,
            user: resolveProfileUsername(profile?.username),
            text: inserted.content,
            avatar: profile?.avatar_url || MOCK_USER.avatar,
            time: 'now',
            likes: '0',
          },
          ...(Array.isArray(prev) ? prev : []),
        ]);
      }

      // Refresh comments list.
      const { data: freshData, error: freshErr } = await supabase
        .from('comments')
        .select('id, post_id, user_id, content, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (freshErr) throw freshErr;

      const freshUserIds = Array.from(new Set((freshData || []).map((c: any) => c.user_id).filter(Boolean)));
      let freshProfilesMap: Record<string, any> = {};
      if (freshUserIds.length > 0) {
        const { data: freshProfilesData, error: freshProfilesErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', freshUserIds);
        if (!freshProfilesErr) {
          freshProfilesMap = (freshProfilesData || []).reduce((acc: any, p: any) => {
            acc[String(p.id)] = p;
            return acc;
          }, {});
        }
      }

      setComments((freshData || []).map((c: any) => ({
        id: c.id,
        user: resolveProfileUsername(freshProfilesMap[String(c.user_id)]?.username),
        text: c.content,
        avatar: freshProfilesMap[String(c.user_id)]?.avatar_url || `https://picsum.photos/seed/${c.user_id}/100/100`,
        time: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now',
        likes: '0',
      })));

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
            <ResponsiveImage src={comment.avatar} alt="" width={40} height={40} className="w-8 h-8 rounded-full object-cover border border-white/10" />
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

function BoostModal({ onClose, video }: { onClose: () => void; video: any }) {
  const [isBoosting, setIsBoosting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleBoost = () => {
    setIsBoosting(true);
    // Simulate API call
    setTimeout(() => {
      setIsBoosting(false);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    }, 1500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 w-full max-w-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-6 text-center"
      >
        {!success ? (
          <>
            <div className="w-20 h-20 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap size={40} className="text-indigo-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Boost this Reel?</h3>
            <p className="text-gray-400 text-sm mb-8">
              Reach up to 5,000 more people and increase your visibility in the feed.
            </p>
            
            <div className="bg-white/5 rounded-2xl p-4 mb-8 flex items-center justify-between border border-white/5">
              <div className="flex items-center gap-2">
                <Coins className="text-yellow-500" size={20} />
                <span className="text-white font-bold">Cost</span>
              </div>
              <span className="text-yellow-500 font-black text-lg">500 Coins</span>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={isBoosting}
                onClick={handleBoost}
                className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                {isBoosting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </>
        ) : (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="py-8"
          >
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="text-green-500 text-4xl">✓</div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Reel Boosted!</h3>
            <p className="text-gray-400 text-sm">
              Your reel is now being promoted to more users.
            </p>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ActionButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string | number; onClick?: () => void; active?: boolean }) {
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

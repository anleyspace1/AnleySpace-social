import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import {
  Plus,
  Video,
  Image as ImageIcon,
  Smile,
  MoreHorizontal,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ChevronRight,
  TrendingUp,
  Users,
  ShoppingBag,
  Home,
  User,
  X,
  ChevronLeft,
  Radio,
  Edit2,
  Trash2,
  Flag,
  ExternalLink,
  Send,
  CheckCircle2,
  Circle,
  ListTodo,
  GripVertical
} from 'lucide-react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/apiOrigin';
import { fetchActiveStories, filterActiveStories } from '../lib/activeStories';
import { MOCK_USER } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from '../components/ShareModal';
import StoryEditor from '../components/StoryEditor';
import { ResponsiveImage } from '../components/ResponsiveImage';

const resolveProfileUsername = (username?: string | null) => {
  const value = (username || '').trim();
  if (!value) return 'User';
  return value;
};

/** Inline hashtags as clickable navigation (same route as TrendingSection). */
function renderTextWithHashtags(
  text: string,
  navigate: (to: string) => void
) {
  const raw = String(text ?? '');
  const parts = raw.split(/(#[^\s#]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#') && part.length > 1) {
      const tag = part.slice(1);
      return (
        <button
          key={`h-${i}-${tag}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            console.log('[PostItem] hashtag click', tag);
            navigate(`/hashtag/${encodeURIComponent(tag)}`);
          }}
          className="inline p-0 m-0 border-0 bg-transparent cursor-pointer hover:underline font-inherit text-inherit align-baseline"
        >
          {part}
        </button>
      );
    }
    return <span key={`t-${i}`}>{part}</span>;
  });
}

// Helper: Double tap detection and heart animation overlay
function useDoubleTap(onDoubleTap: () => void, delay = 300) {
  // Returns object: {onTouchStart, onClick, ...} for props spread
  const lastTap = useRef<number | null>(null);

  const handler = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < delay) {
      onDoubleTap();
      lastTap.current = null;
    } else {
      lastTap.current = now;
    }
  };

  return {
    onClick: handler,
    onTouchStart: handler,
  };
}

function HeartOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="heart"
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1.4, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          <Heart size={88} className="fill-red-500/90 text-red-500" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Helper: Fetch all users' stories info for avatar ring (same data as fetchActiveStories)
async function fetchActiveStoriesMap(): Promise<Record<string, any[]>> {
  try {
    const flat = await fetchActiveStories();
    return flat.reduce((acc: Record<string, any[]>, story: any) => {
      const uid = story.user_id || story.username;
      if (!uid) return acc;
      if (!acc[uid]) acc[uid] = [];
      acc[uid].push(story);
      return acc;
    }, {});
  } catch (_err) {
    return {};
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="w-full lg:max-w-3xl lg:mx-auto space-y-4 lg:space-y-6">
      {category && (
        <div className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl shadow-sm border-b lg:border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">Category:</span>
            <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              {category}
            </span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors font-bold"
          >
            Clear Filter
          </button>
        </div>
      )}
      <Stories />
      <CreatePost onGoLive={() => navigate('/live?host=true')} onPostCreated={handleRefresh} />
      <Feed category={category} refreshKey={refreshKey} />
    </div>
  );
}

// --------- Stories with non-expired, avatar ring, open story on avatar ----------
function Stories() {
  const [seenUsers, setSeenUsers] = useState<string[]>([]);
  const [storyUploading, setStoryUploading] = useState(false);
  const [realStories, setRealStories] = useState<any[]>([]);
  const [avatarStoriesMap, setAvatarStoriesMap] = useState<Record<string, any[]>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const seenHydratedRef = React.useRef(false);
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('seenUsers') || localStorage.getItem('seenStories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSeenUsers([...new Set(parsed.map(String))]);
      }
    } catch {
      /* ignore */
    }
    seenHydratedRef.current = true;
  }, [location.pathname]);

  useEffect(() => {
    if (!seenHydratedRef.current) return;
    localStorage.setItem('seenUsers', JSON.stringify(seenUsers));
  }, [seenUsers]);

  // Fetch stories + stories per user
  useEffect(() => {
    fetchStories();
    fetchActiveStoriesMap().then((map) => setAvatarStoriesMap(map));
  }, []);

  const fetchStories = async () => {
    try {
      const data = await fetchActiveStories();
      setRealStories(data);
    } catch (err) {
      console.error('Error fetching stories:', err);
    }
  };

  const DEFAULT_STORY_THUMB = '/default-story.png';

  const isValidStoryImgSrc = (v: unknown): v is string => {
    if (typeof v !== 'string') return false;
    const u = v.trim();
    if (!u) return false;
    return /^https?:\/\//i.test(u) || u.startsWith('/') || u.startsWith('data:');
  };

  /** Prefer API media_url, then image_url; never pass empty/invalid strings to img. */
  const stories = filterActiveStories(realStories).map((s) => {
    const mediaRaw = s.media_url;
    const imageRaw = s.image_url;
    const mediaTrimmed =
      typeof mediaRaw === 'string' && mediaRaw.trim() ? mediaRaw.trim() : '';
    const imageTrimmed =
      typeof imageRaw === 'string' && imageRaw.trim() ? imageRaw.trim() : '';
    const resolvedMedia =
      (mediaTrimmed && isValidStoryImgSrc(mediaTrimmed) ? mediaTrimmed : '') ||
      (imageTrimmed && isValidStoryImgSrc(imageTrimmed) ? imageTrimmed : '') ||
      null;
    const imageUrlStr =
      typeof s.image_url === 'string' && s.image_url.trim() ? s.image_url.trim() : '';
    const mediaUrlStr =
      typeof s.media_url === 'string' && s.media_url.trim() ? s.media_url.trim() : '';
    return {
      id: s.id,
      user: s.username,
      avatar: s.avatar,
      image: s.image_url || s.media_url,
      media_url: resolvedMedia,
      image_url: imageUrlStr,
      media_url_raw: mediaUrlStr,
      media_type: s.media_type,
      user_id: s.user_id,
      expires_at: s.expires_at,
    };
  });

  const displayStories = (() => {
    const result: any[] = [];
    const seenUserKey = new Set<string>();
    for (const s of stories as any[]) {
      const uid = (s.user_id as string | undefined)?.trim();
      if (!uid) {
        const fallbackKey = `nuid:${s.user || (s as any).username || s.id}`;
        if (!seenUserKey.has(fallbackKey)) {
          seenUserKey.add(fallbackKey);
          result.push(s);
        }
        continue;
      }
      if (!seenUserKey.has(uid)) {
        seenUserKey.add(uid);
        result.push(s);
      }
    }
    return result;
  })();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[trace:story-upload] 1 handleFileChange entered');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user?.id) {
      alert('You must be logged in');
      return;
    }

    const username =
      (user as { username?: string }).username ||
      user.user_metadata?.username ||
      user.email?.split('@')[0];

    if (!username) {
      alert('No username found');
      return;
    }

    const avatar =
      (user as { avatar_url?: string }).avatar_url ||
      user.user_metadata?.avatar_url ||
      '';

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('userId', user.id);
    formData.append('username', username);
    formData.append('avatar', avatar);

    setStoryUploading(true);
    try {
      console.log('[trace:story-upload] 2 FormData ready, about to fetch POST /api/stories');
      console.log('🚀 UPLOAD START');
      console.log('FINAL FRONTEND CHECK:', {
        hasFile: !!file,
        userId: user?.id,
        username,
      });

      const res = await fetch(apiUrl('/api/stories'), {
        method: 'POST',
        body: formData,
      });

      console.log('[trace:story-upload] 3 fetch resolved, status=', res.status, 'ok=', res.ok);
      console.log('STATUS:', res.status);

      const text = await res.text();
      let data: { ok?: boolean; error?: string } | undefined;
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        console.error('UPLOAD: non-JSON response body:', text.slice(0, 500));
        throw new Error('Invalid server response');
      }
      console.log('RESPONSE:', data);

      if (!res.ok || data?.ok === false) {
        console.log(
          '[trace:story-upload] 4 client will throw (bad response)',
          { resOk: res.ok, dataOk: data?.ok, serverError: data?.error }
        );
        throw new Error(data?.error || 'Upload failed');
      }

      console.log('[trace:story-upload] 5 success path, refreshing stories');
      console.log('✅ UPLOAD SUCCESS');

      await fetchStories();
      await fetchActiveStoriesMap().then((map) => setAvatarStoriesMap(map));
    } catch (err) {
      console.log('[trace:story-upload] 6 catch (alert path)', err);
      console.error('❌ UPLOAD ERROR:', err);
      alert('Failed to upload story. Please try again.');
    } finally {
      console.log('[trace:story-upload] 7 finally: clearing uploading state + input');
      setStoryUploading(false);
      e.currentTarget.value = '';
    }
  };

  const navigate = useNavigate();

  // If clicking story avatar, navigate to /story/:id (user_id or username for StoryPage)
  function handleAvatarClick(story: any) {
    const userId = typeof story.user_id === 'string' ? story.user_id.trim() : '';
    if (userId) {
      navigate(`/story/${encodeURIComponent(userId)}`, {
        state: { userId },
      });
    }
  }

  // Show story ring for active stories per user
  function hasActiveStoryForUser(usernameOrId: string) {
    return (
      avatarStoriesMap[usernameOrId] &&
      avatarStoriesMap[usernameOrId].length > 0
    );
  }

  // Compose user identifier (id/username) for mapping with fetched avatars
  function extractUserIdOrUsername(story: any) {
    return story.user_id || story.user || story.username;
  }

  function storyThumbnailSrc(story: any): string {
    const primary = story.media_url;
    if (primary && typeof primary === 'string' && isValidStoryImgSrc(primary)) {
      return primary.trim();
    }
    const fromImage = story.image;
    if (fromImage && typeof fromImage === 'string' && isValidStoryImgSrc(fromImage)) {
      return fromImage.trim();
    }
    return DEFAULT_STORY_THUMB;
  }

  /** Thumbnail img src: prefer image_url then media_url; never use raw video URL in <img>. */
  function storyRowThumbSrc(story: any): string {
    const imageUrl = typeof story.image_url === 'string' ? story.image_url : '';
    const mediaRaw = typeof story.media_url_raw === 'string' ? story.media_url_raw : '';
    const ordered = (imageUrl.trim() || mediaRaw.trim());
    if (ordered && /\.(mp4|webm|ogg)$/i.test(ordered)) {
      const av = story.avatar;
      if (typeof av === 'string' && isValidStoryImgSrc(av)) return av.trim();
      return DEFAULT_STORY_THUMB;
    }
    if (ordered && isValidStoryImgSrc(ordered)) return ordered.trim();
    return storyThumbnailSrc(story);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="font-bold text-sm">Stories</h3>
        <button className="text-gray-400"><MoreHorizontal size={18} /></button>
      </div>
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
        {/* Add Story Button */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,video/*"
          onChange={handleFileChange}
          disabled={storyUploading}
        />
        <button
          type="button"
          onClick={() => !storyUploading && fileInputRef.current?.click()}
          disabled={storyUploading}
          className="flex flex-col items-center gap-1 flex-shrink-0 disabled:opacity-60"
        >
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:border-indigo-500 hover:text-indigo-500 transition-all group">
            {storyUploading ? (
              <span className="text-[10px] font-bold text-indigo-500">…</span>
            ) : (
              <Plus size={18} className="group-hover:scale-110 transition-transform" />
            )}
          </div>
          <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400">
            {storyUploading ? 'Uploading…' : 'Your Story'}
          </span>
        </button>

        {/* Story Items */}
        {displayStories.map((story) => {
          console.log('Story:', story);
          const userKey = extractUserIdOrUsername(story);
          const showRing = hasActiveStoryForUser(userKey);
          const isSeen = story.user_id && seenUsers.includes(String(story.user_id));
          const isVideo =
            story.media_type === 'video' ||
            !!(typeof story.media_url_raw === 'string' &&
              story.media_url_raw.match(/\.(mp4|webm|ogg)$/i));
          const thumbSrc = storyRowThumbSrc(story);
          return (
            <button
              key={story.id}
              onClick={() => handleAvatarClick(story)}
              className="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div className={cn(
                'w-16 h-16 rounded-full p-[2px]',
                showRing && (isSeen ? 'ring-2 ring-gray-300' : 'ring-2 ring-pink-500')
              )}>
                <div className="w-full h-full rounded-full border-2 border-white dark:border-black overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <div className="w-full h-full rounded-full overflow-hidden">
                    <div className="relative w-full h-full">
                      <img
                        src={thumbSrc}
                        alt=""
                        className="w-full h-full object-cover rounded-full"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src.includes('default-story.png')) return;
                          el.src = DEFAULT_STORY_THUMB;
                        }}
                      />
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span style={{ fontSize: '18px', color: 'white' }}>▶</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate w-14 sm:w-16 text-center">{story.user}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreatePost({ onGoLive, onPostCreated }: { onGoLive: () => void; onPostCreated?: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <img src={profile?.avatar_url || MOCK_USER.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-500 text-left px-4 py-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm truncate"
            >
              What's on your mind, {profile?.display_name?.split(' ')[0] || 'friend'}?
            </button>
          </div>
          <button
            onClick={onGoLive}
            className="bg-red-500 text-white px-4 py-2.5 rounded-full hover:bg-red-600 transition-all flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-red-500/20 whitespace-nowrap"
          >
            <Radio size={18} className="animate-pulse" />
            <span>Go Live</span>
          </button>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 overflow-x-auto no-scrollbar gap-2">
          <PostAction onClick={onGoLive} icon={<Video className="text-red-500" />} label="Live" />
          <PostAction onClick={() => setIsModalOpen(true)} icon={<ImageIcon className="text-green-500" />} label="Photo/Video" />
          <PostAction onClick={() => setIsModalOpen(true)} icon={<Smile className="text-yellow-500" />} label="Feeling/Activity" />
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <CreatePostModal
            onClose={() => setIsModalOpen(false)}
            onPostCreated={onPostCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function CreatePostModal({
  onClose,
  onPostCreated,
}: {
  onClose: () => void;
  onPostCreated?: () => void;
}) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (!user) {
      alert('Please log in to post.');
      return;
    }
    if (!content.trim() && !imageUrl.trim() && !videoUrl.trim()) return;

    setBusy(true);
    try {
      const payload: any = {
        user_id: user.id,
        content: content.trim(),
        image_url: imageUrl.trim() || null,
        video_url: videoUrl.trim() || null,
        category: categoryParam || 'general',
      };

      const { error } = await supabase.from('posts').insert(payload);
      if (error) throw error;

      onClose();
      onPostCreated?.();
    } catch (err: any) {
      console.error('CreatePostModal publish error:', err);
      alert(err?.message || 'Failed to create post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-bold">Create Post</h3>
            <p className="text-xs text-gray-500 mt-1">Share something with your community.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={4}
          />

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Image URL (optional)</label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Video URL (optional)</label>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={publish}
            disabled={busy}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {icon}
      <span className="text-xs font-bold text-gray-500">{label}</span>
    </button>
  );
}

// ---------------- FEED COMPONENTS: video, double-tap, avatar ring, nav ---------
function Feed({ category, refreshKey }: { category?: string | null; refreshKey?: number }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStoriesMap, setUserStoriesMap] = useState<Record<string, any[]>>({});

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });
      console.log('POSTS DATA:', postsData);

      if (postsError) {
        console.error('Error loading posts:', postsError);
        setPosts([]);
        return;
      }

      const basePosts = postsData || [];
      if (basePosts.length === 0) {
        setPosts([]);
        return;
      }

      const userIds = Array.from(new Set(basePosts.map((p: any) => p.user_id).filter(Boolean)));
      let profilesById: Record<string, { id: string; username?: string | null; avatar_url?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profilesRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        if (profilesError) {
          console.error('Error loading profiles for posts:', profilesError);
        } else if (profilesRows) {
          profilesById = profilesRows.reduce((acc: any, row: any) => {
            acc[row.id] = row;
            return acc;
          }, {});
        }
      }

      const postIds = basePosts.map((p: any) => p.id).filter(Boolean);
      let likesByPost: Record<string, number> = {};
      let commentsByPost: Record<string, number> = {};
      let likesMergeOk = false;
      let commentsMergeOk = false;

      if (postIds.length > 0) {
        const { data: likeRows, error: likesAggErr } = await supabase
          .from('likes')
          .select('post_id')
          .in('post_id', postIds);
        if (likesAggErr) {
          console.error('Error loading likes for feed merge:', likesAggErr);
        } else {
          likesMergeOk = true;
          (likeRows || []).forEach((row: { post_id: string }) => {
            likesByPost[row.post_id] = (likesByPost[row.post_id] || 0) + 1;
          });
        }

        const { data: commentRows, error: commentsAggErr } = await supabase
          .from('comments')
          .select('post_id')
          .in('post_id', postIds);
        if (commentsAggErr) {
          console.error('Error loading comments for feed merge:', commentsAggErr);
        } else {
          commentsMergeOk = true;
          (commentRows || []).forEach((row: { post_id: string }) => {
            commentsByPost[row.post_id] = (commentsByPost[row.post_id] || 0) + 1;
          });
        }
      }

      const mappedPosts = basePosts.map((post: any) => {
        const prof = post.user_id ? profilesById[post.user_id] : null;
        const likes_count = likesMergeOk
          ? likesByPost[post.id] ?? 0
          : post.likes_count ?? 0;
        const comments_count = commentsMergeOk
          ? commentsByPost[post.id] ?? 0
          : post.comments_count ?? 0;
        return {
          ...post,
          likes_count,
          comments_count,
          profiles: prof || null,
          username: prof?.username || null,
          avatar_url: prof?.avatar_url || null,
        };
      });

      setPosts(mappedPosts);
    } catch (err) {
      console.error('Error in fetchPosts:', err);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, user?.id]);

  // Subscribe to real-time updates once
  useEffect(() => {
    const channel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        console.log('[Home] realtime posts change -> fetchPosts()');
        fetchPosts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch non-expired story map for all user_ids for avatar ring and navigation
  useEffect(() => {
    fetchActiveStoriesMap().then(setUserStoriesMap);
  }, [refreshKey]);

  const handleDeletePost = async (postId: string, postUserId: string) => {
    console.log('[Feed] handleDeletePost', { postId, postUserId });
    if (!user || user.id !== postUserId) {
      alert('You can only delete your own posts');
      return;
    }

    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        const { error } = await supabase
          .from('posts')
          .delete()
          .eq('id', postId)
          .eq('user_id', user.id);

        if (error) throw error;
        setPosts(posts.filter(p => p.id !== postId));
      } catch (err) {
        console.error('Error deleting post:', err);
        alert('Failed to delete post');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const filteredPosts = posts;

  return (
    <div className="space-y-4 lg:space-y-6 pb-4">
      {filteredPosts.length > 0 ? (
        filteredPosts.map((post, index) => (
          <React.Fragment key={post.id}>
            <PostItem
              post={post}
              index={index}
              onDelete={() => handleDeletePost(post.id, post.user_id)}
              onPostUpdated={(postId, newContent) => {
                setPosts((prev) =>
                  prev.map((p) => (p.id === postId ? { ...p, content: newContent } : p))
                );
              }}
              userStoriesMap={userStoriesMap}
            />
            {index === 0 && (
              <div className="xl:hidden space-y-6">
                <PeopleYouMayKnow />
                <TrendingSection />
              </div>
            )}
          </React.Fragment>
        ))
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-800">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag size={32} className="text-gray-400" />
          </div>
          <h3 className="font-bold text-lg mb-2">No posts found</h3>
          <p className="text-gray-500 text-sm">Be the first to post in this category!</p>
        </div>
      )}
    </div>
  );
}

// -------------- Enhanced PostItem: video, double tap, avatar ring, nav ----------
function PostItem({
  post,
  index = 0,
  onDelete,
  onPostUpdated,
  userStoriesMap = {},
}: {
  post: any;
  index?: number;
  onDelete: () => void;
  onPostUpdated?: (postId: string, newContent: string) => void;
  userStoriesMap?: Record<string, any[]>;
  key?: React.Key;
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  // Double-tap state for heart animation
  const [showHeart, setShowHeart] = useState(false);

  // Video player ref for intersection observer
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /** Prevent overlapping like/comment API calls (avoids aborted requests / race on server). */
  const likeRequestInFlightRef = useRef(false);
  const commentRequestInFlightRef = useRef(false);
  /** Latest handleLike for double-tap (avoids stale closure + duplicate triggers). */
  const handleLikeRef = useRef<() => Promise<void>>(async () => {});

  // Track if post video is visible
  const [videoVisible, setVideoVisible] = useState(false);

  useEffect(() => {
    setEditContent(post.content ?? '');
  }, [post.id, post.content]);

  const postProfile = Array.isArray(post.profiles)
    ? post.profiles[0]
    : post.profiles;

  const displayUsername = postProfile?.username || post.username || (post.user_id ? `user_${String(post.user_id).slice(0, 6)}` : 'User');
  const displayAvatar =
    postProfile?.avatar_url ||
    post.avatar_url ||
    `https://picsum.photos/seed/${post.user_id}/100/100`;

  const imageUrl =
    typeof post.image_url === 'string' ? post.image_url.trim() : post.image_url;
  const videoUrl =
    typeof post.video_url === 'string' ? post.video_url.trim() : post.video_url;

  const postUser = {
    name: displayUsername,
    username: displayUsername,
    avatar: displayAvatar,
    user_id: post.user_id,
    time: post.created_at ? new Date(post.created_at).toLocaleString() : 'Just now',
    isMe: post.user_id === user?.id,
  };

  // Enhanced: username click to /profile/:id
  const handleProfileClick = useCallback(() => {
    if (postUser.user_id) {
      navigate(`/profile/${postUser.user_id}`);
    }
  }, [postUser, navigate]);

  // EXACT same resolution + map key as Stories row (storyTarget chain, not user_id alone)
  const storyUid =
    typeof post.user_id === 'string'
      ? post.user_id.trim()
      : post.user_id != null && post.user_id !== ''
        ? String(post.user_id).trim()
        : '';
  const hasActiveStory = !!(storyUid && userStoriesMap[storyUid]?.length);

  const handleAvatarClick = useCallback(() => {
    if (hasActiveStory && storyUid) {
      navigate(`/story/${encodeURIComponent(storyUid)}`, {
        state: { userId: storyUid },
      });
    } else if (postUser.user_id) {
      navigate(`/profile/${postUser.user_id}`);
    }
  }, [hasActiveStory, storyUid, postUser.user_id, navigate]);

  // Double tap to like — call latest handler via ref (avoids stale closure + duplicate in-flight calls)
  const handleDoubleTap = useCallback(() => {
    setShowHeart(true);
    if (!isLiked) void handleLikeRef.current();
    setTimeout(() => setShowHeart(false), 800);
  }, [isLiked]);

  // Intersection observer for video autoplay (desktop/mobile)
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    const node = videoRef.current;
    let pausedByObserver = false;

    const handler = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        setVideoVisible(true);
        node.play().catch(() => {}); // suppress
        pausedByObserver = false;
      } else {
        setVideoVisible(false);
        node.pause();
        pausedByObserver = true;
      }
    };

    const observer = new window.IntersectionObserver(handler, {
      threshold: 0.65,
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (pausedByObserver) node.pause();
    };
  }, [videoUrl, videoRef]);

  // Keep like/saved/counts sync separate from comments toggle — re-running checkIfLiked when
  // opening comments used to overwrite optimistic isLiked when RLS blocked anon reads.
  useEffect(() => {
    checkIfSaved();
    fetchLikesCount();
    fetchCommentsCount();
    if (user) {
      checkIfLiked();
    }
  }, [post.id, post.likes_count, post.comments_count, user]);

  useEffect(() => {
    if (showComments) {
      fetchComments();
    }
  }, [showComments, post.id]);

  const fetchLikesCount = async () => {
    if (!post?.id) return;
    const { count, error } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);

    if (error) {
      console.error('[PostItem] fetchLikesCount', error);
      return;
    }
    if (count !== null) {
      setLikesCount(count);
    }
  };

  const fetchCommentsCount = async () => {
    if (!post?.id) return;
    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);

    if (error) {
      console.error('[PostItem] fetchCommentsCount', error);
      return;
    }
    if (count !== null) {
      setCommentsCount(count);
    }
  };

  const checkIfLiked = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', post.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      // Don't overwrite UI when RLS/network prevents reading likes (would flash "unliked").
      console.warn('[PostItem] checkIfLiked:', error.message);
      return;
    }
    setIsLiked(!!data);
  };

  const checkIfSaved = async () => {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (authErr) {
      console.error('[PostItem] checkIfSaved getUser', authErr);
      setIsSaved(false);
      return;
    }
    if (!userId || !post?.id) {
      setIsSaved(false);
      return;
    }
    const { data, error } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', post.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[PostItem] checkIfSaved query', error);
      setIsSaved(false);
      return;
    }
    setIsSaved(!!data);
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('id, post_id, user_id, content, created_at')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((c: any) => c.user_id).filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        if (profilesError) {
          console.error('Error fetching comment profiles:', profilesError);
        } else {
          profilesMap = (profilesData || []).reduce((acc: any, p: any) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }
      }

      const formattedComments = (data || []).map((c: any) => ({
        id: c.id,
        user: resolveProfileUsername(profilesMap[c.user_id]?.username),
        text: c.content,
        avatar: profilesMap[c.user_id]?.avatar_url || `https://picsum.photos/seed/${c.user_id}/100/100`,
        time: new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));

      setComments(formattedComments);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLike = async () => {
    if (!user) {
      alert('Please login to like posts');
      return;
    }
    if (likeRequestInFlightRef.current) {
      return;
    }
    console.log('LIKE action:', post.id, user.id);
    likeRequestInFlightRef.current = true;

    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikesCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    const jsonHeaders = { 'Content-Type': 'application/json' } as const;
    const likePayload = JSON.stringify({ userId: user.id, postId: post.id });

    try {
      const apiRes = await fetch(apiUrl('/api/feed/post-like'), {
        method: 'POST',
        headers: jsonHeaders,
        body: likePayload,
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        // Server may return only { success: true }; keep optimistic isLiked/likesCount unless server sends fields.
        if (typeof data.liked === 'boolean') setIsLiked(data.liked);
        if (typeof data.likesCount === 'number') setLikesCount(data.likesCount);
        return;
      }
      // Fallback: direct Supabase (e.g. server without service role / feed routes unavailable)
      if (wasLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({
            post_id: post.id,
            user_id: user.id,
          });
        if (error) throw error;
        try {
          const notifyRes = await fetch(apiUrl('/api/notifications/from-feed-like'), {
            method: 'POST',
            headers: jsonHeaders,
            body: likePayload,
          });
          await notifyRes.text();
        } catch {
          /* non-fatal */
        }
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      setIsLiked(wasLiked);
      setLikesCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } finally {
      likeRequestInFlightRef.current = false;
    }
  };

  handleLikeRef.current = handleLike;

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Please login to comment');
      return;
    }
    if (!newComment.trim()) return;
    if (commentRequestInFlightRef.current) {
      return;
    }
    console.log('COMMENT action:', post.id, user.id);
    commentRequestInFlightRef.current = true;

    const commentText = newComment.trim();
    setNewComment('');

    const jsonHeaders = { 'Content-Type': 'application/json' } as const;

    try {
      const commentPayload = JSON.stringify({
        userId: user.id,
        postId: post.id,
        content: commentText,
      });
      const apiRes = await fetch(apiUrl('/api/feed/post-comment'), {
        method: 'POST',
        headers: jsonHeaders,
        body: commentPayload,
      });
      let data: { id: string; user_id: string; content: string; created_at?: string } | null = null;
      if (apiRes.ok) {
        const payload = await apiRes.json();
        data = payload?.comment ?? null;
      }
      if (!data) {
        const { data: ins, error } = await supabase
          .from('comments')
          .insert({
            post_id: post.id,
            user_id: user.id,
            content: commentText,
            created_at: new Date(),
          })
          .select('id, user_id, content, created_at')
          .single();
        if (error) throw error;
        data = ins;
        try {
          const notifyPayload = JSON.stringify({
            userId: user.id,
            postId: post.id,
            commentId: ins.id,
          });
          const notifyRes = await fetch(apiUrl('/api/notifications/from-feed-comment'), {
            method: 'POST',
            headers: jsonHeaders,
            body: notifyPayload,
          });
          await notifyRes.text();
        } catch {
          /* non-fatal */
        }
      }

      const newCommentObj = {
        id: data.id,
        user: resolveProfileUsername(profile?.username),
        text: data.content,
        avatar: profile?.avatar_url || `https://picsum.photos/seed/${data.user_id}/100/100`,
        time: 'now',
      };

      setComments([...comments, newCommentObj]);
      setCommentsCount((prev) => prev + 1);
    } catch (err) {
      console.error('Error adding comment:', err);
      setNewComment(commentText);
      alert('Failed to add comment');
    } finally {
      commentRequestInFlightRef.current = false;
    }
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        alert('Link copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
      });
  };

  const handleSaveEdit = async () => {
    if (!user || user.id !== post.user_id) return;
    if (!editContent.trim()) return;

    try {
      console.log('[PostItem] handleSaveEdit', {
        postId: post.id,
        userId: user.id,
        postUserId: post.user_id,
      });
      const { data, error } = await supabase
        .from('posts')
        .update({ content: editContent.trim() })
        .eq('id', post.id)
        .eq('user_id', user.id)
        .select('id, content')
        .maybeSingle();

      console.log('[PostItem] handleSaveEdit supabase response', { data, error });
      if (error) throw error;
      if (!data) {
        console.error('[PostItem] update affected 0 rows (RLS or id mismatch)', {
          postId: post.id,
          userId: user.id,
          postUserId: post.user_id,
        });
        alert('Failed to update post (no rows updated). Check you own this post and RLS allows UPDATE.');
        return;
      }
      onPostUpdated?.(post.id, data.content ?? editContent.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating post:', err);
      alert('Failed to update post');
    }
  };

  const handleSaveToggle = async () => {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (authErr) {
      console.error('[PostItem] handleSaveToggle getUser failed', authErr);
      return;
    }
    if (!userId) {
      console.error('[PostItem] handleSaveToggle: no authenticated user id');
      alert('Please login to save posts');
      return;
    }
    if (!post?.id) {
      console.error('[PostItem] handleSaveToggle: post_id is missing', { post });
      return;
    }

    const wasSaved = isSaved;
    console.log('SAVE action:', post.id, userId);
    console.log('[PostItem] handleSaveToggle', {
      postId: post.id,
      userId,
      wasSaved,
    });

    if (wasSaved) {
      const { error } = await supabase
        .from('saved_posts')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', userId);

      if (error) {
        console.error('[PostItem] saved_posts delete failed', error);
        return;
      }
      console.log('[PostItem] saved_posts delete success', { post_id: post.id, user_id: userId });
      setIsSaved(false);
      return;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('saved_posts')
      .insert({
        post_id: post.id,
        user_id: userId,
      })
      .select('post_id, user_id')
      .maybeSingle();

    if (insertErr) {
      console.error('[PostItem] saved_posts insert failed', insertErr);
      return;
    }
    if (inserted) {
      console.log('[PostItem] saved_posts insert success', inserted);
    } else {
      console.warn(
        '[PostItem] saved_posts insert OK (no error) but .select returned no row — allow SELECT on saved_posts for returning rows, or verify row in dashboard',
        { post_id: post.id, user_id: userId }
      );
    }
    setIsSaved(true);
  };

  const formatCount = (count: number) => {
    return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count;
  };

  // Prepare double tap handlers for media only
  const doubleTapHandlers = useDoubleTap(handleDoubleTap);

  // Video click navigates to reels with selected video context.
  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const reelId = (post as any).reel_id || post.id;
    console.log('[Home] navigate to reels', {
      reelId,
      index,
      videoUrl
    });
    navigate('/reels', {
      state: {
        videoId: reelId,
        postId: post.id,
        videoUrl,
        index,
        thumbnail: imageUrl || videoUrl,
        caption: post.content,
        username: postUser.username,
        avatar: postUser.avatar
      }
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* AVATAR with story ring + navigation */}
          <button
            onClick={handleAvatarClick}
            className={cn(
              "w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800 overflow-hidden hover:opacity-80 transition-opacity relative flex-shrink-0",
              hasActiveStory && "ring-2 ring-yellow-400 ring-offset-2"
            )}
            style={
              hasActiveStory
                ? { boxShadow: '0 0 0 2px #fff, 0 0 0 6px #facc15' }
                : undefined
            }
            tabIndex={0}
          >
            <img
              src={postUser.avatar}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </button>
          <div>
            {/* USERNAME NAVIGATION */}
            <button
              onClick={handleProfileClick}
              className="font-bold text-sm hover:underline hover:text-indigo-600 transition-colors block text-left"
            >
              {postUser.name}
            </button>
            <span className="text-[10px] text-gray-400">{postUser.time}</span>
          </div>
        </div>
        <PostMenu
          isMe={postUser.isMe}
          onDelete={onDelete}
          onEdit={() => setIsEditing(true)}
          onReport={() => alert('Post reported. Thank you for keeping our community safe.')}
          onShare={handleShare}
          onCopyLink={handleCopyLink}
        />
      </div>

      <div className="px-4 pb-4">
        {isEditing ? (
          <div className="space-y-3 mb-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-gray-800 dark:text-gray-200"
              placeholder="What's on your mind?"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(post.content);
                }}
                className="px-4 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm mb-4">{renderTextWithHashtags(post.content ?? '', navigate)}</p>
        )}
      </div>

      {(videoUrl || imageUrl) && (
        <div className="px-0 relative">
          <div className="relative overflow-hidden bg-gray-100 dark:bg-gray-800 border-y lg:border lg:rounded-2xl border-gray-100 dark:border-gray-800 aspect-video flex items-center justify-center w-full">
            {/* Double tap overlay for video or image */}
            {videoUrl ? (
              // Video: autoplay/muted/loop, click = /reels/:id, double tap = like + heart
              <div className="relative w-full h-full flex items-center justify-center select-none">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-contain bg-black"
                  style={{ cursor: "pointer", background: "#000" }}
                  {...doubleTapHandlers}
                  onClick={(e) => {
                    if (e.detail === 1) {
                      // Wait: will single tap become double? Defer navigation if double tap
                      setTimeout(() => {
                        if (!showHeart) handleVideoClick(e);
                      }, 300); // match double tap delay
                    }
                  }}
                />
                <HeartOverlay show={showHeart} />
              </div>
            ) : (
              // Image: use raw URL so Supabase storage works without transform API
              <div className="relative w-full h-full flex items-center justify-center select-none">
                <img
                  src={imageUrl || ''}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  {...doubleTapHandlers}
                />
                <HeartOverlay show={showHeart} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-white transition-colors",
                isLiked ? "bg-red-500" : "bg-indigo-600"
              )}
            >
              <Heart size={10} fill="white" />
            </div>
            <span className="text-xs text-gray-500">{formatCount(likesCount)}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <button onClick={() => setShowComments(!showComments)} className="hover:underline">
              {formatCount(commentsCount)} comments
            </button>
            <span>{post.shares_count || 0} shares</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
          <FeedAction
            icon={
              <Heart
                size={20}
                className={cn(
                  'transition-colors shrink-0',
                  isLiked && '!text-red-600 !fill-red-600 stroke-red-600'
                )}
              />
            }
            label="Like"
            active={isLiked}
            activeVariant="danger"
            onClick={handleLike}
          />
          <FeedAction
            icon={<MessageCircle size={20} className={cn("transition-colors", showComments && "text-indigo-600")} />}
            label="Comment"
            active={showComments}
            onClick={() => setShowComments(!showComments)}
          />
          <FeedAction icon={<Share2 size={20} />} label="Share" onClick={handleShare} />
          <FeedAction
            icon={<Bookmark size={20} className={cn("transition-colors", isSaved && "text-yellow-500 fill-yellow-500")} />}
            label="Save"
            active={isSaved}
            onClick={handleSaveToggle}
          />
        </div>

        {/* Expandable Comment Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="space-y-4 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                  {loadingComments ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : comments.length > 0 ? (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <ResponsiveImage src={comment.avatar} alt="" width={40} height={40} className="w-8 h-8 rounded-full object-cover" />
                        <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">@{comment.user}</span>
                            <span className="text-[10px] text-gray-400">{comment.time}</span>
                          </div>
                          <p className="text-xs text-gray-700 dark:text-gray-300">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-xs text-gray-500 py-4">No comments yet. Be the first to comment!</p>
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5">
                  <ResponsiveImage src={profile?.avatar_url || MOCK_USER.avatar} alt="" width={40} height={40} className="w-7 h-7 rounded-full object-cover ml-1" />
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1 bg-transparent border-none focus:ring-0 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim()}
                    className={cn(
                      "p-1.5 rounded-xl transition-all",
                      newComment.trim() ? "bg-indigo-600 text-white" : "text-gray-400"
                    )}
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onAddStory={() => {
          setIsShareModalOpen(false);
          setIsStoryEditorOpen(true);
        }}
        postUrl={`${window.location.origin}/post/${post.id}`}
      />

      <StoryEditor
        isOpen={isStoryEditorOpen}
        onClose={() => setIsStoryEditorOpen(false)}
        content={{
          image: imageUrl || post.image_url,
          user: {
            username: (postUser.username || (post.user_id ? `user_${String(post.user_id).slice(0, 6)}` : 'user')).toLowerCase().replace(/\s+/g, '_'),
            avatar: postUser.avatar,
          }
        }}
      />
    </div>
  );
}

// --- PostMenu/MenuButton, RightSidebar, FeedAction, PeopleYouMayKnow, TrendingSection, SuggestedGroups unchanged ---

function PostMenu({ isMe, onEdit, onDelete, onReport, onShare, onCopyLink }: { isMe: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void; onShare: () => void; onCopyLink: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 transition-colors"
      >
        <MoreHorizontal size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden"
          >
            <div className="py-1">
              {isMe ? (
                <>
                  <MenuButton icon={<Edit2 size={16} />} label="Edit Post" onClick={() => { console.log('[PostMenu] Edit Post'); onEdit(); setIsOpen(false); }} />
                  <MenuButton icon={<Trash2 size={16} />} label="Delete Post" onClick={() => { console.log('[PostMenu] Delete Post'); onDelete(); setIsOpen(false); }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" />
                </>
              ) : (
                <>
                  <MenuButton icon={<Flag size={16} />} label="Report Post" onClick={() => { onReport(); setIsOpen(false); }} />
                  <MenuButton icon={<Share2 size={16} />} label="Share Post" onClick={() => { onShare(); setIsOpen(false); }} />
                  <MenuButton icon={<ExternalLink size={16} />} label="Copy Link" onClick={() => { onCopyLink(); setIsOpen(false); }} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({ icon, label, onClick, className }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function RightSidebar() {
  return (
    <aside className="hidden xl:block space-y-6 sticky top-22 h-fit w-80">
      <PeopleYouMayKnow />
      <TrendingSection />
      <SuggestedGroups />
    </aside>
  );
}

function FeedAction({
  icon,
  label,
  active,
  onClick,
  activeVariant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  /** "danger" = red highlight when active (e.g. Like). */
  activeVariant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-all text-gray-500',
        active
          ? activeVariant === 'danger'
            ? 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400'
            : 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-indigo-600'
      )}
    >
      {icon}
      <span className="text-xs font-bold hidden sm:inline">{label}</span>
    </button>
  );
}

function PeopleYouMayKnow() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSuggested = async () => {
      if (!user) return;
      try {
        const res = await fetch(`/api/users/suggestions?userId=${encodeURIComponent(user.id)}&limit=3`);
        if (!res.ok) throw new Error('Failed to fetch suggestions');
        const data = await res.json();

        if (data) {
          setPeople(data);

          const { data: followsData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id)
            .in('following_id', data.map(p => p.id));

          const followingMap: Record<string, boolean> = {};
          followsData?.forEach(f => {
            followingMap[f.following_id] = true;
          });
          setFollowing(followingMap);
        }
      } catch (err) {
        console.error('Error fetching suggested users:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggested();
  }, [user]);

  const handleFollow = async (id: string) => {
    if (!user) return;
    const wasFollowing = following[id];
    setFollowing(prev => ({ ...prev, [id]: !wasFollowing }));

    try {
      if (wasFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', id);
      } else {
        await supabase
          .from('follows')
          .insert([{ follower_id: user.id, following_id: id }]);
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      setFollowing(prev => ({ ...prev, [id]: wasFollowing }));
    }
  };

  if (loading) return null;
  if (people.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">People You May Know</h3>
      <div className="space-y-4">
        {people.map((person) => (
          <div key={person.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/profile/${person.id}`)}
                className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800 overflow-hidden hover:opacity-80 transition-opacity"
              >
                <img src={person.avatar_url || `https://picsum.photos/seed/${person.id}/100/100`} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </button>
              <button
                onClick={() => navigate(`/profile/${person.id}`)}
                className="text-sm font-bold hover:underline hover:text-indigo-600 transition-colors"
              >
                {resolveProfileUsername(person.username)}
              </button>
            </div>
            <button
              onClick={() => handleFollow(person.id)}
              className={cn(
                "text-xs font-bold transition-colors",
                following[person.id] ? "text-gray-400" : "text-indigo-600 hover:underline"
              )}
            >
              {following[person.id] ? 'Following' : 'Follow'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendingSection() {
  const navigate = useNavigate();
  const trends = ['SummerVibes', 'TechNews', 'TravelGoals', 'FitnessJourney', 'FoodieLife'];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">Trending</h3>
      <div className="space-y-3">
        {trends.map((trend) => (
          <button
            key={trend}
            onClick={() => navigate(`/hashtag/${trend}`)}
            className="block text-indigo-600 text-sm font-bold hover:underline"
          >
            #{trend}
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestedGroups() {
  const navigate = useNavigate();
  const [joined, setJoined] = useState<Record<string, boolean>>({});

  const groups = [
    { id: 'g1', name: 'Photographers', icon: '📸', image: 'https://picsum.photos/seed/photo/400/200' },
    { id: 'g2', name: 'Travelers', icon: '✈️', image: 'https://picsum.photos/seed/travel/400/200' },
  ];

  const handleJoin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setJoined(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">Suggested Groups</h3>
      <div className="space-y-4">
        {groups.map(group => (
          <div
            key={group.id}
            onClick={() => navigate(`/groups/${group.id}`)}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                {group.icon}
              </div>
              <span className="text-sm font-bold group-hover:text-indigo-600 transition-colors">{group.name}</span>
            </div>
            <button
              onClick={(e) => handleJoin(e, group.id)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                joined[group.id]
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-500"
                  : "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:bg-indigo-100"
              )}
            >
              {joined[group.id] ? 'Leave' : 'Join'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
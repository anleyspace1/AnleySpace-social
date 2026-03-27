import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  GripVertical,
  Play,
  Upload
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

/** Home feed: white cards on #F5F6FA (see App layout when path is `/`). */
const homeCard =
  'bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_14px_rgba(0,0,0,0.04)] border border-gray-100';

const exploreGlassCard =
  'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg shadow-black/20 hover:scale-[1.02] transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20';

const resolveProfileUsername = (username?: string | null) => {
  const value = (username || '').trim();
  if (!value) return 'User';
  return value;
};

const reelCache = new Map<string, string>();
let isStoryUploadSupabaseLocked = false;

const normalizeReelUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
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
  const lastTap = useRef<number | null>(null);
  /** Last touchstart time — used to ignore synthetic `click` after the same touch (mobile false double-tap). */
  const lastTouchStartTs = useRef<number>(0);

  const handler = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const now = Date.now();
      if (e.type === 'click') {
        // Same gesture as a recent touchstart → do not count click as a second tap (would trigger like).
        if (lastTouchStartTs.current > 0 && now - lastTouchStartTs.current < 500) {
          lastTouchStartTs.current = 0;
          return;
        }
      }
      if (e.type === 'touchstart') {
        lastTouchStartTs.current = now;
      }

      if (lastTap.current != null && now - lastTap.current < delay) {
        onDoubleTap();
        lastTap.current = null;
      } else {
        lastTap.current = now;
      }
    },
    [onDoubleTap, delay]
  );

  return useMemo(
    () => ({
      onClick: handler,
      onTouchStart: handler,
    }),
    [handler]
  );
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
    <div className="w-full min-h-full lg:max-w-3xl lg:mx-auto space-y-4 lg:space-y-6">
      {category && (
        <div className={cn(homeCard, 'p-5 flex items-center justify-between')}>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">Category:</span>
            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              {category}
            </span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors font-bold"
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
  const [isUploadingStory, setIsUploadingStory] = useState(false);
  const [realStories, setRealStories] = useState<any[]>([]);
  const [avatarStoriesMap, setAvatarStoriesMap] = useState<Record<string, any[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seenHydratedRef = React.useRef(false);
  const { user } = useAuth();
  const location = useLocation();

  /** Local preview before posting (gallery or camera capture). */
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const expectingRecorderOnStopRef = useRef(false);

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
    if (isUploadingStory) return;
    fetchStories();
    fetchActiveStoriesMap().then((map) => setAvatarStoriesMap(map));
  }, [isUploadingStory]);

  const fetchStories = async () => {
    if (isUploadingStory) return;
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
      user: s.user ?? s.username ?? 'User',
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

  const clearPreview = useCallback(() => {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }
    setPreviewObjectUrl(null);
    setPreviewFile(null);
  }, [previewObjectUrl]);

  const finalizeCameraStream = useCallback(() => {
    expectingRecorderOnStopRef.current = false;
    mediaRecorderRef.current = null;
    setRecording(false);
    recordedChunksRef.current = [];
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setCameraMode(false);
  }, []);

  const closeCamera = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      discardRecordingRef.current = true;
      expectingRecorderOnStopRef.current = true;
      mr.stop();
      return;
    }
    if (mr && mr.state === 'inactive' && expectingRecorderOnStopRef.current) {
      return;
    }
    finalizeCameraStream();
  }, [finalizeCameraStream]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [previewObjectUrl]);

  useEffect(() => {
    if (!cameraMode || !cameraStreamRef.current) return;
    const v = cameraVideoRef.current;
    if (v) {
      v.srcObject = cameraStreamRef.current;
      v.play().catch(() => {});
    }
    return () => {
      if (v) v.srcObject = null;
    };
  }, [cameraMode]);

  const onGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Please choose an image or video file.');
      return;
    }
    clearPreview();
    setPreviewFile(file);
    setPreviewObjectUrl(URL.createObjectURL(file));
  };

  const chooseFromDevice = () => {
    if (cameraMode) {
      finalizeCameraStream();
    }
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  const uploadStoryFile = async (file: File) => {
    if (!user?.id) {
      alert('You must be logged in');
      return;
    }
    if (!file) {
      throw new Error('No file selected for story upload.');
    }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      throw new Error('Invalid story file type. Please choose an image or video.');
    }
    console.log('[StoryUpload] file:', file);

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

    try {
      const ext = file.name.includes('.')
        ? file.name.split('.').pop()
        : file.type.startsWith('video/')
          ? 'mp4'
          : 'jpg';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const filePath = `stories/${user.id}/${safeName}`;

      // Reuse the same upload flow used by working post upload.
      const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, file);
      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('Storage bucket "posts" not found. Create a public "posts" bucket in Supabase.');
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: insertedStory, error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          username,
          avatar,
          media_url: publicUrl,
          image_url: publicUrl,
          media_type: mediaType,
          expires_at: expiresAt,
        })
        .select('id, user_id, media_url, media_type, created_at, expires_at, username, avatar')
        .single();
      if (insertError) throw insertError;

      if (insertedStory?.id && insertedStory?.media_url) {
        const optimistic = {
          id: insertedStory.id,
          user_id: insertedStory.user_id || user.id,
          username: insertedStory.username || username,
          avatar: insertedStory.avatar || avatar,
          image_url: insertedStory.media_url,
          media_url: insertedStory.media_url,
          media_type: insertedStory.media_type || mediaType,
          created_at: insertedStory.created_at || new Date().toISOString(),
          expires_at: insertedStory.expires_at || expiresAt,
          user: insertedStory.username || username,
        };
        setRealStories((prev) => {
          const rest = prev.filter((s) => s.id !== optimistic.id);
          return [optimistic, ...rest];
        });
      }
    } catch (error) {
      console.error('[StoryUpload] upload failed:', error);
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
    const updatedStories = await fetchActiveStories();
    setRealStories((prev) => {
      const merged = new Map<string, any>();

      [...prev, ...updatedStories].forEach((story) => {
        merged.set(story.id, story);
      });

      const sorted = Array.from(merged.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const avatarMap = sorted.reduce((acc: Record<string, any[]>, story: any) => {
        const uid = story.user_id || story.username;
        if (!uid) return acc;
        if (!acc[uid]) acc[uid] = [];
        acc[uid].push(story);
        return acc;
      }, {});

      setAvatarStoriesMap(avatarMap);

      return sorted;
    });
  };

  const confirmStoryPost = async () => {
    if (!previewFile || !user?.id) return;
    if (isUploadingStory) return;
    setIsUploadingStory(true);
    isStoryUploadSupabaseLocked = true;
    setStoryUploading(true);
    try {
      await uploadStoryFile(previewFile);
      clearPreview();
    } catch (err) {
      console.error('Story upload error:', err);
      alert(err instanceof Error ? err.message : 'Failed to upload story. Please try again.');
    } finally {
      setStoryUploading(false);
      setIsUploadingStory(false);
      isStoryUploadSupabaseLocked = false;
    }
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Camera is not supported in this browser.');
      return;
    }
    try {
      clearPreview();
      expectingRecorderOnStopRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      });
      cameraStreamRef.current = stream;
      setCameraMode(true);
    } catch (err) {
      console.error(err);
      alert('Could not access the camera. Please allow permission or use gallery.');
    }
  };

  const capturePhotoFromCamera = () => {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const f = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
        clearPreview();
        setPreviewFile(f);
        setPreviewObjectUrl(URL.createObjectURL(f));
        finalizeCameraStream();
      },
      'image/jpeg',
      0.92
    );
  };

  const startVideoRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];
    discardRecordingRef.current = false;
    const mime =
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      mr = new MediaRecorder(stream);
    }
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (ev) => {
      if (ev.data.size) recordedChunksRef.current.push(ev.data);
    };
    mr.onstop = () => {
      expectingRecorderOnStopRef.current = false;
      if (discardRecordingRef.current) {
        discardRecordingRef.current = false;
        finalizeCameraStream();
        return;
      }
      const blob = new Blob(recordedChunksRef.current, { type: mr.mimeType || 'video/webm' });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const f = new File([blob], `story-${Date.now()}.${ext}`, { type: blob.type || 'video/webm' });
      clearPreview();
      setPreviewFile(f);
      setPreviewObjectUrl(URL.createObjectURL(f));
      finalizeCameraStream();
    };
    mr.start(200);
    setRecording(true);
  };

  const stopVideoRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      discardRecordingRef.current = false;
      expectingRecorderOnStopRef.current = true;
      mr.stop();
    }
    setRecording(false);
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

  /** Valid HTTPS URL for a video file — use <video> for preview, not <img>. */
  function storyVideoSrc(story: any): string | null {
    const raw = typeof story.media_url_raw === 'string' ? story.media_url_raw.trim() : '';
    const resolved = typeof story.media_url === 'string' ? story.media_url.trim() : '';
    const img = typeof story.image_url === 'string' ? story.image_url.trim() : '';
    const tryUrl = (u: string) => {
      if (!u || !isValidStoryImgSrc(u)) return null;
      if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) return u;
      return null;
    };
    const fromVideo = tryUrl(raw) || tryUrl(resolved) || tryUrl(img);
    if (fromVideo) return fromVideo;
    if (story.media_type === 'video' && raw && isValidStoryImgSrc(raw)) return raw;
    return null;
  }

  return (
    <div className={cn(homeCard, 'p-5 overflow-hidden')}>
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-gray-900 font-bold text-sm">Stories</h3>
        <button className="text-gray-400"><MoreHorizontal size={18} /></button>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*,video/*"
        onChange={onGalleryFileChange}
        disabled={storyUploading}
      />
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
        {/* Add Story — tap opens device camera */}
        <button
          type="button"
          onClick={() => !storyUploading && !cameraMode && void openCamera()}
          disabled={storyUploading || cameraMode}
          className="flex flex-col items-center gap-1 flex-shrink-0 disabled:opacity-60"
        >
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:border-indigo-500 hover:text-indigo-500 transition-all group">
            {storyUploading ? (
              <span className="text-[10px] font-bold text-indigo-500">…</span>
            ) : (
              <Plus size={18} className="group-hover:scale-110 transition-transform" />
            )}
          </div>
          <span className="text-[9px] sm:text-[10px] font-bold text-gray-400">
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
          const videoSrc = storyVideoSrc(story);
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
                      {videoSrc ? (
                        <video
                          key={story.id}
                          src={videoSrc}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 h-full w-full object-cover object-center rounded-full"
                          aria-hidden
                          onLoadedData={(e) => {
                            try {
                              const v = e.currentTarget;
                              if (v.readyState >= 2) v.currentTime = 0.001;
                            } catch {
                              /* ignore seek errors */
                            }
                          }}
                        />
                      ) : (
                        <img
                          key={story.id}
                          src={thumbSrc}
                          alt=""
                          className="w-full h-full object-cover rounded-full"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (el.src.includes('default-story.png')) return;
                            el.src = DEFAULT_STORY_THUMB;
                          }}
                        />
                      )}
                      {isVideo && (
                        <div
                          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/25"
                          aria-hidden
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-2 ring-white/40">
                            <Play size={18} fill="currentColor" className="ml-0.5" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 truncate w-14 sm:w-16 text-center">{story.user}</span>
            </button>
          );
        })}
      </div>

      {cameraMode && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 shadow-inner">
          <div className="relative aspect-video w-full max-h-[min(280px,50vh)] overflow-hidden rounded-xl bg-black">
            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {recording && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Rec
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={chooseFromDevice}
              disabled={recording || storyUploading}
              className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <Upload size={14} />
                Choose from device
              </span>
            </button>
            <button
              type="button"
              onClick={capturePhotoFromCamera}
              disabled={recording}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Capture photo
            </button>
            {!recording ? (
              <button
                type="button"
                onClick={startVideoRecording}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                Record video
              </button>
            ) : (
              <button
                type="button"
                onClick={stopVideoRecording}
                className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Stop
              </button>
            )}
            <button
              type="button"
              onClick={closeCamera}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {previewFile && previewObjectUrl && !cameraMode && (
        <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-white p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">Preview before posting</p>
          <div className="relative max-h-[min(320px,55vh)] overflow-hidden rounded-xl bg-black/5">
            {previewFile.type.startsWith('video/') ? (
              <video
                src={previewObjectUrl}
                controls
                playsInline
                className="mx-auto max-h-[min(320px,55vh)] w-full object-contain"
              />
            ) : (
              <img
                src={previewObjectUrl}
                alt="Story preview"
                className="mx-auto max-h-[min(320px,55vh)] w-full object-contain"
              />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmStoryPost}
              disabled={storyUploading}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              {storyUploading ? 'Posting…' : 'Post story'}
            </button>
            <button
              type="button"
              onClick={clearPreview}
              disabled={storyUploading}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreatePost({ onGoLive, onPostCreated }: { onGoLive: () => void; onPostCreated?: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className={cn(homeCard, 'p-5')}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <img src={profile?.avatar_url || MOCK_USER.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 bg-gray-50 border border-gray-100 text-gray-500 text-left px-4 py-2.5 rounded-xl hover:bg-gray-100 transition text-sm truncate"
            >
              What's on your mind, {profile?.display_name?.split(' ')[0] || 'friend'}?
            </button>
          </div>
          <button
            onClick={onGoLive}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-white flex items-center justify-center gap-2 font-bold text-sm whitespace-nowrap"
          >
            <Radio size={18} className="animate-pulse" />
            <span>Go Live</span>
          </button>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 overflow-x-auto no-scrollbar gap-2">
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
  /** Optional paste fields — never show stored public URLs here after commit. */
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [videoUrlDraft, setVideoUrlDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'image' | 'video' | null>(null);
  /** Matches feed PostItem: portrait → natural width; landscape/square → cover + fixed frame */
  const [previewImageMode, setPreviewImageMode] = useState<'portrait' | 'landscape' | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewImageMode(null);
  }, [imageUrl]);

  const handlePreviewImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) {
      setPreviewImageMode(h > w ? 'portrait' : 'landscape');
    }
  }, []);

  const commitImageDraft = () => {
    const t = imageUrlDraft.trim();
    if (t) {
      setImageUrl(t);
      setImageUrlDraft('');
    }
  };

  const commitVideoDraft = () => {
    const t = videoUrlDraft.trim();
    if (t) {
      setVideoUrl(t);
      setVideoUrlDraft('');
    }
  };

  const uploadFeedFile = async (file: File, kind: 'image' | 'video') => {
    if (!user) {
      alert('Please log in to post.');
      return;
    }
    setUploading(kind);
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : kind === 'image' ? 'jpg' : 'mp4';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const filePath = `feed/${user.id}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, file);
      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('Storage bucket "posts" not found. Create a public "posts" bucket in Supabase.');
        }
        throw uploadError;
      }
      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
      if (kind === 'image') {
        setImageUrl(publicUrl);
        setImageUrlDraft('');
      } else {
        setVideoUrl(publicUrl);
        setVideoUrlDraft('');
      }
    } finally {
      setUploading(null);
    }
  };

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

      const { data: insertedPost, error } = await supabase
        .from('posts')
        .insert(payload)
        .select('id, user_id, video_url, content')
        .single();
      if (error) throw error;

      // Ensure video posts are also available in Reels data source.
      if (insertedPost?.video_url) {
        try {
          await supabase.from('posts').insert({
            user_id: insertedPost.user_id || user.id,
            content: insertedPost.content || '',
            image_url: null,
            video_url: insertedPost.video_url,
            category: 'reel',
          });
        } catch (reelErr) {
          // Non-fatal for post publishing; Home click path can still create on-demand.
          console.warn('[CreatePostModal] failed to mirror video post into reels:', reelErr);
        }
      }

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
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xl font-bold">Create Post</h3>
              <p className="text-xs text-gray-500 mt-1">Share something with your community.</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 pb-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={4}
          />

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Image (optional)</label>
            {imageUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80">
                <div
                  className={cn(
                    'relative w-full',
                    previewImageMode === 'landscape' && 'h-[min(380px,52vh)] sm:h-[400px]'
                  )}
                >
                  <img
                    src={imageUrl}
                    alt="Selected image preview"
                    className={cn(
                      previewImageMode === 'landscape'
                        ? 'h-full w-full object-cover object-center'
                        : 'block w-full h-auto max-h-[min(92vh,1200px)] object-contain'
                    )}
                    onLoad={handlePreviewImageLoad}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl('');
                    setImageUrlDraft('');
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
                  aria-label="Remove image"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <div className="flex gap-2 items-stretch">
              <input
                type="file"
                ref={imageFileRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  uploadFeedFile(f, 'image').catch((err: unknown) => {
                    console.error(err);
                    alert(err instanceof Error ? err.message : 'Image upload failed');
                  });
                }}
              />
              <input
                value={imageUrlDraft}
                onChange={(e) => setImageUrlDraft(e.target.value)}
                onBlur={commitImageDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitImageDraft();
                  }
                }}
                placeholder="Paste image URL (optional)"
                className="min-w-0 flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => imageFileRef.current?.click()}
                disabled={!!uploading || busy}
                title="Upload image"
                aria-label="Upload image from device"
                className="shrink-0 flex items-center justify-center px-3 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ImageIcon size={20} />
              </button>
            </div>
            {uploading === 'image' && (
              <p className="text-xs text-gray-500">Uploading image…</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Video (optional)</label>
            {videoUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/80">
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="w-full max-h-48 object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setVideoUrl('');
                    setVideoUrlDraft('');
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  aria-label="Remove video"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <div className="flex gap-2 items-stretch">
              <input
                type="file"
                ref={videoFileRef}
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  uploadFeedFile(f, 'video').catch((err: unknown) => {
                    console.error(err);
                    alert(err instanceof Error ? err.message : 'Video upload failed');
                  });
                }}
              />
              <input
                value={videoUrlDraft}
                onChange={(e) => setVideoUrlDraft(e.target.value)}
                onBlur={commitVideoDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitVideoDraft();
                  }
                }}
                placeholder="Paste video URL (optional)"
                className="min-w-0 flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => videoFileRef.current?.click()}
                disabled={!!uploading || busy}
                title="Upload video"
                aria-label="Upload video from device"
                className="shrink-0 flex items-center justify-center px-3 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Video size={20} />
              </button>
            </div>
            {uploading === 'video' && (
              <p className="text-xs text-gray-500">Uploading video…</p>
            )}
          </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-6 pb-6 pt-4 dark:border-gray-800 dark:bg-gray-900">
          <button
            onClick={publish}
            disabled={busy || !!uploading}
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
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [suggestedReels, setSuggestedReels] = useState<any[]>([]);
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

      const basePosts = (postsData || []).filter((p: any) => {
        const cat = typeof p?.category === 'string' ? p.category.trim().toLowerCase() : '';
        return !cat.startsWith('group:');
      });
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

  useEffect(() => {
    const fetchSuggestedReels = async () => {
      try {
        const { data: reelRows, error } = await supabase
          .from('posts')
          .select('id, user_id, content, video_url, image_url, created_at')
          .eq('category', 'reel')
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        const rows = Array.isArray(reelRows) ? reelRows : [];
        const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
        let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profRows } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds);
          profileMap = Object.fromEntries((profRows || []).map((p: any) => [String(p.id), p]));
        }
        setSuggestedReels(
          rows.map((r: any) => ({
            id: String(r.id),
            video_url: String(r.video_url || ''),
            image_url: r.image_url || null,
            caption: String(r.content || ''),
            username: profileMap[String(r.user_id)]?.username || 'User',
            avatar_url:
              profileMap[String(r.user_id)]?.avatar_url ||
              `https://picsum.photos/seed/reel-${String(r.user_id || r.id)}/100/100`,
          }))
        );
      } catch (err) {
        console.error('[Home] fetchSuggestedReels failed:', err);
        setSuggestedReels([]);
      }
    };
    void fetchSuggestedReels();
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
    <div className="space-y-6 pb-4">
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
            {(index + 1) % 6 === 0 && suggestedReels.length > 0 && (
              <SuggestedReelsStrip
                reels={suggestedReels}
                onOpenReel={(reel) => {
                  navigate(`/reels/${reel.id}?autoplaySound=1`, {
                    state: {
                      selectedReelId: reel.id,
                      videoId: reel.id,
                      videoUrl: reel.video_url,
                    },
                  });
                }}
              />
            )}
          </React.Fragment>
        ))
      ) : (
        <div className={cn(homeCard, 'p-8 text-center')}>
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag size={32} className="text-gray-400" />
          </div>
          <h3 className="text-gray-900 font-bold text-lg mb-2">No posts found</h3>
          <p className="text-gray-500 text-sm">Be the first to post in this category!</p>
        </div>
      )}
    </div>
  );
}

function SuggestedReelsStrip({
  reels,
  onOpenReel,
}: {
  reels: Array<{
    id: string;
    video_url: string;
    image_url?: string | null;
    caption?: string;
    username?: string;
    avatar_url?: string;
  }>;
  onOpenReel: (reel: { id: string; video_url: string }) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const updateScrollState = () => {
      const maxLeft = el.scrollWidth - el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft < maxLeft - 1);
    };

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [reels.length]);

  return (
    <section className={cn(homeCard, 'p-4')}>
      <h3 className="text-gray-900 font-black text-sm mb-3">🔥 Suggested Reels</h3>
      <div className="relative">
        <div
          ref={scrollerRef}
          className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] touch-pan-x no-scrollbar"
        >
          <div className="flex gap-3 min-w-max">
            {reels.map((reel, idx) => (
              <button
                key={reel.id}
                type="button"
                onClick={() => onOpenReel(reel)}
                className="group relative w-[170px] sm:w-[190px] aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-gray-200 shrink-0 text-left"
              >
                <video
                  src={reel.video_url}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload={idx < 3 ? 'metadata' : 'none'}
                  className="w-full h-full object-cover pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent pointer-events-none" />
                <div className="absolute left-2 right-2 bottom-2 pointer-events-none">
                  <p className="text-white text-[10px] font-black truncate">@{reel.username || 'User'}</p>
                  <p className="text-white/80 text-[10px] truncate">{reel.caption || 'Watch now'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll suggested reels left"
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm border border-gray-200 hover:bg-white"
            onClick={() => scrollerRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
          >
            ←
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll suggested reels right"
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm border border-gray-200 hover:bg-white"
            onClick={() => scrollerRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
          >
            →
          </button>
        )}
      </div>
    </section>
  );
}

/** Relative time / short date for feed posts (e.g. "2h ago", "Mar 22"). */
function formatPostTimestamp(iso: string | undefined | null): string {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Just now';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  /** Prevent overlapping like/comment API calls (avoids aborted requests / race on server). */
  const likeRequestInFlightRef = useRef(false);
  const commentRequestInFlightRef = useRef(false);
  /** Latest handleLike for double-tap (avoids stale closure + duplicate triggers). */
  const handleLikeRef = useRef<() => Promise<void>>(async () => {});

  // Track if post video is visible
  const [videoVisible, setVideoVisible] = useState(false);

  /** null = not loaded yet; portrait = tall → no crop; landscape/square → cover + max-height */
  const [feedImageMode, setFeedImageMode] = useState<'portrait' | 'landscape' | null>(null);

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

  useEffect(() => {
    setFeedImageMode(null);
  }, [imageUrl]);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsTouchDevice(!!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const postUser = {
    name: displayUsername,
    username: displayUsername,
    avatar: displayAvatar,
    user_id: post.user_id,
    time: formatPostTimestamp(post.created_at),
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
      threshold: 0.8,
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
    if (isStoryUploadSupabaseLocked) return;
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
      console.error('User not authenticated');
      return;
    }
    if (!post?.id) {
      console.error('[LikeError]', { message: 'Missing post_id', postId: post?.id, userId: user?.id });
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
        const data = await apiRes.json().catch(() => ({}));
        // Server may return only { success: true }; keep optimistic isLiked/likesCount unless server sends fields.
        if (typeof data.liked === 'boolean') setIsLiked(data.liked);
        if (typeof data.likesCount === 'number') setLikesCount(data.likesCount);
      } else {
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
      }

      // Ensure UI remains synced with persisted DB state deterministically.
      await fetchLikesCount();
    } catch (err) {
      console.error('[LikeError]', err);
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
      console.error('User not authenticated');
      return;
    }
    if (!post?.id) {
      console.error('[CommentError]', { message: 'Missing post_id', postId: post?.id, userId: user?.id });
      return;
    }
    if (!newComment.trim()) {
      console.error('[CommentError]', { message: 'Comment content is empty', postId: post?.id, userId: user?.id });
      return;
    }
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
        const payload = await apiRes.json().catch(() => ({}));
        data = payload?.comment ?? null;
      }
      if (!data && !apiRes.ok) {
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
      if (!data) {
        data = {
          id: `temp-${Date.now()}`,
          user_id: user.id,
          content: commentText,
          created_at: new Date().toISOString(),
        };
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
      await fetchComments();
      await fetchCommentsCount();
    } catch (err) {
      console.error('[CommentError]', err);
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
  const handleVideoClick = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    let reelId: string | null = (post as any).reel_id ? String((post as any).reel_id) : null;
    const normalizedVideoUrl = videoUrl ? normalizeReelUrl(String(videoUrl)) : '';
    try {
      if (normalizedVideoUrl) {
        // 1) Cache hit: avoid GET/POST and duplicate creation.
        const cachedReelId = reelCache.get(normalizedVideoUrl);
        if (cachedReelId) {
          reelId = cachedReelId;
        } else {
          // 2) Query existing reels before creating a new one.
          let matchedReelId: string | null = null;
          const { data: reelsRows, error: reelsError } = await supabase
            .from('posts')
            .select('id, video_url')
            .eq('category', 'reel')
            .not('video_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(200);
          if (!reelsError && Array.isArray(reelsRows)) {
            for (const r of reelsRows) {
              const reelVideoUrl = normalizeReelUrl(String((r as any)?.video_url || ''));
              console.log('MATCHING:', {
                home: normalizedVideoUrl,
                reel: reelVideoUrl
              });
              if (reelVideoUrl && reelVideoUrl === normalizedVideoUrl) {
                if ((r as any)?.id != null) {
                  matchedReelId = String((r as any).id);
                }
                break;
              }
            }
          }

          if (matchedReelId) {
            reelId = matchedReelId;
            reelCache.set(normalizedVideoUrl, reelId);
          } else {
            // 3) Create only when not found.
            const { data: created, error: createError } = await supabase
              .from('posts')
              .insert({
                user_id: post.user_id || user?.id,
                content: post.content || '',
                image_url: null,
                video_url: videoUrl,
                category: 'reel',
              })
              .select('id')
              .single();
            if (!createError && created?.id != null) {
              reelId = String(created.id);
              reelCache.set(normalizedVideoUrl, reelId);
            }
          }
        }
      } else if (!reelId) {
        reelId = String(post.id);
      }
    } catch (err) {
      console.warn('[Home] reel id resolve failed', err);
    }

    if (!reelId) {
      console.warn('[Home] missing reelId after resolve, skipping navigation', { postId: post.id, videoUrl });
      return;
    }

    console.log('[Home] navigate to reels', {
      reelId,
      index,
      videoUrl
    });
    navigate(`/reels/${reelId}`, {
      state: {
        selectedReelId: reelId,
        videoId: reelId,
        postId: post.id,
        videoUrl,
        index,
        thumbnail: imageUrl || videoUrl,
        caption: post.content,
        username: postUser.username,
        avatar: postUser.avatar,
        selectedPost: post,
      }
    });
  };

  const handleFeedImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) {
      setFeedImageMode(h > w ? 'portrait' : 'landscape');
    }
  }, []);

  return (
    <div className={homeCard}>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* AVATAR with story ring + navigation */}
          <button
            onClick={handleAvatarClick}
            className={cn(
              'w-10 h-10 rounded-full border border-gray-200 overflow-hidden hover:opacity-80 transition-opacity relative flex-shrink-0',
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
              className="text-gray-900 font-bold text-sm hover:underline hover:text-indigo-600 transition-colors block text-left"
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
          <p className="text-sm text-gray-800 mb-4">{renderTextWithHashtags(post.content ?? '', navigate)}</p>
        )}
      </div>

      {(videoUrl || imageUrl) && (
        <div className="px-0 relative">
          {videoUrl ? (
            // Same pattern as Explore "Live Now" / Trending cards: outer div is the tap target (onClick on wrapper), not the media element.
            <div
              className="relative overflow-hidden bg-black border border-gray-100 rounded-xl w-full max-h-[500px] flex items-center justify-center group cursor-pointer touch-manipulation"
              onClick={(e) => {
                doubleTapHandlers.onClick?.(e);
                if (e.detail === 1) {
                  setTimeout(() => {
                    if (!showHeart) void handleVideoClick(e);
                  }, 300);
                }
              }}
              onTouchStart={doubleTapHandlers.onTouchStart}
            >
              <div className="relative w-full flex items-center justify-center select-none">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  poster={imageUrl || `${videoUrl}#t=0.1`}
                  controls={!isTouchDevice}
                  autoPlay
                  defaultMuted
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-auto object-contain max-h-[500px] pointer-events-none md:pointer-fine:pointer-events-auto [will-change:transform]"
                  style={
                    isTouchDevice
                      ? {
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          backgroundColor: '#000',
                        }
                      : { cursor: 'pointer' }
                  }
                />
                {isTouchDevice && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMuted((prev) => !prev);
                    }}
                    style={{
                      position: 'absolute',
                      bottom: '80px',
                      right: '16px',
                      zIndex: 20,
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: '50%',
                      padding: '8px',
                    }}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </div>
                )}
                <HeartOverlay show={showHeart} />
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden bg-gray-100 border border-gray-100 rounded-xl w-full">
              <div
                className={cn(
                  'relative w-full select-none',
                  feedImageMode === 'landscape' && 'h-[min(380px,52vh)] sm:h-[400px]'
                )}
              >
                <img
                  src={imageUrl || ''}
                  alt=""
                  className={cn(
                    feedImageMode === 'landscape'
                      ? 'h-full w-full object-cover object-center'
                      : 'block w-full h-auto max-h-[min(92vh,1200px)] object-contain'
                  )}
                  referrerPolicy="no-referrer"
                  onLoad={handleFeedImageLoad}
                  {...doubleTapHandlers}
                />
                <HeartOverlay show={showHeart} />
              </div>
            </div>
          )}
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
            <span className="text-xs text-gray-400">{formatCount(likesCount)}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <button onClick={() => setShowComments(!showComments)} className="hover:underline">
              {formatCount(commentsCount)} comments
            </button>
            <span>{post.shares_count || 0} shares</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
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
              <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                <div className="space-y-4 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                  {loadingComments ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : comments.length > 0 ? (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <ResponsiveImage src={comment.avatar} alt="" width={40} height={40} className="w-8 h-8 rounded-full object-cover" />
                        <div className="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-xl">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs text-gray-900">@{comment.user}</span>
                            <span className="text-[10px] text-gray-500">{comment.time}</span>
                          </div>
                          <p className="text-xs text-gray-700">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-xs text-gray-400 py-4">No comments yet. Be the first to comment!</p>
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl p-1.5">
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
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <aside
      className={cn(
        'hidden xl:block w-80 flex-shrink-0 space-y-5',
        isHome
          ? 'sticky top-14 sm:top-16 self-start h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden no-scrollbar py-4 pl-4 pr-2 bg-[#F0F2F5] border-l border-gray-200/70'
          : 'sticky top-22 h-fit'
      )}
    >
      <PeopleYouMayKnow />
      <TrendingSection />
      <SuggestedGroups />
      <SuggestedForYou />
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
  const location = useLocation();
  const { user } = useAuth();
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPeople([]);
      setFollowing({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchSuggested = async () => {
      setLoading(true);
      try {
        const uid = user.id;
        const limit = 3;

        const { data: profRows, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .neq('id', uid)
          .limit(40);

        if (profErr) {
          console.warn('[PeopleYouMayKnow] profiles:', profErr.message);
        }

        let candidates: {
          id: string;
          username: string | null;
          avatar_url: string | null;
          _fallback?: boolean;
        }[] = [...(profRows ?? [])];

        if (candidates.length < 8) {
          const { data: postRows } = await supabase
            .from('posts')
            .select('user_id')
            .neq('user_id', uid)
            .limit(100);
          const authorIds = [
            ...new Set(
              (postRows ?? [])
                .map((p: { user_id?: string }) => p.user_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0 && id !== uid)
            ),
          ];
          const have = new Set(candidates.map((c) => c.id));
          const need = authorIds.filter((id) => !have.has(id)).slice(0, 24);
          if (need.length > 0) {
            const { data: extra } = await supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .in('id', need);
            for (const row of extra ?? []) {
              if (!candidates.some((c) => c.id === row.id)) candidates.push(row);
            }
          }
        }

        const { data: followsData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', uid);
        const followingIds = new Set((followsData ?? []).map((f) => f.following_id));

        let pick = candidates.filter((c) => !followingIds.has(c.id));
        if (pick.length < limit) {
          pick = [...candidates];
        }

        pick = pick
          .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i)
          .sort(() => Math.random() - 0.5)
          .slice(0, limit);

        if (pick.length === 0) {
          pick = [
            {
              id: '__pymk_fb_1__',
              username: 'dance_queen',
              avatar_url: 'https://picsum.photos/seed/pymkfb1/100/100',
              _fallback: true,
            },
            {
              id: '__pymk_fb_2__',
              username: 'nature_lover',
              avatar_url: 'https://picsum.photos/seed/pymkfb2/100/100',
              _fallback: true,
            },
            {
              id: '__pymk_fb_3__',
              username: 'tech_guru',
              avatar_url: 'https://picsum.photos/seed/pymkfb3/100/100',
              _fallback: true,
            },
          ];
        }

        if (cancelled) return;

        setPeople(pick);

        const followingMap: Record<string, boolean> = {};
        for (const p of pick) {
          if ((p as { _fallback?: boolean })._fallback) continue;
          if (followingIds.has(p.id)) followingMap[p.id] = true;
        }
        setFollowing(followingMap);
      } catch (err) {
        console.error('Error fetching suggested users:', err);
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSuggested();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const openProfileOrExplore = (person: { id: string; _fallback?: boolean }) => {
    if (person._fallback) {
      navigate('/explore');
      return;
    }
    navigate(`/profile/${person.id}`);
  };

  const handleFollow = async (person: { id: string; _fallback?: boolean }) => {
    if (!user) return;
    if (person._fallback) {
      navigate('/explore');
      return;
    }
    const id = person.id;
    const wasFollowing = following[id];
    setFollowing((prev) => ({ ...prev, [id]: !wasFollowing }));

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
      setFollowing((prev) => ({ ...prev, [id]: wasFollowing }));
    }
  };

  const isHomeFeed = location.pathname === '/';
  const cardClass = cn(isHomeFeed ? homeCard : exploreGlassCard, 'p-5');

  if (!user) return null;

  if (loading) {
    return (
      <div className={cardClass}>
        <h3 className={cn('font-bold text-sm mb-4', isHomeFeed ? 'text-gray-900' : 'text-white')}>
          People You May Know
        </h3>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-2 animate-pulse">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 max-w-[120px] flex-1 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="h-8 w-[72px] shrink-0 rounded-lg bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className={cardClass}>
        <h3 className={cn('font-bold text-sm mb-2', isHomeFeed ? 'text-gray-900' : 'text-white')}>
          People You May Know
        </h3>
        <p className={cn('text-xs', isHomeFeed ? 'text-gray-500' : 'text-white/60')}>
          No suggestions right now.
        </p>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h3 className={cn('font-bold text-sm mb-4', isHomeFeed ? 'text-gray-900' : 'text-white')}>
        People You May Know
      </h3>
      <div className="space-y-4">
        {people.map((person) => {
          const isFb = !!(person as { _fallback?: boolean })._fallback;
          return (
            <div key={person.id} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={() => openProfileOrExplore(person as { id: string; _fallback?: boolean })}
                  className={cn(
                    'h-10 w-10 shrink-0 rounded-full overflow-hidden hover:opacity-80 transition-opacity',
                    isHomeFeed ? 'border border-gray-200' : 'border border-gray-100 dark:border-gray-800'
                  )}
                >
                  <img
                    src={person.avatar_url || `https://picsum.photos/seed/${person.id}/100/100`}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openProfileOrExplore(person as { id: string; _fallback?: boolean })}
                  className={cn(
                    'min-w-0 truncate text-left text-sm font-bold transition-colors hover:underline',
                    isHomeFeed ? 'text-gray-900 hover:text-indigo-600' : 'text-white hover:text-indigo-300'
                  )}
                >
                  {resolveProfileUsername(person.username)}
                </button>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleFollow(person as { id: string; _fallback?: boolean });
                }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-all',
                  isFb
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400'
                    : following[person.id]
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                      : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400'
                )}
              >
                {isFb ? 'Explore' : following[person.id] ? 'Following' : 'Follow'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendingSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomeFeed = location.pathname === '/';
  const trends = ['SummerVibes', 'TechNews', 'TravelGoals', 'FitnessJourney', 'FoodieLife'];
  return (
    <div className={cn(isHomeFeed ? homeCard : exploreGlassCard, 'p-5')}>
      <h3 className={cn('font-bold text-sm mb-4', isHomeFeed ? 'text-gray-900' : 'text-white')}>Trending</h3>
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
  const location = useLocation();
  const [joined, setJoined] = useState<Record<string, boolean>>({});

  const groups = [
    { id: 'g1', name: 'Photographers', icon: '📸', image: 'https://picsum.photos/seed/photo/400/200' },
    { id: 'g2', name: 'Travelers', icon: '✈️', image: 'https://picsum.photos/seed/travel/400/200' },
  ];

  const handleJoin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setJoined(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isHomeFeed = location.pathname === '/';

  return (
    <div className={cn(isHomeFeed ? homeCard : exploreGlassCard, 'p-5')}>
      <h3 className={cn('font-bold text-sm mb-4', isHomeFeed ? 'text-gray-900' : 'text-white')}>Suggested Groups</h3>
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
              <span
                className={cn(
                  'text-sm font-bold transition-colors',
                  isHomeFeed ? 'text-gray-900 group-hover:text-indigo-600' : 'text-white group-hover:text-indigo-300'
                )}
              >
                {group.name}
              </span>
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

/** Promotional category carousel — not feed posts; below Suggested Groups on home/explore sidebar. */
function SuggestedForYou() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomeFeed = location.pathname === '/';

  const items = [
    { id: 'sfy-food', label: 'Foodie', image: 'https://picsum.photos/seed/sfyfood/400/520', tag: 'Foodie' },
    { id: 'sfy-nature', label: 'Nature', image: 'https://picsum.photos/seed/sfynature/400/520', tag: 'Nature' },
    { id: 'sfy-fitness', label: 'Fitness', image: 'https://picsum.photos/seed/sfyfit/400/520', tag: 'Fitness' },
    { id: 'sfy-fashion', label: 'Fashion', image: 'https://picsum.photos/seed/sfyfash/400/520', tag: 'Fashion' },
    { id: 'sfy-tech', label: 'Tech', image: 'https://picsum.photos/seed/sfytech/400/520', tag: 'TechNews' },
    { id: 'sfy-music', label: 'Music', image: 'https://picsum.photos/seed/sfymusic/400/520', tag: 'Music' },
  ];

  return (
    <div className={cn(isHomeFeed ? homeCard : exploreGlassCard, 'p-5')}>
      <h3
        className={cn(
          'font-bold text-sm mb-3',
          isHomeFeed ? 'text-gray-900' : 'text-white'
        )}
      >
        Suggested For You
      </h3>
      <div className="flex max-h-[160px] gap-2.5 overflow-x-auto overflow-y-hidden scroll-smooth pb-1 no-scrollbar">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(`/hashtag/${item.tag}`)}
            className={cn(
              'group relative h-[148px] w-[128px] shrink-0 overflow-hidden rounded-2xl',
              'text-left shadow-sm ring-1 ring-black/5 transition-all duration-300 ease-out',
              'hover:scale-105 hover:shadow-lg hover:ring-black/10',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
              isHomeFeed ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-gray-900'
            )}
          >
            <img
              src={item.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
              aria-hidden
            />
            <span className="absolute bottom-2.5 left-2.5 right-2.5 z-[1] truncate text-[11px] font-bold leading-tight text-white drop-shadow-md">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
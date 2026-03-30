import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { ResponsiveImage } from '../components/ResponsiveImage';
import { isValidVideoUrl } from '../lib/videoUrl';

type PostRow = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostRow | null>(null);
  const [authorUsername, setAuthorUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  console.log(post, id);

  useEffect(() => {
    const rawId = id != null ? String(id).trim() : '';
    if (!rawId) {
      setPost(null);
      setNotFound(true);
      setLoading(false);
      setAuthorUsername(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setPost(null);
      setAuthorUsername(null);
      try {
        const { data, error } = await supabase.from('posts').select('*').eq('id', rawId).maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error('[PostDetailPage] supabase', error);
          setPost(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!data || typeof data !== 'object') {
          setPost(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        setPost(data as PostRow);

        const uid = str((data as PostRow).user_id).trim();
        if (uid) {
          const { data: prof, error: pErr } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', uid)
            .maybeSingle();
          if (cancelled) return;
          if (!pErr && prof && typeof prof === 'object' && 'username' in prof) {
            setAuthorUsername(str(prof.username).trim() || null);
          }
        }
      } catch (e) {
        console.error('[PostDetailPage] fetch', e);
        if (!cancelled) {
          setPost(null);
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-2 px-4">
        <div className="h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-hidden />
        <p className="text-sm text-gray-500">Loading post…</p>
      </div>
    );
  }

  if (notFound || post == null) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center min-h-[40vh] flex flex-col items-center justify-center">
        <p className="text-gray-800 dark:text-gray-200 font-semibold">Post not found or deleted</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
        >
          Go back
        </button>
      </div>
    );
  }

  const content = str(post.content);
  const imageUrl = str(post.image_url).trim();
  const videoUrl = str(post.video_url).trim();
  const userId = str(post.user_id).trim();
  const hasVideo = videoUrl.length > 0 && isValidVideoUrl(videoUrl);
  const hasImage = imageUrl.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto p-4 md:p-6 pb-24"
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 mb-4"
      >
        <ArrowLeft size={20} />
        <span className="font-bold text-sm">Back</span>
      </button>

      <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        {hasVideo ? (
          <div className="aspect-video bg-black">
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full h-full object-contain"
              preload="metadata"
            >
              <track kind="captions" />
            </video>
          </div>
        ) : hasImage ? (
          <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative">
            <ResponsiveImage
              src={imageUrl}
              alt=""
              width={800}
              height={450}
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="aspect-video bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-sm">
            No media
          </div>
        )}

        <div className="p-4 md:p-6 space-y-3">
          {userId ? (
            <Link
              to={`/profile/${encodeURIComponent(userId)}`}
              className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              @{authorUsername && authorUsername.length > 0 ? authorUsername : 'user'}
            </Link>
          ) : null}
          {content.length > 0 ? (
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <p className="text-gray-400 text-sm italic">No caption</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

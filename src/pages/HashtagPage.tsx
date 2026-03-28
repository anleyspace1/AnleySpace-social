import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Hash, Users, Grid, PlaySquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

type HashtagPost = {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at?: string | null;
};

function isValidHashtagMediaUrl(url: string | null | undefined): boolean {
  const u = String(url ?? '').trim();
  if (!u) return false;
  const l = u.toLowerCase();
  if (!u.startsWith('https://')) return false;
  if (l.includes('localhost') || l.includes('127.0.0.1')) return false;
  if (l.includes('picsum') || l.includes('placehold')) return false;
  return true;
}

function postHasValidMedia(row: HashtagPost): boolean {
  return isValidHashtagMediaUrl(row.image_url) || isValidHashtagMediaUrl(row.video_url);
}

function normalizeHashtagToken(raw: string): string | null {
  const t = raw.replace(/^[#]+/, '').replace(/[.,!?:;]+$/g, '').trim();
  if (t.length < 1 || t.length > 80) return null;
  return t;
}

function extractHashtagsFromContent(content: string): string[] {
  const s = String(content ?? '');
  const re = /#([^\s#]+)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const n = normalizeHashtagToken(m[1]);
    if (n) out.push(n);
  }
  return out;
}

function postMatchesHashtag(content: string | null | undefined, normalizedTag: string): boolean {
  const want = normalizedTag.trim().toLowerCase();
  if (!want) return false;
  return extractHashtagsFromContent(String(content ?? '')).some((t) => t.toLowerCase() === want);
}

export default function HashtagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'posts' | 'reels'>('posts');
  const [rows, setRows] = useState<HashtagPost[]>([]);
  const [loading, setLoading] = useState(true);

  const decodedTag = useMemo(() => {
    try {
      return tag ? decodeURIComponent(tag) : '';
    } catch {
      return tag || '';
    }
  }, [tag]);

  const normalizedTag = decodedTag.trim();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setRows([]);

      if (!normalizedTag) {
        console.log("HASHTAG POSTS:", []);
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('posts')
          .select('id, user_id, content, image_url, video_url, created_at')
          .not('user_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (cancelled) return;

        if (error || !data?.length) {
          const posts: HashtagPost[] = [];
          console.log("HASHTAG POSTS:", posts);
          setRows(posts);
          return;
        }

        const posts = (data as HashtagPost[]).filter(
          (r) =>
            Boolean(String(r.user_id || '').trim()) &&
            postHasValidMedia(r) &&
            postMatchesHashtag(r.content, normalizedTag)
        );

        console.log("HASHTAG POSTS:", posts);

        setRows(posts);
      } catch {
        const posts: HashtagPost[] = [];
        console.log("HASHTAG POSTS:", posts);
        if (!cancelled) setRows(posts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedTag]);

  const imagePosts = useMemo(
    () => rows.filter((p) => isValidHashtagMediaUrl(p.image_url)),
    [rows]
  );

  const reelPosts = useMemo(
    () => rows.filter((p) => isValidHashtagMediaUrl(p.video_url)),
    [rows]
  );

  const uniqueCreators = useMemo(() => new Set(rows.map((p) => p.user_id)).size, [rows]);

  const stats = {
    posts: String(rows.length),
    creators: String(uniqueCreators),
    reels: String(reelPosts.length),
  };

  const showPostsGrid = activeTab === 'posts' ? imagePosts : reelPosts;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 dark:bg-black pb-12"
    >
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-14 sm:top-16 z-30">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Hash size={32} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black truncate">#{normalizedTag || '—'}</h1>
              <p className="text-sm text-gray-500">Posts that include this hashtag</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard icon={<Grid size={16} />} label="Posts" value={stats.posts} />
            <StatCard icon={<Users size={16} />} label="Creators" value={stats.creators} />
            <StatCard icon={<PlaySquare size={16} />} label="Reels" value={stats.reels} />
          </div>

          <div className="flex gap-8 border-b border-gray-100 dark:border-gray-800">
            <TabButton
              active={activeTab === 'posts'}
              onClick={() => setActiveTab('posts')}
              icon={<Grid size={18} />}
              label="Posts"
            />
            <TabButton
              active={activeTab === 'reels'}
              onClick={() => setActiveTab('reels')}
              icon={<PlaySquare size={18} />}
              label="Reels"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-center text-sm text-gray-500 py-16">Loading…</p>
        ) : !normalizedTag ? (
          <EmptyState message="Invalid hashtag." />
        ) : showPostsGrid.length === 0 ? (
          <EmptyState
            message={
              activeTab === 'posts'
                ? 'No posts with images match this hashtag yet.'
                : 'No reels match this hashtag yet.'
            }
          />
        ) : activeTab === 'posts' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {imagePosts.map((post, i) => (
              <motion.button
                key={post.id}
                type="button"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                onClick={() => navigate(`/post/${post.id}`)}
                className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-2xl overflow-hidden group relative text-left"
              >
                <img
                  src={post.image_url!.trim()}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {reelPosts.map((post, i) => (
              <motion.button
                key={post.id}
                type="button"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                onClick={() => navigate(`/post/${post.id}`)}
                className="aspect-[9/16] bg-gray-900 rounded-2xl overflow-hidden group relative"
              >
                <video
                  src={post.video_url!.trim()}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  muted
                  playsInline
                  preload="metadata"
                  poster={isValidHashtagMediaUrl(post.image_url) ? post.image_url!.trim() : undefined}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                  <div className="flex items-center gap-2 text-white text-[10px] font-bold">
                    <PlaySquare size={12} />
                    Reel
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50">
      <Grid className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 max-w-sm">{message}</p>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 py-4 border-b-2 transition-all',
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
      )}
    >
      {icon}
      <span className="font-bold text-sm uppercase tracking-wider">{label}</span>
    </button>
  );
}

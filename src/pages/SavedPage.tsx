import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Bookmark, Search, Grid, List, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type SavedListItem = {
  id: string;
  type: 'post' | 'video' | 'product';
  title: string;
  user: string;
  image: string;
  videoUrl?: string;
  price?: string;
};

function isValidSavedMediaUrl(url: string | null | undefined): boolean {
  const u = (url || '').trim();
  if (!u) return false;
  const lower = u.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return false;
  if (!u.startsWith('https://')) return false;
  if (lower.includes('picsum.photos') || lower.includes('placehold')) return false;
  return true;
}

export default function SavedPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'posts' | 'products' | 'videos'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedItems, setSavedItems] = useState<SavedListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSavedItems = useCallback(async () => {
    if (!user?.id) {
      setSavedItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: saveRows, error: saveErr } = await supabase
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', user.id);

      if (saveErr) throw saveErr;
      const ids = (saveRows || []).map((r: { post_id: string }) => r.post_id).filter(Boolean);

      if (ids.length === 0) {
        console.log('SAVED ITEMS:', []);
        setSavedItems([]);
        return;
      }

      const { data: postsData, error: postsErr } = await supabase
        .from('posts')
        .select('*')
        .in('id', ids);

      if (postsErr) throw postsErr;
      console.log('SAVED ITEMS:', postsData);

      const byId = new Map((postsData || []).map((p: any) => [p.id, p]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];

      const authorIds = [...new Set(ordered.map((p) => p.user_id).filter(Boolean))];
      let profById: Record<string, { username?: string | null }> = {};
      if (authorIds.length > 0) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', authorIds);
        if (!profErr && profs) {
          (profs as { id: string; username?: string | null }[]).forEach((p) => {
            profById[p.id] = { username: p.username };
          });
        }
      }

      const items: SavedListItem[] = [];
      for (const p of ordered) {
        const videoUrl = String(p.video_url || '').trim();
        const imageUrl = String(p.image_url || '').trim();
        const hasVideo = isValidSavedMediaUrl(videoUrl);
        const hasImage = isValidSavedMediaUrl(imageUrl);
        if (!hasVideo && !hasImage) continue;

        const author = profById[p.user_id];
        const username = (author?.username || '').trim() || 'User';
        const title = String(p.content || '').trim() || 'Saved post';

        const type: 'post' | 'video' = hasVideo ? 'video' : 'post';
        items.push({
          id: String(p.id),
          type,
          title: title.slice(0, 120),
          user: username,
          image: hasImage ? imageUrl : videoUrl,
          videoUrl: hasVideo ? videoUrl : undefined,
        });
      }

      setSavedItems(items);
    } catch (err) {
      console.error('[SavedPage] fetch error', err);
      setSavedItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchSavedItems();
  }, [fetchSavedItems]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = savedItems;
    if (activeTab === 'posts') list = list.filter((i) => i.type === 'post');
    if (activeTab === 'videos') list = list.filter((i) => i.type === 'video');
    if (activeTab === 'products') list = list.filter((i) => i.type === 'product');
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.user.toLowerCase().includes(q)
      );
    }
    return list;
  }, [savedItems, activeTab, searchQuery]);

  const handleRemove = async (postId: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('saved_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId);
      if (error) throw error;
      setSavedItems((prev) => prev.filter((i) => i.id !== postId));
    } catch (e) {
      console.error('[SavedPage] remove saved', e);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="max-w-6xl mx-auto p-4 md:p-6 pb-24"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black">Saved</h1>
          <p className="text-sm text-gray-500">Items you've saved for later</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-64 space-y-2">
          <CollectionButton active={activeTab === 'all'} onClick={() => setActiveTab('all')} icon={<Bookmark size={18} />} label="All Items" />
          <CollectionButton active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} icon={<Grid size={18} />} label="Saved Posts" />
          <CollectionButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Bookmark size={18} />} label="Marketplace" />
          <CollectionButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} icon={<Bookmark size={18} />} label="Videos" />
        </div>

        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search saved items..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500"><Grid size={18} /></button>
              <button type="button" className="p-2 rounded-lg text-gray-400"><List size={18} /></button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((item) => (
                <SavedCard key={item.id} item={item} onRemove={() => handleRemove(item.id)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
              <Bookmark size={40} className="mb-3 opacity-40" />
              <p className="font-bold text-gray-700 dark:text-gray-300">No saved items</p>
              <p className="text-sm mt-1 max-w-sm">
                {activeTab === 'products'
                  ? 'Saved marketplace listings are not available yet. Saved posts and reels appear under Saved Posts and Videos.'
                  : 'Save posts from your feed to see them here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CollectionButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
        active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SavedCard({ item, onRemove }: { item: SavedListItem; onRemove: () => void }) {
  const isVideoThumb = item.type === 'video' && item.videoUrl && (!item.image || item.image === item.videoUrl);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm group">
      <div className="aspect-video relative bg-gray-900">
        {isVideoThumb ? (
          <video
            src={item.videoUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <img src={item.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 bg-black/50 text-white rounded-full backdrop-blur-sm hover:bg-red-500 transition-colors"
            aria-label="Remove from saved"
          >
            <Trash2 size={14} />
          </button>
          <button type="button" className="p-1.5 bg-black/50 text-white rounded-full backdrop-blur-sm">
            <MoreHorizontal size={14} />
          </button>
        </div>
        <div className="absolute bottom-2 left-2">
          <span className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider">
            {item.type}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-sm mb-1 line-clamp-2">{item.title}</h3>
        <p className="text-xs text-gray-500">
          {item.type === 'product' && item.price ? `Price: ${item.price}` : `Saved from @${item.user}`}
        </p>
      </div>
    </div>
  );
}

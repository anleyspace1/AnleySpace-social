import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Bookmark, Search, Grid, List, MoreHorizontal, Trash2, Coins, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { productImagePublicUrl } from '../lib/marketplaceImage';

export type SavedListItem = {
  id: string;
  type: 'post' | 'video' | 'product';
  title: string;
  user: string;
  image: string;
  videoUrl?: string;
  price?: string;
  /** Marketplace tab: optional fields for Marketplace-style cards */
  category?: string;
  priceCoins?: number;
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

/** Normalize UUID / id strings for Map lookup (trim + lowercase). */
function normProductId(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u0000/g, '');
}

const SUPABASE_IN_CHUNK = 100;

async function fetchMarketplaceRowsInChunks(ids: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += SUPABASE_IN_CHUNK) {
    const chunk = ids.slice(i, i + SUPABASE_IN_CHUNK);
    const { data, error } = await supabase.from('marketplace').select('*').in('id', chunk);
    if (error) {
      console.warn('[SavedPage] marketplace select chunk', chunk.length, error);
      continue;
    }
    if (data?.length) out.push(...(data as Record<string, unknown>[]));
  }
  return out;
}

export default function SavedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      const items: SavedListItem[] = [];

      try {
        const { data: saveRows, error: saveErr } = await supabase
          .from('saved_posts')
          .select('post_id')
          .eq('user_id', user.id);

        if (saveErr) throw saveErr;
        const postIds = (saveRows || []).map((r: { post_id: string }) => r.post_id).filter(Boolean);

        if (postIds.length > 0) {
          const { data: postsData, error: postsErr } = await supabase
            .from('posts')
            .select('*')
            .in('id', postIds);

          if (postsErr) throw postsErr;
          const byId = new Map((postsData || []).map((p: any) => [p.id, p]));
          const ordered = postIds.map((id) => byId.get(id)).filter(Boolean) as any[];

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
        }
      } catch (postBranchErr) {
        console.error('[SavedPage] saved_posts branch', postBranchErr);
      }

      const { data: smRows, error: smErr } = await supabase
        .from('saved_marketplace')
        .select('product_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!smErr && smRows?.length) {
        const productIds = [
          ...new Set(
            (smRows as { product_id: string }[]).map((r) => String(r.product_id ?? '').trim()).filter(Boolean)
          ),
        ];

        if (productIds.length > 0) {
          console.log('[SavedPage] saved marketplace productIds', productIds);

          const mRows = await fetchMarketplaceRowsInChunks(productIds);
          console.log('[SavedPage] marketplaceRows', mRows);

          const marketplaceById = new Map(
            mRows.map((r) => [normProductId(r.id as string), r])
          );

          const sellerIds = new Set<string>();
          for (const pid of productIds) {
            const key = normProductId(pid);
            const row = marketplaceById.get(key);
            const sid = row?.user_id as string | undefined;
            if (sid) sellerIds.add(String(sid).trim());
          }
          const sellerProf: Record<string, string> = {};
          if (sellerIds.size > 0) {
            const { data: sprofs } = await supabase
              .from('profiles')
              .select('id, username')
              .in('id', [...sellerIds]);
            (sprofs || []).forEach((sp: { id: string; username?: string | null }) => {
              sellerProf[normProductId(sp.id)] = (sp.username || '').trim() || 'Seller';
            });
          }

          for (const sm of smRows as { product_id: string }[]) {
            const pid = String(sm.product_id ?? '').trim();
            const key = normProductId(sm.product_id);
            const row = marketplaceById.get(key);

            const imageRaw =
              row != null ? ((row.image_url as string | null | undefined) ?? null) : null;
            const imageStr = imageRaw != null ? String(imageRaw).trim() : '';
            const imageUrl = imageStr ? (productImagePublicUrl(imageStr) || imageStr).trim() : '';

            const sellerIdRaw = row != null ? (row.user_id as string | undefined) : undefined;
            const sellerId = sellerIdRaw != null ? String(sellerIdRaw).trim() : '';
            const userLabel = sellerId ? sellerProf[normProductId(sellerId)] || 'Seller' : 'Seller';

            const title = row
              ? String(row.title ?? '').trim() || 'Product'
              : 'Saved product';
            const priceNum = row != null ? Number(row.price) : NaN;
            const priceLabel = Number.isFinite(priceNum) ? String(priceNum) : '—';

            items.push({
              id: pid || key,
              type: 'product',
              title: title.slice(0, 120),
              user: userLabel,
              image: imageUrl,
              price: priceLabel,
              category: row
                ? String((row as { category?: string }).category ?? '').trim() || 'Marketplace'
                : 'Marketplace',
              priceCoins: Number.isFinite(priceNum) ? priceNum : 0,
            });
          }
        }
      } else if (smErr) {
        console.warn('[SavedPage] saved_marketplace', smErr);
      }

      console.log('SAVED ITEMS:', items);
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

  const handleRemove = async (item: SavedListItem) => {
    if (!user?.id) return;
    try {
      if (item.type === 'product') {
        const { error } = await supabase
          .from('saved_marketplace')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_posts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', item.id);
        if (error) throw error;
      }
      setSavedItems((prev) => prev.filter((i) => i.id !== item.id));
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
            <div
              className={cn(
                'grid',
                activeTab === 'products'
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
              )}
            >
              {filtered.map((item) => (
                <SavedCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  onRemove={() => handleRemove(item)}
                  onOpenProduct={item.type === 'product' ? () => navigate(`/marketplace/product/${item.id}`) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
              <Bookmark size={40} className="mb-3 opacity-40" />
              <p className="font-bold text-gray-700 dark:text-gray-300">No saved items</p>
              <p className="text-sm mt-1 max-w-sm">
                {activeTab === 'products'
                  ? 'Save products from Marketplace with the heart on each listing.'
                  : 'Save posts from your feed to see them here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SavedProductThumb({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src.trim() || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <ShoppingBag size={40} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
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

function SavedCard({
  item,
  onRemove,
  onOpenProduct,
}: {
  item: SavedListItem;
  onRemove: () => void;
  onOpenProduct?: () => void;
}) {
  const isVideoThumb = item.type === 'video' && item.videoUrl && (!item.image || item.image === item.videoUrl);

  if (item.type === 'product') {
    return (
      <div
        role={onOpenProduct ? 'button' : undefined}
        tabIndex={onOpenProduct ? 0 : undefined}
        onClick={onOpenProduct}
        onKeyDown={
          onOpenProduct
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenProduct();
                }
              }
            : undefined
        }
        className={cn(
          'bg-white dark:bg-gray-900 rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 group flex flex-col shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300',
          onOpenProduct && 'cursor-pointer'
        )}
      >
        <div className="aspect-[1/1] relative overflow-hidden bg-gray-100 dark:bg-gray-800">
          <SavedProductThumb src={item.image} title={item.title} />
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
          </div>
          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 max-w-[85%] truncate">
            {item.category || 'Marketplace'}
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-bold text-base leading-tight line-clamp-1 mb-1">{item.title}</h3>
          <div className="flex items-center gap-1.5 text-indigo-600 font-black text-lg mb-2">
            <Coins size={16} />
            <span>
              {(item.priceCoins != null && !Number.isNaN(item.priceCoins)
                ? item.priceCoins
                : Number(item.price) || 0
              ).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">@{item.user}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role={onOpenProduct ? 'button' : undefined}
      tabIndex={onOpenProduct ? 0 : undefined}
      onClick={onOpenProduct}
      onKeyDown={
        onOpenProduct
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenProduct();
              }
            }
          : undefined
      }
      className={cn(
        'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm group',
        onOpenProduct && 'cursor-pointer'
      )}
    >
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
        <p className="text-xs text-gray-500">Saved from @{item.user}</p>
      </div>
    </div>
  );
}

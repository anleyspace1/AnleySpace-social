import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Mic, 
  ChevronRight, 
  Flame, 
  Gamepad2, 
  Music, 
  Shirt, 
  Smartphone, 
  Sparkles, 
  ShoppingBag, 
  Star,
  Pizza,
  X,
  User,
  Package,
  Coins
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/apiOrigin';
import { productImagePublicUrl } from '../lib/marketplaceImage';
import { fetchMarketplaceTableRowsAsApiProducts, mapMarketplaceRowsToProducts } from '../lib/marketplaceRemote';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ResponsiveImage } from '../components/ResponsiveImage';

const resolveProfileUsername = (username?: string | null) => {
  const value = (username || '').trim();
  if (!value) return 'User';
  return value;
};

const resolveCreatorDisplayName = (profile: { display_name?: string | null; username?: string | null }) => {
  const displayName = String(profile?.display_name || '').trim();
  if (displayName && !displayName.toLowerCase().startsWith('user_')) return displayName;
  return resolveProfileUsername(profile?.username);
};

type ExploreProductRow = {
  id: string;
  name: string;
  price: number;
  image: string;
  seller_id: string;
};

type ExploreCreatorRow = {
  id: string;
  username: string;
  displayName: string;
  avatar_url: string | null;
  followers_count: number;
};

type ExploreLiveRow = {
  id: string;
  name: string;
  viewers: string;
  image: string;
  username: string;
  color: string;
};

function isValidExploreProductUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (!url.startsWith('https://')) return false;
  if (u.includes('localhost') || u.includes('127.0.0.1')) return false;
  if (u.includes('picsum.photos') || u.includes('placehold')) return false;
  if (!u.includes('.supabase.co')) return false;
  return true;
}

function isValidExploreLiveCoverUrl(url: string): boolean {
  const u = url.trim();
  const l = u.toLowerCase();
  if (!u.startsWith('https://')) return false;
  if (l.includes('localhost') || l.includes('127.0.0.1')) return false;
  if (l.includes('picsum.photos') || l.includes('placehold')) return false;
  return true;
}

function isValidProfileAvatarUrl(url: string | null | undefined): boolean {
  const u = (url || '').trim();
  if (!u) return false;
  const lower = u.toLowerCase();
  if (lower.includes('picsum') || lower.includes('placehold')) return false;
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return false;
  return u.startsWith('https://');
}

const TRENDING_LINKS = [
  { id: '1', title: 'Viral Videos', target: '/reels', icon: <Flame size={14} className="text-orange-500" />, badge: null as string | null, gradient: 'from-orange-600/35 to-rose-950/60' },
  { id: '2', title: 'Trending Lives', target: '/live', icon: <Flame size={14} className="text-red-400" />, badge: 'LIVE' as string | null, gradient: 'from-red-600/35 to-indigo-950/60' },
  { id: '3', title: 'Marketplace', target: '/marketplace', icon: <ShoppingBag size={14} className="text-blue-400" />, badge: null as string | null, gradient: 'from-blue-600/35 to-slate-950/60' },
];

const CATEGORIES = [
  { id: 'gaming', name: 'Gaming', icon: <Gamepad2 size={24} />, color: 'bg-indigo-500/20 text-indigo-400' },
  { id: 'music', name: 'Music', icon: <Music size={24} />, color: 'bg-pink-500/20 text-pink-400' },
  { id: 'fashion', name: 'Fashion', icon: <Shirt size={24} />, color: 'bg-rose-500/20 text-rose-400' },
  { id: 'tech', name: 'Tech', icon: <Smartphone size={24} />, color: 'bg-blue-500/20 text-blue-400' },
  { id: 'beauty', name: 'Beauty', icon: <Sparkles size={24} />, color: 'bg-orange-500/20 text-orange-400' },
  { id: 'food', name: 'Food', icon: <Pizza size={24} />, color: 'bg-yellow-500/20 text-yellow-400' },
];

export default function ExplorePage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const navigate = useNavigate();
  const { user } = useAuth();

  React.useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [realCreators, setRealCreators] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [exploreProducts, setExploreProducts] = useState<ExploreProductRow[]>([]);
  const [suggestedCreators, setSuggestedCreators] = useState<ExploreCreatorRow[]>([]);
  const [liveStreams, setLiveStreams] = useState<ExploreLiveRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/marketplace/products'));
        const ct = res.headers.get('content-type') || '';
        let raw: unknown;
        try {
          if (!ct.includes('application/json')) raw = null;
          else raw = await res.json();
        } catch {
          raw = null;
        }
        if (cancelled) return;
        let data: Record<string, unknown>[] = [];
        if (res.ok && Array.isArray(raw)) data = raw as Record<string, unknown>[];
        if (!data.length) data = await fetchMarketplaceTableRowsAsApiProducts();
        if (!data.length) {
          const products: ExploreProductRow[] = [];
          console.log("EXPLORE PRODUCTS:", products);
          setExploreProducts(products);
        } else {
          const mapped = mapMarketplaceRowsToProducts(data);
          const products: ExploreProductRow[] = mapped.map((p) => ({
            id: p.id,
            name: p.title || 'Product',
            price: p.price || 0,
            image: p.image || '',
            seller_id: String((p as { seller_id?: string }).seller_id ?? '').trim(),
          }));
          console.log("EXPLORE PRODUCTS:", products);
          setExploreProducts(products);
        }
      } catch {
        if (!cancelled) {
          try {
            const data = await fetchMarketplaceTableRowsAsApiProducts();
            const mapped = mapMarketplaceRowsToProducts(data);
            const products: ExploreProductRow[] = mapped.map((p) => ({
              id: p.id,
              name: p.title || 'Product',
              price: p.price || 0,
              image: p.image || '',
              seller_id: String((p as { seller_id?: string }).seller_id ?? '').trim(),
            }));
            console.log("EXPLORE PRODUCTS:", products);
            setExploreProducts(products);
          } catch {
            const products: ExploreProductRow[] = [];
            console.log("EXPLORE PRODUCTS:", products);
            setExploreProducts(products);
          }
        }
      }

      try {
        let q = supabase.from('profiles').select('id, username, display_name, avatar_url').limit(15);
        if (user?.id) q = q.neq('id', user.id);
        const { data: profs, error } = await q;
        if (cancelled) return;
        if (error || !profs?.length) {
          const users: ExploreCreatorRow[] = [];
          console.log("EXPLORE USERS:", users);
          setSuggestedCreators(users);
        } else {
          const slice = profs.slice(0, 8);
          const users: ExploreCreatorRow[] = await Promise.all(
            slice.map(async (p: { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null }) => {
              const { count } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', p.id);
              return {
                id: p.id,
                username: resolveProfileUsername(p.username),
                displayName: resolveCreatorDisplayName(p),
                avatar_url: p.avatar_url ?? null,
                followers_count: count ?? 0,
              };
            })
          );
          console.log("EXPLORE USERS:", users);
          if (!cancelled) setSuggestedCreators(users);
        }
      } catch {
        if (!cancelled) {
          const users: ExploreCreatorRow[] = [];
          console.log("EXPLORE USERS:", users);
          setSuggestedCreators(users);
        }
      }

      try {
        const res = await fetch(apiUrl('/api/live-calls'));
        const data = await res.json();
        if (!cancelled) {
          if (!Array.isArray(data)) {
            setLiveStreams([]);
          } else {
            const mapped: ExploreLiveRow[] = data
              .map((c: Record<string, unknown>, i: number) => {
                const id = String(c.id ?? c.stream_id ?? `live-${i}`);
                const name = String(c.group_name ?? c.host_username ?? 'Live');
                const rawImg = String(c.group_image ?? '').trim();
                const resolved = productImagePublicUrl(rawImg);
                const image = isValidExploreProductUrl(resolved)
                  ? resolved
                  : isValidExploreLiveCoverUrl(rawImg)
                    ? rawImg
                    : '';
                const vc = c.viewer_count ?? c.viewers ?? 0;
                const viewers =
                  typeof vc === 'number' ? (vc >= 1000 ? `${(vc / 1000).toFixed(1)}K` : String(vc)) : String(vc || 0);
                return {
                  id,
                  name,
                  viewers,
                  image,
                  username: String(c.host_username ?? ''),
                  color: 'bg-indigo-500',
                };
              })
              .filter((row) => row.id);
            setLiveStreams(mapped);
          }
        }
      } catch {
        if (!cancelled) setLiveStreams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  React.useEffect(() => {
    // Sync all users from Supabase to local DB for search
    console.log('DEBUG: Triggering sync-all');
    fetch(apiUrl('/api/users/sync-all'), { method: 'POST' })
      .then(res => res.json())
      .then(data => console.log('DEBUG: Sync-all result:', data))
      .catch(err => console.error('DEBUG: Initial sync failed:', err));
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchProfiles();
      } else {
        setRealCreators([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchProfiles = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(apiUrl(`/api/users/search?q=${encodeURIComponent(searchQuery)}`));
      if (!response.ok) throw new Error('Search request failed');
      const data = await response.json();
      console.log('[Explore] /api/users/search sample', Array.isArray(data) ? data.slice(0, 1) : data);
      
      if (data && user) {
        // Check following status for each
        const followingMap: Record<string, boolean> = {};
        await Promise.all(data.map(async (p: any) => {
          try {
            const fRes = await fetch(apiUrl(`/api/users/${user.id}/following/${p.id}`));
            const fData = await fRes.json();
            if (fData.isFollowing) followingMap[p.id] = true;
          } catch (e) {
            console.error('DEBUG: Follow check error:', e);
          }
        }));
        
        setFollowing(prev => ({ ...prev, ...followingMap }));
      }
      
      setRealCreators((data || []).map((creator: any) => ({
        ...creator,
        username: resolveProfileUsername(creator.username)
      })));
    } catch (err) {
      console.error('DEBUG: Error searching profiles:', err);
    } finally {
      setSearching(false);
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = (searchQuery || '').toLowerCase();
    
    return {
      lives: liveStreams.filter(s => (s.name || '').toLowerCase().includes(query)),
      creators: realCreators,
      products: exploreProducts.filter(p => (p.name || '').toLowerCase().includes(query))
    };
  }, [searchQuery, realCreators, exploreProducts, liveStreams]);

  const isSearching = searchQuery.trim().length > 0;

  const handleFollow = async (e: React.MouseEvent, creatorId: string) => {
    e.stopPropagation();
    if (!user) {
      alert('Please login to follow creators');
      return;
    }

    const wasFollowing = following[creatorId];
    setFollowing(prev => ({ ...prev, [creatorId]: !wasFollowing }));

    try {
      const endpoint = wasFollowing ? apiUrl('/api/users/unfollow') : apiUrl('/api/users/follow');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followerId: user.id,
          followingId: creatorId
        })
      });

      if (!res.ok) throw new Error('Failed to toggle follow');
      
      // Also update Supabase for redundancy if needed
      if (wasFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', creatorId);
      } else {
        const { error: followInsertErr } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: creatorId });
        if (followInsertErr && followInsertErr.code !== '23505') throw followInsertErr;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      setFollowing(prev => ({ ...prev, [creatorId]: wasFollowing }));
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#050505] text-white pb-12"
    >
      {/* Search Bar */}
      <div className="px-4 pt-4 mb-6 sticky top-14 sm:top-16 bg-[#050505]/80 backdrop-blur-xl z-20 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search creators, lives, products..." 
              className="w-full bg-[#1a1c26] border-none rounded-2xl py-3.5 pl-12 pr-10 text-sm focus:ring-1 focus:ring-gray-700 transition-all placeholder:text-gray-500"
            />
            {isSearching && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button className="w-12 h-12 bg-[#1a1c26] rounded-2xl flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <Mic size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isSearching ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-4 space-y-8"
          >
            {/* Search Results Sections */}
            {searchResults && (searchResults.lives.length > 0 || searchResults.creators.length > 0 || searchResults.products.length > 0) ? (
              <>
                {searchResults.lives.length > 0 && (
                  <section>
                    <h2 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                      Live Streams
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {searchResults.lives.map(stream => (
                        <div 
                          key={stream.id} 
                          onClick={() => navigate('/live')}
                          className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer"
                        >
                          {stream.image ? (
                            <ResponsiveImage src={stream.image} width={64} height={40} className="w-16 h-10 rounded-lg object-cover" alt="" />
                          ) : (
                            <div className="w-16 h-10 rounded-lg bg-[#252836] flex items-center justify-center shrink-0">
                              <User size={16} className="text-gray-600" />
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="text-sm font-bold">{stream.name}</h3>
                            <p className="text-[10px] text-gray-500">{stream.viewers} watching</p>
                          </div>
                          <ChevronRight size={16} className="text-gray-600" />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {searchResults.creators.length > 0 && (
                  <section>
                    <h2 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                      <User size={14} />
                      Creators
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {searchResults.creators.map(creator => {
                        const avatarRaw = (creator as { avatar_url?: string | null; avatar?: string | null }).avatar_url
                          ?? (creator as { avatar?: string | null }).avatar
                          ?? null;
                        const avatarOk = isValidProfileAvatarUrl(avatarRaw);
                        const searchLabel = resolveCreatorDisplayName({
                          display_name: (creator as { full_name?: string | null; display_name?: string | null }).display_name
                            ?? (creator as { full_name?: string | null }).full_name,
                          username: creator.username,
                        });
                        return (
                        <div 
                          key={creator.id} 
                          onClick={() => navigate(`/profile/${creator.id}`)}
                          className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer"
                        >
                          {avatarOk ? (
                            <ResponsiveImage src={avatarRaw!} width={40} height={40} className="w-10 h-10 rounded-full object-cover" alt="" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#252836] flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                              {searchLabel.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold truncate">{searchLabel}</h3>
                          </div>
                          <button 
                            onClick={(e) => handleFollow(e, creator.id)}
                            className={cn(
                              "text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors",
                              following[creator.id] 
                                ? "bg-gray-700 text-white" 
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            )}
                          >
                            {following[creator.id] ? 'Following' : 'Follow'}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {searchResults.products.length > 0 && (
                  <section>
                    <h2 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                      <Package size={14} />
                      Products
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {searchResults.products.map(product => (
                        <div 
                          key={product.id} 
                          onClick={() => navigate(`/marketplace/product/${product.id}`)}
                          className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer"
                        >
                          <div className="w-10 h-10 bg-[#252836] rounded-lg flex items-center justify-center p-1">
                            <ResponsiveImage src={product.image} width={100} height={100} className="w-full h-full object-contain" alt="" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-bold">{product.name}</h3>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1">
                              <Coins size={10} />
                              {(product.price || 0).toLocaleString()}
                            </p>
                          </div>
                          <ShoppingBag size={16} className="text-gray-600" />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
                <Search size={48} className="mb-4 text-gray-700" />
                <h3 className="text-lg font-bold">No results found</h3>
                <p className="text-sm">Try searching for something else</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* LIVE NOW */}
            <section className="mb-10">
              <div className="px-4 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <h2 className="text-sm font-black uppercase tracking-wider">Live Now</h2>
                </div>
                <button 
                  onClick={() => navigate('/live')}
                  className="text-xs text-gray-500 font-bold flex items-center gap-1 hover:text-white transition-colors"
                >
                  See All <ChevronRight size={14} />
                </button>
              </div>
              {liveStreams.length === 0 ? (
                <div className="mx-4 rounded-2xl bg-[#1a1c26] py-10 px-4 text-center text-sm text-gray-500">
                  No live streams right now.
                </div>
              ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-4">
                {liveStreams.map((stream) => (
                  <div 
                    key={stream.id} 
                    onClick={() => navigate('/live')}
                    className="group cursor-pointer"
                  >
                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-2 bg-gradient-to-br from-[#252836] to-[#12141c]">
                      {stream.image ? (
                        <img 
                          src={stream.image} 
                          alt={stream.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User size={28} className="text-gray-600" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 bg-red-600 text-[9px] font-black px-1.5 py-0.5 rounded">
                        LIVE
                      </div>
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] font-bold bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded text-white">
                        <User size={10} /> {stream.viewers}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <div className={cn("w-1.5 h-1.5 rounded-full", stream.color)} />
                      <span className="text-[11px] font-bold text-gray-300 truncate">{stream.name}</span>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            {/* TRENDING */}
            <section className="mb-10">
              <div className="px-4 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-orange-500" />
                  <h2 className="text-sm font-black uppercase tracking-wider">Trending</h2>
                </div>
                <button 
                  onClick={() => navigate('/reels')}
                  className="text-xs text-gray-500 font-bold flex items-center gap-1 hover:text-white transition-colors"
                >
                  See All <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-4">
                {TRENDING_LINKS.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => navigate(item.target)}
                    className="group cursor-pointer"
                  >
                    <div className={cn(
                      'relative aspect-[4/3] rounded-xl overflow-hidden mb-2 bg-gradient-to-br flex items-center justify-center group-hover:opacity-95 transition-opacity',
                      item.gradient
                    )}>
                      {item.badge && (
                        <div className="absolute top-2 left-2 bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded z-10">
                          {item.badge}
                        </div>
                      )}
                      <div className="text-white/90 opacity-80 group-hover:scale-105 transition-transform duration-500">
                        {item.icon}
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1 truncate">
                        {item.title}
                      </span>
                      <ChevronRight size={12} className="text-gray-600 shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* CATEGORIES */}
            <section className="mb-10">
              <div className="px-4 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} className="text-blue-400" />
                  <h2 className="text-sm font-black uppercase tracking-wider">Categories</h2>
                </div>
                <button 
                  onClick={() => navigate('/marketplace')}
                  className="text-xs text-gray-500 font-bold flex items-center gap-1 hover:text-white transition-colors"
                >
                  See All <ChevronRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 px-4">
                {CATEGORIES.map((cat) => (
                  <div 
                    key={cat.id} 
                    onClick={() => setSearchQuery(cat.name)}
                    className="flex flex-col items-center gap-2 group cursor-pointer"
                  >
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-all group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-indigo-500/10", cat.color)}>
                      {React.cloneElement(cat.icon as React.ReactElement, { size: 20 })}
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter text-center">{cat.name}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* POPULAR PRODUCTS */}
            <section className="mb-10">
              <div className="px-4 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} className="text-blue-500" />
                  <h2 className="text-sm font-black uppercase tracking-wider">Popular Products</h2>
                </div>
                <button 
                  onClick={() => navigate('/marketplace')}
                  className="text-xs text-gray-500 font-bold flex items-center gap-1 hover:text-white transition-colors"
                >
                  See All <ChevronRight size={14} />
                </button>
              </div>
              {exploreProducts.length === 0 ? (
                <div className="mx-4 rounded-2xl bg-[#1a1c26] py-10 px-4 text-center text-sm text-gray-500">
                  No products yet. Listings from creators will show up here.
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4">
                {exploreProducts.slice(0, 8).map(product => (
                  <div 
                    key={product.id} 
                    onClick={() => navigate(`/marketplace/product/${product.id}`)}
                    className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer hover:bg-[#252836] transition-colors"
                  >
                    <div className="w-14 h-14 bg-[#252836] rounded-xl flex items-center justify-center p-2 shrink-0">
                      <img 
                        src={product.image} 
                        alt={product.name} 
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[13px] font-bold text-gray-200 truncate">{product.name}</h3>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1">
                        <Coins size={12} className="text-indigo-400 shrink-0" />
                        {(product.price || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            {/* SUGGESTED CREATORS */}
            <section className="mb-10">
              <div className="px-4 flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Star size={18} className="text-yellow-500" />
                  <h2 className="text-sm font-black uppercase tracking-wider">Suggested Creators</h2>
                </div>
                <button 
                  onClick={() => navigate('/friends')}
                  className="text-xs text-gray-500 font-bold flex items-center gap-1 hover:text-white transition-colors"
                >
                  See All <ChevronRight size={14} />
                </button>
              </div>
              {suggestedCreators.length === 0 ? (
                <div className="mx-4 rounded-2xl bg-[#1a1c26] py-10 px-4 text-center text-sm text-gray-500">
                  No suggested creators yet.
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4">
                {suggestedCreators.map(creator => {
                  const av = creator.avatar_url;
                  const avOk = isValidProfileAvatarUrl(av);
                  return (
                  <div 
                    key={creator.id} 
                    onClick={() => navigate(`/profile/${creator.id}`)}
                    className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer hover:bg-[#252836] transition-colors"
                  >
                    <div className="relative shrink-0">
                      {avOk ? (
                        <img 
                          src={av!} 
                          alt={creator.displayName} 
                          className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500/20"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#252836] border-2 border-indigo-500/20 flex items-center justify-center text-sm font-bold text-gray-400">
                          {creator.displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[13px] font-bold text-gray-200 truncate">{creator.displayName}</h3>
                      <p className="text-[11px] text-gray-500">
                        {(creator.followers_count ?? 0).toLocaleString()} followers
                      </p>
                    </div>
                    <button 
                      onClick={(e) => handleFollow(e, creator.id)}
                      className={cn(
                        "text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0",
                        following[creator.id] 
                          ? "bg-gray-700 text-white" 
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      )}
                    >
                      {following[creator.id] ? 'Following' : 'Follow'}
                    </button>
                  </div>
                  );
                })}
              </div>
              )}
            </section>

            {/* FEATURED (first marketplace product) */}
            {exploreProducts[0] && (
            <section className="px-4 mb-10">
              <div 
                onClick={() => navigate(`/marketplace/product/${exploreProducts[0].id}`)}
                className="relative rounded-2xl overflow-hidden group cursor-pointer"
              >
                <img 
                  src={exploreProducts[0].image} 
                  alt={exploreProducts[0].name} 
                  className="w-full aspect-[21/9] object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-white/10 backdrop-blur-md text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-white/10">
                      Featured
                    </span>
                  </div>
                  <h3 className="text-base font-black mb-0.5 truncate pr-4">{exploreProducts[0].name}</h3>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Coins size={10} />
                    {(exploreProducts[0].price || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

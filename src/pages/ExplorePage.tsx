import React, { useState, useMemo } from 'react';
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
  Plus,
  Pizza,
  X,
  User,
  Package
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/apiOrigin';
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

// Mock Data
const LIVE_STREAMS = [
  { id: '1', name: 'GamerMax', viewers: '2.1K', image: 'https://picsum.photos/seed/gamer/400/250', color: 'bg-blue-500', username: 'gamer_max' },
  { id: '2', name: 'AnnaLive', viewers: '1.8K', image: 'https://picsum.photos/seed/anna/400/250', color: 'bg-red-500', username: 'anna_live' },
  { id: '3', name: 'ChefTommy', viewers: '950', image: 'https://picsum.photos/seed/chef/400/250', color: 'bg-yellow-500', username: 'chef_tommy' },
  { id: '4', name: 'TechTalk', viewers: '3.4K', image: 'https://picsum.photos/seed/tech/400/250', color: 'bg-indigo-500', username: 'tech_talk' },
];

const TRENDING = [
  { id: '1', title: 'Popular Creators', image: 'https://picsum.photos/seed/creators/400/250', target: '/explore' },
  { id: '2', title: 'Viral Videos', image: 'https://picsum.photos/seed/viral/400/250', icon: <Flame size={14} className="text-orange-500" />, target: '/reels' },
  { id: '3', title: 'Trending Lives', image: 'https://picsum.photos/seed/trending/400/250', badge: 'LIVE', target: '/live' },
];

const CATEGORIES = [
  { id: 'gaming', name: 'Gaming', icon: <Gamepad2 size={24} />, color: 'bg-indigo-500/20 text-indigo-400' },
  { id: 'music', name: 'Music', icon: <Music size={24} />, color: 'bg-pink-500/20 text-pink-400' },
  { id: 'fashion', name: 'Fashion', icon: <Shirt size={24} />, color: 'bg-rose-500/20 text-rose-400' },
  { id: 'tech', name: 'Tech', icon: <Smartphone size={24} />, color: 'bg-blue-500/20 text-blue-400' },
  { id: 'beauty', name: 'Beauty', icon: <Sparkles size={24} />, color: 'bg-orange-500/20 text-orange-400' },
  { id: 'food', name: 'Food', icon: <Pizza size={24} />, color: 'bg-yellow-500/20 text-yellow-400' },
];

const PRODUCTS = [
  { id: 'p1', name: 'Headphones', price: 29, image: 'https://picsum.photos/seed/headphone/100/100', buyers: 7 },
  { id: 'p2', name: 'Smart Watch', price: 199, image: 'https://picsum.photos/seed/watch/100/100', buyers: 12 },
  { id: 'p3', name: 'Gaming Mouse', price: 45, image: 'https://picsum.photos/seed/mouse/100/100', buyers: 24 },
];

const CREATORS = [
  { id: 'c1', name: 'Mike Gaming', username: 'mike_gaming', followers: '68K', avatar: 'https://picsum.photos/seed/mike/100/100' },
  { id: 'c2', name: 'Sarah Style', username: 'sarah_style', followers: '120K', avatar: 'https://picsum.photos/seed/sarah/100/100' },
  { id: 'c3', name: 'Chef Alex', username: 'chef_alex', followers: '45K', avatar: 'https://picsum.photos/seed/alex/100/100' },
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
      lives: LIVE_STREAMS.filter(s => (s.name || '').toLowerCase().includes(query)),
      creators: realCreators,
      products: PRODUCTS.filter(p => (p.name || '').toLowerCase().includes(query))
    };
  }, [searchQuery, realCreators]);

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
                          <ResponsiveImage src={stream.image} width={64} height={40} className="w-16 h-10 rounded-lg object-cover" alt="" />
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
                      {searchResults.creators.map(creator => (
                        <div 
                          key={creator.id} 
                          onClick={() => navigate(`/profile/${creator.id}`)}
                          className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer"
                        >
                          <ResponsiveImage src={creator.avatar_url || `https://picsum.photos/seed/${creator.id}/100/100`} width={40} height={40} className="w-10 h-10 rounded-full object-cover" alt="" />
                          <div className="flex-1">
                            <h3 className="text-sm font-bold">{resolveCreatorDisplayName(creator)}</h3>
                            <p className="text-[10px] text-gray-500">{creator.followers_count || 0} followers</p>
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
                      ))}
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
                            <p className="text-[10px] text-gray-500">$ {product.price}</p>
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-4">
                {LIVE_STREAMS.map((stream) => (
                  <div 
                    key={stream.id} 
                    onClick={() => navigate('/live')}
                    className="group cursor-pointer"
                  >
                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-2">
                      <img 
                        src={stream.image} 
                        alt={stream.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
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
                {TRENDING.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => navigate(item.target)}
                    className="group cursor-pointer"
                  >
                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-2">
                      <img 
                        src={item.image} 
                        alt={item.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      {item.badge && (
                        <div className="absolute top-2 left-2 bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded">
                          {item.badge}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1 truncate">
                        {item.icon}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4">
                {PRODUCTS.slice(0, 2).map(product => (
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
                      <p className="text-[11px] text-gray-500">$ {product.price}</p>
                    </div>
                    <div className="flex items-center -space-x-1.5 shrink-0">
                      <img src="https://picsum.photos/seed/u1/40/40" className="w-5 h-5 rounded-full border-2 border-[#1a1c26]" alt="" />
                      <img src="https://picsum.photos/seed/u2/40/40" className="w-5 h-5 rounded-full border-2 border-[#1a1c26]" alt="" />
                      <div className="w-5 h-5 rounded-full bg-gray-700 border-2 border-[#1a1c26] flex items-center justify-center text-[7px] font-bold">
                        +{product.buyers}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4">
                {CREATORS.map(creator => (
                  <div 
                    key={creator.id} 
                    onClick={() => navigate(`/profile/${creator.username}`)}
                    className="bg-[#1a1c26] p-3 rounded-2xl flex items-center gap-3 group cursor-pointer hover:bg-[#252836] transition-colors"
                  >
                    <div className="relative shrink-0">
                      <img 
                        src={creator.avatar} 
                        alt={creator.name} 
                        className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500/20"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#1a1c26] rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[13px] font-bold text-gray-200 truncate">{creator.name}</h3>
                      <p className="text-[11px] text-gray-500">{creator.followers} followers</p>
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
                ))}
              </div>
            </section>

            {/* FEATURED SPONSORED */}
            <section className="px-4 mb-10">
              <div 
                onClick={() => navigate('/marketplace/product/p1')}
                className="relative rounded-2xl overflow-hidden group cursor-pointer"
              >
                <img 
                  src="https://picsum.photos/seed/scooter/800/400" 
                  alt="XYZ Electric Scooter" 
                  className="w-full aspect-[21/9] object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-white/10 backdrop-blur-md text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-white/10">
                      Sponsored
                    </span>
                  </div>
                  <h3 className="text-base font-black mb-0.5">XYZ Electric Scooter</h3>
                  <p className="text-[10px] text-gray-400">35% OFF on All Models! Limited Time Offer</p>
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserPlus, UserMinus, Check, X, Search, MoreHorizontal, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<'following' | 'followers' | 'suggested'>('following');
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [followingStatus, setFollowingStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.id) {
      setFollowing([]);
      setFollowers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchFollowing(), fetchFollowers(), fetchSuggested()]).finally(() => setLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'suggested' && searchQuery.trim()) {
      const timer = setTimeout(() => {
        searchNewPeople();
      }, 500);
      return () => clearTimeout(timer);
    } else if (activeTab === 'suggested' && !searchQuery.trim()) {
      fetchSuggested();
    }
  }, [searchQuery, activeTab]);

  const mapProfileRow = (p: any) => ({
    ...p,
    full_name: p.full_name || p.display_name || p.username,
    display_name: p.display_name || p.full_name || p.username,
  });

  const fetchFollowing = async () => {
    if (!user?.id) return;
    try {
      const { data: rows, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      console.log('[FriendsPage] following: follows table (follower_id = current user)', {
        rowCount: rows?.length,
        rows,
        error: error?.message,
      });
      if (error) throw error;
      const ids = (rows || []).map((r: any) => r.following_id).filter(Boolean);
      console.log('[FriendsPage] following: ids from follows', ids);

      let followingData: any[] = [];
      if (ids.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('*')
          .in('id', ids);

        console.log('[FriendsPage] following: profiles .in(id)', {
          count: profiles?.length,
          error: pErr?.message,
        });
        if (pErr) throw pErr;
        followingData = (profiles || []).map(mapProfileRow);
      }

      if (followingData.length === 0) {
        const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/following-list`);
        if (res.ok) {
          const list = await res.json();
          followingData = Array.isArray(list) ? list.map(mapProfileRow) : [];
          console.log('[FriendsPage] following: SQLite API fallback count', followingData.length);
        }
      }

      setFollowing(followingData);

      setFollowingStatus((prev) => {
        const next = { ...prev };
        followingData.forEach((f: any) => {
          next[f.id] = true;
        });
        return next;
      });
    } catch (err) {
      console.error('Error fetching following:', err);
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(user!.id)}/following-list`);
        if (res.ok) {
          const list = await res.json();
          const followingData = Array.isArray(list) ? list.map(mapProfileRow) : [];
          console.log('[FriendsPage] following: error path SQLite fallback count', followingData.length);
          setFollowing(followingData);
          setFollowingStatus((prev) => {
            const next = { ...prev };
            followingData.forEach((f: any) => {
              next[f.id] = true;
            });
            return next;
          });
          return;
        }
      } catch (e) {
        console.error('Following SQLite fallback failed:', e);
      }
      setFollowing([]);
    }
  };

  const fetchFollowers = async () => {
    if (!user?.id) return;
    try {
      const { data: rows, error } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', user.id);

      console.log('[FriendsPage] followers: follows table (following_id = current user)', {
        rowCount: rows?.length,
        rows,
        error: error?.message,
      });
      if (error) throw error;
      const ids = (rows || []).map((r: any) => r.follower_id).filter(Boolean);
      console.log('[FriendsPage] followers: ids from follows', ids);

      let followersData: any[] = [];
      if (ids.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('*')
          .in('id', ids);

        console.log('[FriendsPage] followers: profiles .in(id)', {
          count: profiles?.length,
          error: pErr?.message,
        });
        if (pErr) throw pErr;
        followersData = (profiles || []).map(mapProfileRow);
      }

      if (followersData.length === 0) {
        const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/followers-list`);
        if (res.ok) {
          const list = await res.json();
          followersData = Array.isArray(list) ? list.map(mapProfileRow) : [];
          console.log('[FriendsPage] followers: SQLite API fallback count', followersData.length);
        }
      }

      setFollowers(followersData);
    } catch (err) {
      console.error('Error fetching followers:', err);
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(user!.id)}/followers-list`);
        if (res.ok) {
          const list = await res.json();
          const followersData = Array.isArray(list) ? list.map(mapProfileRow) : [];
          console.log('[FriendsPage] followers: error path SQLite fallback count', followersData.length);
          setFollowers(followersData);
          return;
        }
      } catch (e) {
        console.error('Followers SQLite fallback failed:', e);
      }
      setFollowers([]);
    }
  };

  const fetchSuggested = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .limit(8);
      
      if (error) throw error;
      setSuggested(data);
    } catch (err) {
      console.error('Error fetching suggested:', err);
    }
  };

  const searchNewPeople = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
        .neq('id', user?.id)
        .limit(10);
      
      if (error) throw error;
      setSuggested(data || []);
    } catch (err) {
      console.error('Error searching people:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (creatorId: string) => {
    if (!user) return;
    const wasFollowing = followingStatus[creatorId];
    setFollowingStatus(prev => ({ ...prev, [creatorId]: !wasFollowing }));

    try {
      if (wasFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', creatorId);
        setFollowing(prev => prev.filter(f => f.id !== creatorId));
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: creatorId });
        // Refresh both lists to ensure consistency
        fetchFollowing();
        fetchFollowers();
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      setFollowingStatus(prev => ({ ...prev, [creatorId]: wasFollowing }));
    }
  };

  const handleUnfriend = async (id: string) => {
    if (!user) return;
    if (window.confirm('Are you sure you want to unfollow this user?')) {
      try {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', id);
        setFollowing(prev => prev.filter(f => f.id !== id));
        setFollowingStatus(prev => ({ ...prev, [id]: false }));
      } catch (err) {
        console.error('Error unfollowing:', err);
      }
    }
  };

  const filteredFollowing = following.filter(f => 
    (f.display_name || f.full_name || f.username || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const filteredFollowers = followers.filter(f => 
    (f.display_name || f.full_name || f.username || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="lg:max-w-4xl lg:mx-auto p-0 lg:p-6 pb-12"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-4 lg:px-0 pt-4 lg:pt-0">
        <h1 className="text-2xl font-black">Social</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search people..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all text-sm w-full md:w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-8 px-4 lg:px-0">
        <TabButton active={activeTab === 'following'} onClick={() => setActiveTab('following')} label="Following" count={filteredFollowing.length} />
        <TabButton active={activeTab === 'followers'} onClick={() => setActiveTab('followers')} label="Followers" count={filteredFollowers.length} />
        <TabButton active={activeTab === 'suggested'} onClick={() => setActiveTab('suggested')} label="Suggested" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-4 px-2 lg:px-0">
        {activeTab === 'following' && (
          loading ? (
            <div className="col-span-full py-12 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
          ) : filteredFollowing.length > 0 ? (
            filteredFollowing.map(person => (
              <FriendCard 
                key={person.id} 
                friend={person} 
                type="friend" 
                onAction={() => handleUnfriend(person.id)} 
              />
            ))
          ) : (
            <div className="col-span-full py-12 text-center px-4">
              <p className="text-gray-500 text-sm">You aren't following anyone yet</p>
            </div>
          )
        )}
        {activeTab === 'followers' && (
          filteredFollowers.length > 0 ? (
            filteredFollowers.map(person => (
              <FriendCard 
                key={person.id} 
                friend={person} 
                type="suggested" 
                isFollowing={followingStatus[person.id]}
                onAction={() => handleFollow(person.id)} 
              />
            ))
          ) : (
            <div className="col-span-full py-12 text-center px-4">
              <p className="text-gray-500 text-sm">No followers yet</p>
            </div>
          )
        )}
        {activeTab === 'suggested' && (
          searching ? (
            <div className="col-span-full py-12 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
          ) : suggested.map(person => (
            <FriendCard 
              key={person.id} 
              friend={person} 
              type="suggested" 
              isFollowing={followingStatus[person.id]}
              onAction={() => handleFollow(person.id)}
            />
          ))
        )}
      </div>
    </motion.div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2",
        active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-white dark:bg-gray-900 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800"
      )}
    >
      {label}
      {count !== undefined && <span className={cn("px-1.5 py-0.5 rounded-md text-[10px]", active ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800 text-gray-400")}>{count}</span>}
    </button>
  );
}

interface FriendCardProps {
  key?: React.Key;
  friend: any;
  type: 'friend' | 'request' | 'suggested';
  isFollowing?: boolean;
  onAction?: (action?: any) => void;
}

function FriendCard({ friend, type, isFollowing, onAction }: FriendCardProps) {
  const navigate = useNavigate();
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center shadow-sm group relative"
    >
      <div 
        className="relative mb-3 cursor-pointer"
        onClick={() => navigate(`/profile/${friend.username}`)}
      >
        <img src={friend.avatar_url || `https://picsum.photos/seed/${friend.id}/100/100`} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-transparent group-hover:border-indigo-500 transition-all" />
        <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>
      </div>
      
      <div className="mb-4 flex-1">
        <h3 className="font-bold text-xs sm:text-sm group-hover:text-indigo-600 transition-colors line-clamp-1">
          {friend.full_name || friend.username}
        </h3>
        <p className="text-[10px] text-gray-500">{friend.followers_count || 0} followers</p>
      </div>

      <div className="w-full space-y-2">
        {type === 'friend' && (
          <button 
            onClick={() => onAction?.()}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-all"
          >
            <UserMinus size={14} />
            Unfollow
          </button>
        )}
        {type === 'request' && (
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => onAction?.('accept')}
              className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/10 flex items-center justify-center"
            >
              <Check size={16} />
            </button>
            <button 
              onClick={() => onAction?.('decline')}
              className="bg-gray-100 dark:bg-gray-800 text-gray-500 p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {type === 'suggested' && (
          <button 
            onClick={() => onAction?.()}
            className={cn(
              "w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5",
              isFollowing 
                ? "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700" 
                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/10"
            )}
          >
            {isFollowing ? <UserMinus size={14} /> : <UserPlus size={14} />}
            {isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

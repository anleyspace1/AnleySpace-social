import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Edit3, 
  Share2, 
  Wallet, 
  Gift, 
  BarChart3, 
  Grid, 
  Play, 
  Bookmark, 
  ChevronRight,
  Coins,
  Users,
  UserPlus,
  Verified,
  X,
  Search,
  ArrowLeft,
  MessageCircle,
  Heart,
  Send,
  MoreHorizontal,
  Maximize2
} from 'lucide-react';
import { NavLink, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { MOCK_USER, MOCK_VIDEOS } from '../constants';
import { cn } from '../lib/utils';
import { Post, Video } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from '../components/ShareModal';
import StoryEditor from '../components/StoryEditor';
import { ResponsiveImage } from '../components/ResponsiveImage';

export default function ProfilePage() {
  const { id: profileIdParam } = useParams();
  const navigate = useNavigate();
  const { user, profile: myProfile } = useAuth();
  const [searchParams] = useSearchParams();
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [savedItems, setSavedItems] = useState<Post[]>([]);

  const isOwnProfile = !profileIdParam || (myProfile && profileIdParam === myProfile.id);

  useEffect(() => {
    fetchProfile();
  }, [profileIdParam, myProfile]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      let profileData;
      if (isOwnProfile && myProfile) {
        profileData = myProfile;
      } else if (profileIdParam) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profileIdParam)
          .single();
        
        if (error) throw error;
        profileData = data;
      }

      if (profileData) {
        // Fetch extra data from local DB (counts, etc)
        let localData = { followers_count: 0, following_count: 0, bio: profileData.bio };
        try {
          console.log(`DEBUG: Fetching local data for ${profileData.id}`);
          const res = await fetch(`/api/user/${profileData.id}`);
          if (!res.ok) {
            console.error(`DEBUG: Local API error: ${res.status} ${res.statusText}`);
          } else {
            const data = await res.json();
            console.log('DEBUG: Local data received:', data);
            if (!data.error) {
              localData = data;
            }
          }
        } catch (e) {
          console.error('DEBUG: Failed to fetch local user data:', e);
        }

        const formattedProfile = {
          id: profileData.id,
          username: profileData.username,
          displayName: profileData.display_name || profileData.username,
          avatar: profileData.avatar_url || `https://picsum.photos/seed/${profileData.id}/200/200`,
          bio: localData.bio || profileData.bio || 'Digital creator and enthusiast. Sharing my journey on AnleySpace! ✨',
          coins: profileData.coins || 0,
          followers: localData.followers_count || 0,
          following: localData.following_count || 0,
          isVerified: profileData.is_verified || false,
        };
        setUserProfile(formattedProfile);
        fetchPosts(profileData.id);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const formattedPosts: Post[] = data.map(p => ({
        id: p.id,
        image: p.image_url,
        user: { 
          username: userProfile?.username || '', 
          avatar: userProfile?.avatar || '' 
        },
        caption: p.content,
        likes: p.likes_count,
        comments: p.comments_count,
        shares: p.shares_count,
        timestamp: new Date(p.created_at).toLocaleDateString()
      }));
      setUserPosts(formattedPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
    }
  };

  const fetchSavedPosts = useCallback(async () => {
    if (!user?.id || !isOwnProfile) {
      setSavedItems([]);
      return;
    }
    try {
      console.log('[Profile] fetchSavedPosts start', user.id);
      const { data: saveRows, error: saveErr } = await supabase
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', user.id);

      if (saveErr) throw saveErr;
      const ids = (saveRows || []).map((r: { post_id: string }) => r.post_id).filter(Boolean);
      console.log('[Profile] fetchSavedPosts saved row count', ids.length, ids);

      if (ids.length === 0) {
        setSavedItems([]);
        return;
      }

      const { data: postsData, error: postsErr } = await supabase
        .from('posts')
        .select('*')
        .in('id', ids);

      if (postsErr) throw postsErr;

      const byId = new Map((postsData || []).map((p: any) => [p.id, p]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];

      const authorIds = [...new Set(ordered.map((p) => p.user_id).filter(Boolean))];
      let profById: Record<string, { username?: string; avatar_url?: string }> = {};
      if (authorIds.length > 0) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', authorIds);
        if (profErr) {
          console.error('[Profile] fetchSavedPosts profiles error', profErr);
        } else {
          (profs || []).forEach((p: any) => {
            profById[p.id] = p;
          });
        }
      }

      const formatted: Post[] = ordered.map((p: any) => {
        const prof = profById[p.user_id];
        return {
          id: p.id,
          image: p.image_url || p.video_url,
          videoUrl: p.video_url,
          user: {
            username: prof?.username || 'Unknown',
            avatar: prof?.avatar_url || `https://picsum.photos/seed/${p.user_id}/100/100`,
          },
          caption: p.content,
          likes: p.likes_count ?? 0,
          comments: p.comments_count ?? 0,
          shares: p.shares_count ?? 0,
          timestamp: new Date(p.created_at).toLocaleDateString(),
        };
      });

      setSavedItems(formatted);
      console.log('[Profile] fetchSavedPosts done', formatted.length);
    } catch (err) {
      console.error('[Profile] fetchSavedPosts error', err);
      setSavedItems([]);
    }
  }, [user?.id, isOwnProfile]);

  const displayUser = userProfile || {
    username: 'Unknown User',
    displayName: 'Unknown User',
    avatar: `https://picsum.photos/seed/${profileIdParam || 'unknown-user'}/200/200`,
    bio: '',
    coins: 0,
    isVerified: false,
  };

  const [userVideos] = useState<Video[]>(MOCK_VIDEOS.filter(v => v.user.username === displayUser.username || isOwnProfile).slice(0, 4));

  useEffect(() => {
    const postId = searchParams.get('post');
    if (postId) {
      const post = userPosts.find(p => p.id === postId) || savedItems.find(p => p.id === postId);
      if (post) {
        setSelectedPost(post);
      }
    }
  }, [searchParams, userPosts, savedItems]);

  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
  const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<'Posts' | 'Videos' | 'Saved'>('Posts');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    if (activeTab === 'Saved' && isOwnProfile && user?.id) {
      fetchSavedPosts();
    }
  }, [activeTab, isOwnProfile, user?.id, fetchSavedPosts]);

  useEffect(() => {
    if (userProfile) {
      setFollowersCount(userProfile.followers);
      setFollowingCount(userProfile.following);
      setIsVerified(userProfile.isVerified);
      if (user && userProfile.id !== user.id) {
        checkIfFollowing();
      }
    }
  }, [userProfile, user]);

  const checkIfFollowing = async () => {
    if (!user || !userProfile) return;
    try {
      const res = await fetch(`/api/users/${user.id}/following/${userProfile.id}`);
      const data = await res.json();
      setIsFollowing(data.isFollowing);
    } catch (err) {
      console.error('Error checking follow status:', err);
    }
  };

  const handleFollowToggle = async () => {
    if (!user || !userProfile) {
      alert('Please login to follow users');
      return;
    }

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowersCount(prev => wasFollowing ? Math.max(0, prev - 1) : prev + 1);

    try {
      const endpoint = wasFollowing ? '/api/users/unfollow' : '/api/users/follow';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followerId: user.id,
          followingId: userProfile.id
        })
      });

      if (!res.ok) throw new Error('Failed to toggle follow');

      // Also update Supabase for redundancy
      if (wasFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userProfile.id);
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: userProfile.id });
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      setIsFollowing(wasFollowing);
      setFollowersCount(prev => wasFollowing ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  const handleVerify = async () => {
    if (!user) return;
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/user/${user.id}/verify`, { method: 'POST' });
      if (res.ok) {
        setIsVerified(true);
        alert('Congratulations! Your profile is now verified. 🎖️');
      }
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    if (isFollowersModalOpen) {
      fetchFollowers();
    }
  }, [isFollowersModalOpen, userProfile]);

  useEffect(() => {
    if (isFollowingModalOpen) {
      fetchFollowing();
    }
  }, [isFollowingModalOpen, userProfile]);

  const fetchFollowers = async () => {
    if (!userProfile) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('follows')
        .select(`
          follower_id,
          profiles:follower_id (
            id,
            username,
            full_name,
            avatar_url
          )
        `)
        .eq('following_id', userProfile.id);
      
      if (error) throw error;
      
      const followers = data.map((f: any) => Array.isArray(f.profiles) ? f.profiles[0] : f.profiles).filter(Boolean);
      
      let followingIds: string[] = [];
      if (user) {
        const { data: myFollowing } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        followingIds = myFollowing?.map(f => f.following_id) || [];
      }

      setFollowersList(followers.map(p => ({
        id: p.id,
        username: p.username,
        name: p.full_name || p.username,
        avatar: p.avatar_url || `https://picsum.photos/seed/${p.id}/100/100`,
        isFollowing: followingIds.includes(p.id)
      })).filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
    } catch (err) {
      console.error('Error fetching followers:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchFollowing = async () => {
    if (!userProfile) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('follows')
        .select(`
          following_id,
          profiles:following_id (
            id,
            username,
            full_name,
            avatar_url
          )
        `)
        .eq('follower_id', userProfile.id);
      
      if (error) throw error;
      
      const following = data.map((f: any) => Array.isArray(f.profiles) ? f.profiles[0] : f.profiles).filter(Boolean);
      
      let myFollowingIds: string[] = [];
      if (user) {
        const { data: myFollowing } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        myFollowingIds = myFollowing?.map(f => f.following_id) || [];
      }

      setFollowingList(following.map(p => ({
        id: p.id,
        username: p.username,
        name: p.full_name || p.username,
        avatar: p.avatar_url || `https://picsum.photos/seed/${p.id}/100/100`,
        isFollowing: myFollowingIds.includes(p.id)
      })).filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
    } catch (err) {
      console.error('Error fetching following:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleToggleFollowUser = async (targetUserId: string) => {
    if (!user) return;
    
    const targetInFollowers = followersList.find(u => u.id === targetUserId);
    const targetInFollowing = followingList.find(u => u.id === targetUserId);
    const target = targetInFollowers || targetInFollowing;
    
    if (!target) return;

    const wasFollowing = target.isFollowing;
    
    // Optimistic update
    const updateList = (list: any[]) => list.map(u => u.id === targetUserId ? { ...u, isFollowing: !wasFollowing } : u);
    setFollowersList(updateList);
    setFollowingList(updateList);

    try {
      if (wasFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId);
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId });
      }
      
      if (isOwnProfile) {
        setFollowingCount(prev => wasFollowing ? prev - 1 : prev + 1);
      }
    } catch (err) {
      console.error('Error toggling follow in list:', err);
      const rollbackList = (list: any[]) => list.map(u => u.id === targetUserId ? { ...u, isFollowing: wasFollowing } : u);
      setFollowersList(rollbackList);
      setFollowingList(rollbackList);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="lg:max-w-4xl lg:mx-auto p-0 lg:p-8 pb-12"
    >
      {!isOwnProfile && (
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors mb-6 px-4 lg:px-0 group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold">Back</span>
        </button>
      )}

      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-12 px-4 lg:px-0 pt-4 lg:pt-0">
        <div className="relative">
          <div 
            onClick={() => setIsStoryOpen(true)}
            className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 cursor-pointer hover:scale-105 transition-transform active:scale-95 group"
          >
            <div className="w-full h-full rounded-full border-4 border-white dark:border-black overflow-hidden relative">
              <ResponsiveImage 
                src={displayUser.avatar} 
                alt={displayUser.username} 
                width={200}
                height={200}
                className="w-full h-full object-cover group-hover:brightness-90 transition-all" 
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Play size={24} className="text-white fill-white" />
              </div>
            </div>
          </div>
          {isOwnProfile && (
            <button 
              onClick={() => navigate('/profile/edit')}
              className="absolute bottom-2 right-2 bg-indigo-600 text-white p-2 rounded-full border-4 border-white dark:border-black shadow-lg"
            >
              <Edit3 size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center justify-center md:justify-start gap-2">
                {displayUser.displayName}
                {(isOwnProfile ? isVerified : displayUser.isVerified) && <Verified size={20} className="text-indigo-500 fill-indigo-500/20" />}
              </h1>
              <p className="text-gray-500 font-medium">@{displayUser.username}</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {isOwnProfile && !isVerified && (
                <button 
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Profile'}
                </button>
              )}
              {!isOwnProfile ? (
                <>
                  <button 
                    onClick={handleFollowToggle}
                    className={cn(
                      "px-6 py-2 rounded-xl font-bold transition-all",
                      isFollowing 
                        ? "bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800" 
                        : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700"
                    )}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button 
                    onClick={() => navigate(`/messages?user=${displayUser.username}`)}
                    className="bg-gray-100 dark:bg-gray-900 px-6 py-2 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                  >
                    <MessageCircle size={18} />
                    Message
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => navigate('/profile/edit')}
                    className="bg-gray-100 dark:bg-gray-900 px-6 py-2 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  >
                    Edit Profile
                  </button>
                  <button className="bg-gray-100 dark:bg-gray-900 p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                    <Settings size={20} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center md:justify-start gap-8 mb-6">
            <Stat label="Coins" value={displayUser.coins} icon={<Coins size={14} className="text-yellow-500" />} />
            <Stat label="Followers" value={followersCount} onClick={() => setIsFollowersModalOpen(true)} />
            <Stat label="Following" value={followingCount} onClick={() => setIsFollowingModalOpen(true)} />
          </div>

          <p className="text-gray-600 dark:text-gray-400 mb-6">{displayUser.bio}</p>

          {isOwnProfile && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProfileLink to="/invite" icon={<Gift className="text-pink-500" />} label="Invite & Earn Coins" badge="+50 coins" />
              <ProfileLink to="/wallet" icon={<Wallet className="text-indigo-500" />} label="My Wallet" badge={`${MOCK_USER.coins} Coins`} />
              <ProfileLink to="/gifts" icon={<Gift className="text-orange-500" />} label="My Gifts" badge="4" />
              <ProfileLink to="/analytics" icon={<BarChart3 className="text-emerald-500" />} label="Posts & Views" />
            </div>
          )}
        </div>
      </div>

      {/* Profile Tabs */}
      <div className="border-t border-gray-200 dark:border-gray-800 px-4 lg:px-0">
        <div className="flex justify-center gap-12">
          <Tab 
            active={activeTab === 'Posts'} 
            onClick={() => setActiveTab('Posts')}
            icon={<Grid size={20} />} 
            label="Posts" 
          />
          <Tab 
            active={activeTab === 'Videos'} 
            onClick={() => setActiveTab('Videos')}
            icon={<Play size={20} />} 
            label="Videos" 
          />
          <Tab 
            active={activeTab === 'Saved'} 
            onClick={() => setActiveTab('Saved')}
            icon={<Bookmark size={20} />} 
            label="Saved" 
          />
        </div>

        <div className="grid grid-cols-3 gap-1 md:gap-4 mt-8">
          {activeTab === 'Posts' && userPosts.map((post) => (
            <div 
              key={post.id} 
              onClick={() => setSelectedPost(post)}
              className="aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden relative group cursor-pointer"
            >
              <ResponsiveImage 
                src={post.image} 
                alt="" 
                width={400}
                height={400}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="flex items-center gap-4 text-white font-bold">
                  <div className="flex items-center gap-1"><Heart size={18} fill="white" /> {post.likes >= 1000 ? `${(post.likes / 1000).toFixed(1)}K` : post.likes}</div>
                  <div className="flex items-center gap-1"><MessageCircle size={18} fill="white" /> {post.comments}</div>
                </div>
              </div>
            </div>
          ))}

          {activeTab === 'Videos' && userVideos.map((video) => (
            <div 
              key={video.id} 
              onClick={() => setSelectedVideo(video)}
              className="aspect-[9/16] bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden relative group cursor-pointer"
            >
              <ResponsiveImage 
                src={video.thumbnail} 
                alt="" 
                width={400}
                height={711}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <Play size={32} className="text-white opacity-80 group-hover:scale-125 transition-transform" />
              </div>
              <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-[10px] font-bold bg-black/40 px-2 py-1 rounded-full">
                <Play size={10} fill="white" /> {video.coins >= 1000 ? `${(video.coins / 1000).toFixed(1)}K` : video.coins}
              </div>
            </div>
          ))}

          {activeTab === 'Saved' && savedItems.map((item) => (
            <div 
              key={item.id} 
              onClick={() => setSelectedPost(item)}
              className="aspect-square bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden relative group cursor-pointer"
            >
              <ResponsiveImage 
                src={item.image} 
                alt="" 
                width={400}
                height={400}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="flex items-center gap-4 text-white font-bold">
                  <div className="flex items-center gap-1"><Heart size={18} fill="white" /> {item.likes >= 1000 ? `${(item.likes / 1000).toFixed(1)}K` : item.likes}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedPost && (
          <PostDetailModal 
            post={selectedPost} 
            onClose={() => setSelectedPost(null)} 
          />
        )}
        {selectedVideo && (
          <VideoPlayerModal 
            video={selectedVideo} 
            onClose={() => setSelectedVideo(null)} 
          />
        )}
        {(isFollowersModalOpen || isFollowingModalOpen) && (
          <UserListModal 
            title={isFollowersModalOpen ? "Followers" : "Following"}
            users={isFollowersModalOpen ? followersList : followingList}
            onToggleFollow={handleToggleFollowUser}
            loading={loadingList}
            onClose={() => {
              setIsFollowersModalOpen(false);
              setIsFollowingModalOpen(false);
            }}
          />
        )}
        {isStoryOpen && (
          <StoryViewerModal 
            user={displayUser} 
            onClose={() => setIsStoryOpen(false)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stat({ label, value, icon, onClick }: { label: string; value: number; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-col items-center md:items-start transition-transform active:scale-95",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className="flex items-center gap-1 font-bold text-xl">
        {icon}
        {value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value}
      </div>
      <span className="text-sm text-gray-500">{label}</span>
    </button>
  );
}

function UserListModal({ title, users, onToggleFollow, onClose, loading }: { title: string; users: any[]; onToggleFollow: (id: string) => void; onClose: () => void; loading?: boolean }) {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const filteredUsers = users.filter(user => 
    (user.username || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (user.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const handleUserClick = (id: string) => {
    onClose();
    navigate(`/profile/${id}`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 id="modal-title" className="text-xl font-bold">{title}</h3>
          <button 
            onClick={onClose} 
            aria-label="Close modal"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-sm text-gray-500">Loading users...</p>
            </div>
          ) : filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between">
                <div 
                  className="flex items-center gap-3 cursor-pointer group"
                  onClick={() => handleUserClick(user.id)}
                >
                  <img src={user.avatar} alt={user.username} className="w-12 h-12 rounded-full border border-gray-100 dark:border-gray-800 group-hover:border-indigo-500 transition-colors" />
                  <div>
                    <h4 className="font-bold text-sm group-hover:text-indigo-600 transition-colors">@{user.username}</h4>
                    <p className="text-xs text-gray-500">{user.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => onToggleFollow(user.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-xl text-xs font-bold transition-all",
                    user.isFollowing 
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700" 
                      : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700"
                  )}
                >
                  {user.isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No users found</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ProfileLink({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <NavLink 
      to={to} 
      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-100 dark:border-gray-800"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white dark:bg-black flex items-center justify-center shadow-sm">
          {icon}
        </div>
        <span className="font-bold text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full",
            badge.includes('+') ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" : "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400"
          )}>
            {badge}
          </span>
        )}
        <ChevronRight size={16} className="text-gray-400" />
      </div>
    </NavLink>
  );
}

function Tab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-4 border-t-2 transition-all",
        active ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      )}
    >
      {icon}
      <span className="font-bold text-sm uppercase tracking-wider hidden md:inline">{label}</span>
    </button>
  );
}

function PostDetailModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white dark:bg-black w-full max-w-5xl h-full md:h-[80vh] flex flex-col md:flex-row overflow-hidden md:rounded-3xl shadow-2xl"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md md:hidden"
        >
          <X size={24} />
        </button>

        {/* Image Section */}
        <div className="flex-1 bg-black flex items-center justify-center relative group">
          <img src={post.image} alt="" className="max-w-full max-h-full object-contain" />
          <button className="absolute top-4 right-4 p-2 bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 size={20} />
          </button>
        </div>

        {/* Info Section */}
        <div className="w-full md:w-96 flex flex-col bg-white dark:bg-black border-l border-gray-100 dark:border-gray-800">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={post.user.avatar} alt="" className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800" />
              <div>
                <h4 className="font-bold text-sm">@{post.user.username}</h4>
                <p className="text-[10px] text-gray-500">{post.timestamp}</p>
              </div>
            </div>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
              <MoreHorizontal size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="flex gap-3">
              <img src={post.user.avatar} alt="" className="w-8 h-8 rounded-full" />
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-bold mr-2">@{post.user.username}</span>
                  {post.caption}
                </p>
              </div>
            </div>

            {/* Mock Comments */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <img src="https://picsum.photos/seed/u1/100/100" alt="" className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-bold mr-2">@travel_fan</span>
                    This looks absolutely amazing! Where is this? 😍
                  </p>
                  <span className="text-[10px] text-gray-400 mt-1">1h ago • Reply</span>
                </div>
              </div>
              <div className="flex gap-3">
                <img src="https://picsum.photos/seed/u2/100/100" alt="" className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-bold mr-2">@nature_lover</span>
                    The lighting is perfect! Great shot.
                  </p>
                  <span className="text-[10px] text-gray-400 mt-1">45m ago • Reply</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button className="hover:scale-110 transition-transform"><Heart size={24} /></button>
                <button className="hover:scale-110 transition-transform"><MessageCircle size={24} /></button>
                <button 
                  onClick={() => setIsShareModalOpen(true)}
                  className="hover:scale-110 transition-transform"
                >
                  <Send size={24} />
                </button>
              </div>
              <button className="hover:scale-110 transition-transform"><Bookmark size={24} /></button>
            </div>
            <div>
              <p className="font-bold text-sm">{post.likes.toLocaleString()} likes</p>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                placeholder="Add a comment..." 
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
              />
              <button className="text-indigo-600 font-bold text-sm">Post</button>
            </div>
          </div>
        </div>
      </motion.div>

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
          image: post.image,
          user: {
            username: post.user.username || 'user',
            avatar: post.user.avatar || ''
          }
        }}
      />
    </div>
  );
}

function VideoPlayerModal({ video, onClose }: { video: Video; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/95 backdrop-blur-xl"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-md aspect-[9/16] bg-black md:rounded-3xl overflow-hidden shadow-2xl"
      >
        <video 
          src={video.url} 
          autoPlay 
          loop 
          controls
          className="w-full h-full object-cover"
        />
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/40 text-white rounded-full backdrop-blur-md"
        >
          <X size={24} />
        </button>
        <div className="absolute bottom-20 left-4 right-4 text-white pointer-events-none">
          <h4 className="font-bold mb-1">@{video.user.username}</h4>
          <p className="text-sm line-clamp-2 opacity-80">{video.caption}</p>
        </div>
      </motion.div>
    </div>
  );
}

function StoryViewerModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative w-full h-full max-w-md md:h-[90vh] md:rounded-3xl overflow-hidden bg-gray-900 shadow-2xl"
      >
        {/* Progress Bar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex gap-1">
          <div className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 5, ease: "linear" }}
              onAnimationComplete={onClose}
              className="h-full bg-white"
            />
          </div>
        </div>

        {/* Header */}
        <div className="absolute top-8 left-4 right-4 z-20 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-lg" />
            <div>
              <h4 className="font-bold text-sm drop-shadow-md">@{user.username}</h4>
              <p className="text-[10px] opacity-80 drop-shadow-md">2h ago</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="w-full h-full flex items-center justify-center">
          <img 
            src={`https://picsum.photos/seed/${user.username}_story/1080/1920`} 
            alt="Story" 
            className="w-full h-full object-cover"
          />
        </div>

        {/* Interaction */}
        <div className="absolute bottom-8 left-4 right-4 z-20 flex items-center gap-4">
          <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-3">
            <input 
              type="text" 
              placeholder="Send message..." 
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-white/60 text-sm"
            />
          </div>
          <button className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white hover:bg-white/20 transition-colors">
            <Heart size={24} />
          </button>
          <button className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white hover:bg-white/20 transition-colors">
            <Send size={24} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

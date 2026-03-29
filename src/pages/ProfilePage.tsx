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
import { MOCK_USER } from '../constants';
import { cn } from '../lib/utils';
import { Post, Video } from '../types';
import { apiUrl } from '../lib/apiOrigin';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from '../components/ShareModal';
import StoryEditor from '../components/StoryEditor';
import { ResponsiveImage } from '../components/ResponsiveImage';
import { isValidVideoUrl } from '../lib/videoUrl';
import { ProfileHeaderSkeleton } from '../components/LoadingSkeletons';

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
        const formattedProfile = {
          id: profileData.id,
          username: profileData.username || profileData.display_name || profileData.email?.split('@')[0] || `user_${String(profileData.id || '').slice(0, 6)}`,
          displayName: profileData.display_name || profileData.username || profileData.email?.split('@')[0] || 'User',
          avatar: profileData.avatar_url || `https://picsum.photos/seed/${profileData.id}/200/200`,
          bio: profileData.bio || 'Digital creator and enthusiast. Sharing my journey on AnleySpace! ✨',
          coins: profileData.coins || 0,
          followers: 0,
          following: 0,
          isVerified: profileData.is_verified || false,
        };
        setUserProfile(formattedProfile);
        setLoading(false);

        void (async () => {
          try {
            console.log(`DEBUG: Fetching local data for ${profileData.id}`);
            const res = await fetch(apiUrl(`/api/user/${profileData.id}`));
            if (!res.ok) {
              console.error(`DEBUG: Local API error: ${res.status} ${res.statusText}`);
              return;
            }
            const data = await res.json();
            console.log('DEBUG: Local data received:', data);
            if (data.error) return;
            setUserProfile((prev) =>
              prev && prev.id === profileData.id
                ? {
                    ...prev,
                    bio: data.bio ?? prev.bio,
                    followers: data.followers_count ?? prev.followers,
                    following: data.following_count ?? prev.following,
                  }
                : prev
            );
          } catch (e) {
            console.error('DEBUG: Failed to fetch local user data:', e);
          }
        })();

        void fetchPosts(profileData.id, formattedProfile.username);
        void fetchVideos(profileData.id, formattedProfile.username);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async (userId: string, ownerUsername?: string) => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const nameForPosts = (ownerUsername ?? userProfile?.username ?? '').trim();

      const formattedPosts: Post[] = data.map(p => ({
        id: p.id,
        image: p.image_url,
        user: { 
          username: nameForPosts || userProfile?.username || '', 
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

  const fetchVideos = async (userId: string, ownerUsername: string) => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log('PROFILE VIDEOS:', data);

      const formatted: Video[] = (data || [])
        .filter((p: { user_id?: string; video_url?: string | null }) => {
          if (String(p.user_id || '') !== String(userId)) return false;
          return isValidVideoUrl(String(p.video_url || '').trim());
        })
        .map((p: any) => {
          const url = String(p.video_url).trim();
          const poster = String(p.image_url || '').trim();
          return {
            id: String(p.id),
            url,
            thumbnail: isValidVideoUrl(poster) ? poster : url,
            user: { username: ownerUsername },
            caption: String(p.content || ''),
            likes: Number(p.likes_count) || 0,
            comments: Number(p.comments_count) || 0,
            shares: Number(p.shares_count) || 0,
            saves: 0,
            coins: Number(p.likes_count) || 0,
            sound: null,
          } satisfies Video;
        });

      setUserVideos(formatted);
    } catch (err) {
      console.error('Error fetching profile videos:', err);
      setUserVideos([]);
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
    username: myProfile?.username || user?.email?.split('@')[0] || `user_${String(profileIdParam || user?.id || 'user').slice(0, 6)}`,
    displayName: myProfile?.display_name || myProfile?.full_name || myProfile?.username || user?.email?.split('@')[0] || 'User',
    avatar: `https://picsum.photos/seed/${profileIdParam || 'unknown-user'}/200/200`,
    bio: '',
    coins: 0,
    isVerified: false,
  };

  const [userVideos, setUserVideos] = useState<Video[]>([]);

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
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<'Posts' | 'Videos' | 'Saved'>('Posts');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const refreshFollowCounts = useCallback(async (profileId: string) => {
    if (!profileId) return;
    try {
      const [{ data: followersRows, error: followersErr }, { data: followingRows, error: followingErr }] = await Promise.all([
        supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', profileId),
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', profileId),
      ]);

      if (followersErr) throw followersErr;
      if (followingErr) throw followingErr;

      const nextFollowers = new Set((followersRows || []).map((r: any) => String(r?.follower_id || '').trim()).filter(Boolean)).size;
      const nextFollowing = new Set((followingRows || []).map((r: any) => String(r?.following_id || '').trim()).filter(Boolean)).size;
      console.log('[ProfilePage] DB follow counts', {
        profileId,
        followersDb: nextFollowers,
        followingDb: nextFollowing,
      });
      setFollowersCount(nextFollowers);
      setFollowingCount(nextFollowing);
    } catch (err) {
      console.error('[ProfilePage] refreshFollowCounts failed:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'Saved' && isOwnProfile && user?.id) {
      fetchSavedPosts();
    }
  }, [activeTab, isOwnProfile, user?.id, fetchSavedPosts]);

  useEffect(() => {
    if (userProfile) {
      void refreshFollowCounts(userProfile.id);
      setIsVerified(userProfile.isVerified);
      if (user && userProfile.id !== user.id) {
        checkIfFollowing();
      }
    }
  }, [userProfile, user, refreshFollowCounts]);

  const checkIfFollowing = async () => {
    if (!user || !userProfile) return;
    try {
      const res = await fetch(apiUrl(`/api/users/${user.id}/following/${userProfile.id}`));
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
    try {
      const endpoint = wasFollowing ? apiUrl('/api/users/unfollow') : apiUrl('/api/users/follow');
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
        const { error: followInsertErr } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userProfile.id });
        if (followInsertErr && followInsertErr.code !== '23505') throw followInsertErr;
      }
      await refreshFollowCounts(userProfile.id);
    } catch (err) {
      console.error('Error toggling follow:', err);
      setIsFollowing(wasFollowing);
      await refreshFollowCounts(userProfile.id);
    }
  };

  const handleVerify = async () => {
    if (!user) return;
    setIsVerifying(true);
    try {
      const res = await fetch(apiUrl(`/api/user/${user.id}/verify`), { method: 'POST' });
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
  const mapModalProfile = (p: any, myFollowingIds: string[]) => ({
    id: p.id,
    username: p.username || p.id,
    name: p.full_name || p.display_name || p.username,
    avatar: p.avatar_url || `https://picsum.photos/seed/${p.id}/100/100`,
    isFollowing: myFollowingIds.includes(p.id),
  });

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
      const { data: rows, error } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userProfile.id);
      console.log("FOLLOWERS QUERY", userProfile.id, rows);
      
      if (error) throw error;
      const followerIds = Array.from(
        new Set((rows || []).map((f: any) => f.follower_id).filter(Boolean))
      );

      if (followerIds.length === 0) {
        setFollowersList([]);
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, username, full_name, display_name, avatar_url')
        .in('id', followerIds);
      if (profilesErr) throw profilesErr;
      
      let followingIds: string[] = [];
      if (user) {
        const { data: myFollowing } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        followingIds = myFollowing?.map(f => f.following_id) || [];
      }

      let resolvedProfiles = profiles || [];
      // Keep profile counts/list source consistent: if Supabase rows are empty, fallback to local API list.
      if (resolvedProfiles.length === 0) {
        const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(userProfile.id)}/followers-list`));
        if (res.ok) {
          const list = await res.json();
          resolvedProfiles = Array.isArray(list) ? list : [];
        }
      }

      setFollowersList(resolvedProfiles
        .map((p: any) => mapModalProfile(p, followingIds))
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
    } catch (err) {
      console.error('Error fetching followers:', err);
      try {
        const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(userProfile.id)}/followers-list`));
        if (res.ok) {
          const list = await res.json();
          let followingIds: string[] = [];
          if (user) {
            const { data: myFollowing } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', user.id);
            followingIds = myFollowing?.map(f => f.following_id) || [];
          }
          const fallbackProfiles = Array.isArray(list) ? list : [];
          setFollowersList(fallbackProfiles
            .map((p: any) => mapModalProfile(p, followingIds))
            .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
          return;
        }
      } catch (fallbackErr) {
        console.error('Error fetching followers fallback:', fallbackErr);
      }
      setFollowersList([]);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchFollowing = async () => {
    if (!userProfile) return;
    setLoadingList(true);
    try {
      const { data: rows, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userProfile.id);
      
      if (error) throw error;
      const followedIds = Array.from(
        new Set((rows || []).map((f: any) => f.following_id).filter(Boolean))
      );

      if (followedIds.length === 0) {
        setFollowingList([]);
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, username, full_name, display_name, avatar_url')
        .in('id', followedIds);
      if (profilesErr) throw profilesErr;
      
      let myFollowingIds: string[] = [];
      if (user) {
        const { data: myFollowing } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        myFollowingIds = myFollowing?.map(f => f.following_id) || [];
      }

      let resolvedProfiles = profiles || [];
      // Keep profile counts/list source consistent: if Supabase rows are empty, fallback to local API list.
      if (resolvedProfiles.length === 0) {
        const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(userProfile.id)}/following-list`));
        if (res.ok) {
          const list = await res.json();
          resolvedProfiles = Array.isArray(list) ? list : [];
        }
      }

      setFollowingList(resolvedProfiles
        .map((p: any) => mapModalProfile(p, myFollowingIds))
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
    } catch (err) {
      console.error('Error fetching following:', err);
      try {
        const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(userProfile.id)}/following-list`));
        if (res.ok) {
          const list = await res.json();
          let myFollowingIds: string[] = [];
          if (user) {
            const { data: myFollowing } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', user.id);
            myFollowingIds = myFollowing?.map(f => f.following_id) || [];
          }
          const fallbackProfiles = Array.isArray(list) ? list : [];
          setFollowingList(fallbackProfiles
            .map((p: any) => mapModalProfile(p, myFollowingIds))
            .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i));
          return;
        }
      } catch (fallbackErr) {
        console.error('Error fetching following fallback:', fallbackErr);
      }
      setFollowingList([]);
    } finally {
      setLoadingList(false);
    }
  };

  const handleToggleFollowUser = async (targetUserId: string, mode?: 'followers' | 'following') => {
    if (!user) return;
    
    const targetInFollowers = followersList.find(u => u.id === targetUserId);
    const targetInFollowing = followingList.find(u => u.id === targetUserId);
    const target = mode === 'following'
      ? targetInFollowing
      : (targetInFollowers || targetInFollowing);
    
    if (!target) return;

    const shouldUnfollow = mode === 'following' ? true : Boolean(target.isFollowing);
    const prevFollowersList = followersList;
    const prevFollowingList = followingList;

    // Optimistic update
    if (mode === 'following') {
      setFollowingList(prev => prev.filter(u => u.id !== targetUserId));
      setFollowersList(prev => prev.map(u => u.id === targetUserId ? { ...u, isFollowing: false } : u));
    } else {
      const updateList = (list: any[]) =>
        list.map(u => u.id === targetUserId ? { ...u, isFollowing: !shouldUnfollow } : u);
      setFollowersList(updateList);
      setFollowingList(updateList);
    }

    try {
      if (shouldUnfollow) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId);
      } else {
        const { error: followInsertErr } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetUserId });
        if (followInsertErr && followInsertErr.code !== '23505') throw followInsertErr;
      }

      if (userProfile?.id) {
        await refreshFollowCounts(userProfile.id);
      }
    } catch (err) {
      console.error('Error toggling follow in list:', err);
      setFollowersList(prevFollowersList);
      setFollowingList(prevFollowingList);
      if (userProfile?.id) {
        await refreshFollowCounts(userProfile.id);
      }
    }
  };

  const handleOpenMessage = async () => {
    if (!user || isOwnProfile || !displayUser?.id) return;
    const currentUserId = user.id;
    const targetUserId = String(displayUser.id).trim();
    if (!targetUserId) return;

    try {
      // Check whether a thread already exists between both users.
      const { data: existingMessages, error } = await supabase
        .from('messages')
        .select('id')
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`
        )
        .limit(1);
      if (error) throw error;

      // No existing thread yet: ensure target user is present in local cache so Messages page can open immediately.
      if (!existingMessages || existingMessages.length === 0) {
        try {
          await fetch(apiUrl('/api/users/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: targetUserId,
              username: displayUser.username || targetUserId,
              full_name: displayUser.displayName || displayUser.username || null,
              avatar: displayUser.avatar || null,
            }),
          });
        } catch (syncErr) {
          console.warn('Message sync fallback failed:', syncErr);
        }
      }

      navigate(`/messages?userId=${encodeURIComponent(targetUserId)}`);
    } catch (err) {
      console.error('Error opening message thread:', err);
      // Safe fallback: still open Messages page to avoid dead-end click.
      navigate(`/messages?userId=${encodeURIComponent(targetUserId)}`);
    }
  };

  if (loading && !userProfile && (!isOwnProfile || !myProfile)) {
    return (
      <div className="lg:max-w-4xl lg:mx-auto p-4 lg:p-8 pb-12">
        <ProfileHeaderSkeleton />
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
            onClick={() => {
              const uid = userProfile?.id || profileIdParam || user?.id;
              if (!uid) return;
              const userId = String(uid).trim();
              navigate(`/story/${encodeURIComponent(userId)}`, { state: { userId } });
            }}
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
                    onClick={handleOpenMessage}
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

          {activeTab === 'Videos' && (userVideos.length > 0 ? (
            userVideos.map((video) => (
            <div 
              key={video.id} 
              onClick={() => setSelectedVideo(video)}
              className="aspect-[9/16] bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden relative group cursor-pointer"
            >
              {video.thumbnail !== video.url && isValidVideoUrl(video.thumbnail) ? (
                <ResponsiveImage 
                  src={video.thumbnail} 
                  alt="" 
                  width={400}
                  height={711}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                />
              ) : isValidVideoUrl(video.url) ? (
                <video
                  src={video.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 pointer-events-none"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-800" aria-hidden />
              )}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <Play size={32} className="text-white opacity-80 group-hover:scale-125 transition-transform" />
              </div>
              <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-[10px] font-bold bg-black/40 px-2 py-1 rounded-full">
                <Play size={10} fill="white" /> {video.likes >= 1000 ? `${(video.likes / 1000).toFixed(1)}K` : video.likes}
              </div>
            </div>
            ))
          ) : (
            <div className="col-span-3 flex flex-col items-center justify-center py-16 text-center text-gray-500">
              <Play size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-bold text-gray-600 dark:text-gray-400">No videos yet</p>
              <p className="text-xs mt-1 max-w-xs">Uploaded reels appear here when they have a valid video URL.</p>
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
            mode={isFollowersModalOpen ? "followers" : "following"}
            users={isFollowersModalOpen ? followersList : followingList}
            onToggleFollow={handleToggleFollowUser}
            loading={loadingList}
            onClose={() => {
              setIsFollowersModalOpen(false);
              setIsFollowingModalOpen(false);
            }}
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

function UserListModal({ title, mode, users, onToggleFollow, onClose, loading }: { title: string; mode: 'followers' | 'following'; users: any[]; onToggleFollow: (id: string, mode: 'followers' | 'following') => void; onClose: () => void; loading?: boolean }) {
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
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 caret-gray-900 dark:caret-gray-100 opacity-100"
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
                  onClick={() => onToggleFollow(user.id, mode)}
                  className={cn(
                    "px-4 py-1.5 rounded-xl text-xs font-bold transition-all",
                    mode === 'following'
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      : user.isFollowing 
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700" 
                      : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700"
                  )}
                >
                  {mode === 'following' ? 'Unfollow' : (user.isFollowing ? 'Following' : 'Follow Back')}
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
  console.log("VIDEO URL:", video.url);
  const ok = isValidVideoUrl(video.url);
  const fallbackThumb = String(video.thumbnail || '').trim();

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
        {ok ? (
          <video 
            src={video.url} 
            autoPlay 
            loop 
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : isValidVideoUrl(fallbackThumb) ? (
          <img src={fallbackThumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/70 text-sm px-6 text-center">
            Video unavailable
          </div>
        )}
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


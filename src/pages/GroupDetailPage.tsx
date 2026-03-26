import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft, 
  Users, 
  Globe, 
  Lock, 
  MoreHorizontal, 
  MessageSquare, 
  Info, 
  Plus, 
  Grid, 
  PlaySquare,
  Share2,
  Heart,
  MessageCircle,
  Bookmark,
  Camera,
  Image as ImageIcon,
  Video,
  Music,
  X,
  Send
} from 'lucide-react';
import { cn } from '../lib/utils';
import { MOCK_USER } from '../constants';
import { apiUrl } from '../lib/apiOrigin';
import { getBearerAuthHeaders } from '../lib/supabaseAuthHeaders';
import { supabase } from '../lib/supabase';

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'about'>('feed');
  const [isJoined, setIsJoined] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedMusicFile, setSelectedMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const groupImageInputRef = useRef<HTMLInputElement>(null);
  const [pendingGroupImageType, setPendingGroupImageType] = useState<'image' | 'cover_image'>('image');
  const [inviteUsername, setInviteUsername] = useState('');

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [imagePreviewUrl, videoPreviewUrl]);

  const fetchGroup = async () => {
    try {
      const [apiRes, supabaseRes] = await Promise.all([
        fetch(apiUrl(`/api/groups/${id}`)),
        id
          ? supabase
              .from('groups')
              .select(`
                *,
                group_members ( user_id )
              `)
              .eq('id', id)
              .single()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const data = await apiRes.json();
      const membersFromDb = Array.isArray(supabaseRes?.data?.group_members)
        ? supabaseRes.data.group_members
        : [];
      console.log("GROUP WITH MEMBERS:", supabaseRes?.data);
      const membersCount = membersFromDb.length;
      const joinedFromDb = !!user?.id && membersFromDb.some((m: any) => String(m?.user_id || '') === String(user.id));

      setGroupInfo({
        ...data,
        members_count: membersCount,
      });
      if (user) {
        setIsJoined(joinedFromDb);
      }
    } catch (err) {
      console.error("Error fetching group:", err);
    }
  };

  const fetchPosts = async () => {
    try {
      const groupCategory = `group:${id}`;
      const { data: postRows, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('category', groupCategory)
        .order('created_at', { ascending: false });

      if (postError) {
        console.error("Error fetching group posts from Supabase posts:", postError);
        const res = await fetch(apiUrl(`/api/groups/${id}/posts`));
        const data = await res.json();
        setPosts(data);
        return;
      }

      const userIds = Array.from(
        new Set((postRows || []).map((p: any) => p?.user_id).filter(Boolean))
      );
      let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
      }

      const mapped = (postRows || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        username: profileMap[p.user_id]?.username || p.username || 'user',
        avatar: profileMap[p.user_id]?.avatar_url || p.avatar || MOCK_USER.avatar,
        content: p.content || '',
        image_url: p.image_url || null,
        video_url: p.video_url || null,
        created_at: p.created_at,
        likes: Number(p.likes || 0),
        comments: Number(p.comments || 0),
        shares: Number(p.shares || 0),
      }));

      setPosts(mapped);
    } catch (err) {
      console.error("Error fetching posts:", err);
    }
  };

  useEffect(() => {
    fetchGroup();
    fetchPosts();
  }, [id, user]);

  const handleJoinToggle = async () => {
    if (!user || !id) return;
    try {
      const authHeaders = await getBearerAuthHeaders();
      if (!authHeaders) {
        console.error('[GroupDetailPage] join/leave: no session / access_token');
        return;
      }
      const endpoint = isJoined ? apiUrl(`/api/groups/${id}/leave`) : apiUrl(`/api/groups/${id}/join`);
      if (!isJoined) {
        console.log("JOIN GROUP ID:", id);
        console.log("JOIN REQUEST SENT");
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({})
      });
      if (res.ok) {
        setIsJoined(!isJoined);
        setGroupInfo((prev: any) => {
          if (!prev) return prev;
          const currentMembers = Array.isArray(prev.members) ? prev.members : [];
          const userAlreadyListed = currentMembers.some((m: any) => m?.id === user.id);
          const nextMembers = isJoined
            ? currentMembers.filter((m: any) => m?.id !== user.id)
            : userAlreadyListed
              ? currentMembers
              : [{ id: user.id, username: user.username, avatar: user.avatar, role: 'member' }, ...currentMembers];
          return { ...prev, members: nextMembers };
        });
        await fetchGroup();
      }
    } catch (err) {
      console.error("Error toggling group join:", err);
    }
  };

  const handleCreatePost = async () => {
    console.log('[GroupDetailPage] Post to Group clicked');
    const hasPostPayload =
      !!newPostContent.trim() ||
      !!newPostImage.trim() ||
      !!selectedImageFile ||
      !!selectedVideoFile ||
      !!selectedMusicFile ||
      !!musicUrl.trim();
    if (!user || !hasPostPayload) return;
    try {
      let imageUrlPayload = newPostImage.trim();
      let videoUrlPayload = '';
      if (!imageUrlPayload && selectedImageFile) {
        const ext = (selectedImageFile.name.split('.').pop() || 'jpg').toLowerCase();
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const filePath = `group-posts/${user.id}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, selectedImageFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
        imageUrlPayload = publicUrl || '';
      }
      if (selectedVideoFile) {
        const ext = (selectedVideoFile.name.split('.').pop() || 'mp4').toLowerCase();
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const filePath = `group-posts/${user.id}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, selectedVideoFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
        videoUrlPayload = publicUrl || '';
      }

      const payload = {
        user_id: user.id,
        content: newPostContent.trim(),
        image_url: imageUrlPayload || null,
        video_url: videoUrlPayload || null,
        category: `group:${id}`,
      };

      console.log('[GroupDetailPage] create post request', {
        endpoint: 'supabase.from("posts").insert(...)',
        payload,
      });

      const { data: insertedPost, error } = await supabase
        .from('posts')
        .insert(payload)
        .select('id, user_id, content, image_url, video_url, category')
        .single();

      if (error) {
        console.error('Create group post error:', error);
        return;
      }

      console.log('[GroupDetailPage] create post response', {
        ok: true,
        status: 200,
        body: insertedPost,
      });

      setNewPostContent('');
      setNewPostImage('');
      setSelectedImageFile(null);
      setSelectedVideoFile(null);
      setSelectedMusicFile(null);
      setMusicUrl('');
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
      }
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl(null);
      }
      setIsCreatePostOpen(false);
      fetchPosts();
    } catch (err) {
      console.error("Error creating post:", err);
    }
  };

  const handleSelectImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setSelectedImageFile(file);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleSelectVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setSelectedVideoFile(file);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
  };

  const handleSelectMusicFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setSelectedMusicFile(file);
  };

  const canSubmitPost =
    !!newPostContent.trim() ||
    !!newPostImage.trim() ||
    !!selectedImageFile ||
    !!selectedVideoFile ||
    !!selectedMusicFile ||
    !!musicUrl.trim();

  const handleUpdateImage = async (type: 'image' | 'cover_image', url: string) => {
    try {
      const urlField = type === 'image' ? 'image_url' : 'cover_image_url';
      const res = await fetch(apiUrl(`/api/groups/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: url, [urlField]: url })
      });
      if (res.ok) {
        setGroupInfo((prev: any) => {
          if (!prev) return prev;
          if (type === 'image') {
            return { ...prev, image: url, image_url: url };
          }
          return { ...prev, cover_image: url, cover_image_url: url };
        });
        fetchGroup();
      }
    } catch (err) {
      console.error(`Error updating group ${type}:`, err);
    }
  };

  const triggerGroupImagePicker = (type: 'image' | 'cover_image') => {
    setPendingGroupImageType(type);
    groupImageInputRef.current?.click();
  };

  const handleSelectGroupImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (!file || !user || !id) return;
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const filePath = `groups/${id}/${pendingGroupImageType}/${user.id}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
      if (publicUrl) {
        console.log('[GroupDetailPage] group image publicUrl:', publicUrl);
        await handleUpdateImage(pendingGroupImageType, publicUrl);
      } else {
        console.error('[GroupDetailPage] Missing publicUrl after upload', { filePath, pendingGroupImageType });
      }
    } catch (err) {
      console.error(`Error uploading group ${pendingGroupImageType}:`, err);
    }
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/groups/${id}/invite`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inviteUsername })
      });
      if (res.ok) {
        setInviteUsername('');
        setIsInviteOpen(false);
        fetchGroup();
        alert('Invite sent successfully!');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send invite');
      }
    } catch (err) {
      console.error("Error inviting user:", err);
    }
  };

  if (!groupInfo) return null;

  const resolveGroupMediaUrl = (value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    if (/^(https?:\/\/|blob:|data:)/i.test(raw) || raw.startsWith('/')) return raw;
    const normalized = raw.replace(/^\/+/, '');
    let bucket = 'posts';
    let objectPath = normalized;
    const slashIdx = normalized.indexOf('/');
    if (slashIdx > 0) {
      const firstSegment = normalized.slice(0, slashIdx);
      if (firstSegment === 'posts' || firstSegment === 'group-images') {
        bucket = firstSegment;
        objectPath = normalized.slice(slashIdx + 1);
      }
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    console.log('[GroupDetailPage] resolved group media url:', { raw, bucket, objectPath, publicUrl: data?.publicUrl });
    return data?.publicUrl || '';
  };

  const groupImageSrc = resolveGroupMediaUrl(groupInfo.image_url || groupInfo.image);
  const groupCoverSrc = resolveGroupMediaUrl(
    groupInfo.cover_image_url || groupInfo.cover_image || groupInfo.image_url || groupInfo.image
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 dark:bg-black pb-12"
    >
      {/* Cover & Header */}
      <div className="relative h-48 md:h-64 bg-indigo-600 group">
        <img src={groupCoverSrc || groupImageSrc} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        {isJoined && (
          <button 
            onClick={() => triggerGroupImagePicker('cover_image')}
            className="absolute bottom-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-xl backdrop-blur-md transition-colors opacity-0 group-hover:opacity-100"
          >
            <Camera size={20} />
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-12 relative z-10">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
              <div className="relative group">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden border-4 border-white dark:border-gray-900 shadow-lg bg-gray-200">
                  <img src={groupImageSrc} alt="" className="w-full h-full object-cover" />
                </div>
                {isJoined && (
                  <button 
                    onClick={() => triggerGroupImagePicker('image')}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"
                  >
                    <Camera size={24} />
                  </button>
                )}
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-2xl md:text-3xl font-black mb-2">{groupInfo.name}</h1>
                <div className="flex items-center justify-center md:justify-start gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1 font-bold">
                    {groupInfo.type === 'Public' ? <Globe size={16} /> : <Lock size={16} />}
                    {groupInfo.type} Group
                  </span>
                  <span>•</span>
                  <span className="font-bold">{groupInfo.members_count ?? (groupInfo.members?.length || 0)} Members</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleJoinToggle}
                className={cn(
                  "flex-1 md:flex-none px-8 py-3 rounded-2xl font-bold transition-all shadow-lg",
                  isJoined 
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20"
                )}
              >
                {isJoined ? 'Leave Group' : 'Join Group'}
              </button>
              <button 
                onClick={() => navigate(`/groups/${id}/chat`)}
                className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                <MessageSquare size={24} />
              </button>
              <button className="p-3 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <MoreHorizontal size={24} />
              </button>
            </div>
          </div>

          <div className="flex gap-8 mt-8 border-t border-gray-100 dark:border-gray-800">
            <TabButton 
              active={activeTab === 'feed'} 
              onClick={() => setActiveTab('feed')} 
              icon={<Grid size={18} />} 
              label="Feed" 
            />
            <TabButton 
              active={activeTab === 'members'} 
              onClick={() => setActiveTab('members')} 
              icon={<Users size={18} />} 
              label="Members" 
            />
            <TabButton 
              active={activeTab === 'about'} 
              onClick={() => setActiveTab('about')} 
              icon={<Info size={18} />} 
              label="About" 
            />
          </div>
          <input
            ref={groupImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSelectGroupImageFile}
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="flex-1 space-y-6">
            {activeTab === 'feed' && (
              <>
                {isJoined && (
                  <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4">
                    <img src={user?.avatar || MOCK_USER.avatar} alt="" className="w-10 h-10 rounded-full" />
                    <button 
                      onClick={() => setIsCreatePostOpen(true)}
                      className="flex-1 text-left bg-gray-50 dark:bg-gray-800 py-3 px-6 rounded-2xl text-gray-500 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Post something in {groupInfo.name}...
                    </button>
                  </div>
                )}
                
                {posts.length > 0 ? (
                  posts.map((post) => (
                    <GroupPost 
                      key={post.id} 
                      post={post} 
                      groupName={groupInfo.name as string} 
                      groupId={id as string}
                      onUpdate={fetchPosts}
                    />
                  ))
                ) : (
                  <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
                    <p className="text-gray-500">No posts yet. Be the first to post!</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'members' && (
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-lg mb-6">Group Members</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupInfo.members?.map((member: any) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => navigate(`/profile/${member.id}`)}
                          className="w-10 h-10 rounded-full bg-indigo-600 overflow-hidden flex items-center justify-center text-white font-bold"
                        >
                          {member.avatar ? (
                            <img src={member.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            member.username[0].toUpperCase()
                          )}
                        </button>
                        <div>
                          <button 
                            onClick={() => navigate(`/profile/${member.id}`)}
                            className="text-sm font-bold hover:text-indigo-600 transition-colors"
                          >
                            @{member.username}
                          </button>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">{member.role}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => navigate(`/profile/${member.id}`)}
                        className="text-indigo-600 text-xs font-bold hover:underline"
                      >
                        Profile
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-8">
                <div>
                  <h3 className="font-bold text-lg mb-4">About this group</h3>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    {groupInfo.description || "Welcome to our community! This group is dedicated to sharing experiences, learning from each other, and building meaningful connections around our shared interests."}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                      <Globe size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm mb-1">{groupInfo.type} Group</h4>
                      <p className="text-xs text-gray-500">Anyone can see who's in the group and what they post.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                      <Users size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm mb-1">{groupInfo.members_count ?? (groupInfo.members?.length || 0)} Members</h4>
                      <p className="text-xs text-gray-500">Active community members sharing content daily.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-sm mb-4">Group Rules</h3>
              <div className="space-y-4">
                <Rule index={1} text="Be kind and courteous" />
                <Rule index={2} text="No hate speech or bullying" />
                <Rule index={3} text="No promotions or spam" />
                <Rule index={4} text="Respect everyone's privacy" />
              </div>
            </div>

            <div className="bg-indigo-600 rounded-3xl p-6 shadow-xl shadow-indigo-500/20 text-white relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-black text-xl mb-2">Invite Friends</h3>
                <p className="text-indigo-100 text-xs mb-6">Grow the community by inviting your friends to join.</p>
                <button 
                  onClick={() => setIsInviteOpen(true)}
                  className="w-full bg-white text-indigo-600 py-3 rounded-2xl font-bold text-sm hover:bg-indigo-50 transition-colors"
                >
                  Send Invites
                </button>
              </div>
              <Plus size={120} className="absolute -bottom-10 -right-10 text-white/10 rotate-12" />
            </div>
          </div>
        </div>
      </div>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isCreatePostOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreatePostOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto scroll-hide bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl overflow-x-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black">Create Post</h2>
                <button 
                  onClick={() => setIsCreatePostOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <textarea 
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder={`What's on your mind, ${user?.username}?`}
                  className="w-full h-40 bg-gray-50 dark:bg-gray-800 rounded-3xl p-6 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="px-4 py-2 rounded-2xl bg-white dark:bg-gray-100 border border-gray-300 dark:border-gray-300 shadow-sm text-sm font-bold text-gray-900 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <ImageIcon size={16} />
                      Upload Image
                    </button>
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="px-4 py-2 rounded-2xl bg-white dark:bg-gray-100 border border-gray-300 dark:border-gray-300 shadow-sm text-sm font-bold text-gray-900 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <Video size={16} />
                      Upload Video
                    </button>
                  </div>

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSelectImageFile}
                    className="hidden"
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleSelectVideoFile}
                    className="hidden"
                  />
                  <input
                    ref={musicInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleSelectMusicFile}
                    className="hidden"
                  />

                  {imagePreviewUrl && (
                    <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <img src={imagePreviewUrl} alt="Selected preview" className="w-full max-h-48 object-cover" />
                    </div>
                  )}

                  {videoPreviewUrl && (
                    <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <video src={videoPreviewUrl} controls className="w-full max-h-48 object-cover" />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
                      <Music size={16} />
                      <span>Music (optional)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => musicInputRef.current?.click()}
                        className="px-4 py-2 rounded-2xl bg-white dark:bg-gray-100 border border-gray-300 dark:border-gray-300 shadow-sm text-sm font-bold text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        Upload Audio
                      </button>
                      {selectedMusicFile && (
                        <span className="text-xs text-gray-500 truncate">{selectedMusicFile.name}</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={musicUrl}
                      onChange={(e) => setMusicUrl(e.target.value)}
                      placeholder="https://example.com/audio.mp3"
                      className="w-full bg-gray-50 dark:bg-gray-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
                    <ImageIcon size={18} />
                    <span>Post Image URL (optional)</span>
                  </div>
                  <input 
                    type="text"
                    value={newPostImage}
                    onChange={(e) => setNewPostImage(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button 
                  type="button"
                  onClick={handleCreatePost}
                  disabled={!canSubmitPost}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  Post to Group
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviteOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsInviteOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black">Invite Friends</h2>
                <button 
                  onClick={() => setIsInviteOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <p className="text-sm text-gray-500">Enter the username of the friend you want to invite to {groupInfo.name}.</p>
                
                <div className="space-y-4">
                  <input 
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Username (e.g. sarah_j)"
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button 
                  onClick={handleInvite}
                  disabled={!inviteUsername.trim()}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Invite
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GroupPost({ post, groupName, groupId, onUpdate }: { post: any; groupName: string; groupId: string; onUpdate: () => any; key?: any }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Number(post.likes || 0));
  const [commentsCount, setCommentsCount] = useState<number>(Number(post.comments || 0));
  const [sharesCount, setSharesCount] = useState<number>(Number(post.shares || 0));
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentsList, setCommentsList] = useState<
    Array<{ id: string; user_id: string; content: string; created_at?: string; username?: string; avatar?: string }>
  >([]);
  const [groupImageMode, setGroupImageMode] = useState<'portrait' | 'landscape' | null>(null);
  const toPublicMediaUrl = useCallback((value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    if (/^(https?:\/\/|blob:|data:)/i.test(raw) || raw.startsWith('/')) return raw;
    const normalizedPath = raw.replace(/^\/+/, '').replace(/^posts\//i, '');
    const { data } = supabase.storage.from('posts').getPublicUrl(normalizedPath);
    return data?.publicUrl || '';
  }, []);
  const resolvedImageUrl = toPublicMediaUrl(post.image_url);
  const resolvedVideoUrl = toPublicMediaUrl(post.video_url);

  useEffect(() => {
    setGroupImageMode(null);
  }, [post.image_url]);

  useEffect(() => {
    console.log('[GroupPost] post media payload:', {
      post_id: post?.id,
      image_url: post?.image_url,
      video_url: post?.video_url,
      resolvedImageUrl,
      resolvedVideoUrl,
    });
  }, [post?.id, post?.image_url, post?.video_url, resolvedImageUrl, resolvedVideoUrl]);

  useEffect(() => {
    setLikesCount(Number(post.likes || 0));
    setCommentsCount(Number(post.comments || 0));
    setSharesCount(Number(post.shares || 0));
  }, [post.likes, post.comments, post.shares, post.id]);

  const handleGroupPostImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) {
      setGroupImageMode(h > w ? 'portrait' : 'landscape');
    }
  }, []);
  
  const handleEdit = async () => {
    const newContent = prompt('Edit your post:', post.content);
    if (newContent && newContent !== post.content) {
      try {
        const res = await fetch(apiUrl(`/api/groups/${groupId}/posts/${post.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent })
        });
        if (res.ok) {
          onUpdate();
        }
      } catch (err) {
        console.error("Error updating post:", err);
      }
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this post?')) {
      try {
        const res = await fetch(apiUrl(`/api/groups/${groupId}/posts/${post.id}`), {
          method: 'DELETE'
        });
        if (res.ok) {
          onUpdate();
        }
      } catch (err) {
        console.error("Error deleting post:", err);
      }
    }
  };

  const handleLike = async () => {
    const nextLiked = !isLiked;
    const delta = nextLiked ? 1 : -1;
    setIsLiked(nextLiked);
    setLikesCount((prev) => Math.max(0, prev + delta));
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/posts/${post.id}/like`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error('like failed');
      const payload = await res.json();
      if (payload?.post) {
        setLikesCount(Number(payload.post.likes || 0));
      }
    } catch (err) {
      setIsLiked(!nextLiked);
      setLikesCount((prev) => Math.max(0, prev - delta));
      console.error('Error liking group post:', err);
    }
  };

  const handleComment = async () => {
    setIsCommentsOpen(true);
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('id, post_id, user_id, content, created_at')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((c: any) => c.user_id).filter(Boolean)));
      let profilesMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
      }

      const formatted = (data || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        content: c.content,
        created_at: c.created_at,
        username: profilesMap[c.user_id]?.username || 'user',
        avatar: profilesMap[c.user_id]?.avatar_url || `https://picsum.photos/seed/${c.user_id}/100/100`,
      }));
      setCommentsList(formatted);
      setCommentsCount(formatted.length);
    } catch (err) {
      console.error('Error loading group post comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || isSubmittingComment) return;
    setIsSubmittingComment(true);
    let posted = false;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch(apiUrl(`/api/groups/${groupId}/posts/${post.id}/comment`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getBearerAuthHeaders() },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok) throw new Error('comment failed');
      setCommentText('');
      posted = true;
    } catch (err) {
      console.error('Error commenting on group post:', err);
    } finally {
      setIsSubmittingComment(false);
    }
    if (posted) {
      void handleComment();
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/groups/${groupId}?post=${post.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        prompt('Copy post link:', shareUrl);
      }
      setSharesCount((prev) => prev + 1);
      const res = await fetch(apiUrl(`/api/groups/${groupId}/posts/${post.id}/share`), {
        method: 'POST',
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload?.post) {
          setSharesCount(Number(payload.post.shares || 0));
        }
      }
    } catch (err) {
      console.error('Error sharing group post:', err);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(`/profile/${post.user_id}`)}
            className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden"
          >
            <img src={post.avatar || MOCK_USER.avatar} alt="" className="w-full h-full object-cover" />
          </button>
          <div>
            <button 
              onClick={() => navigate(`/profile/${post.user_id}`)}
              className="font-bold text-sm hover:text-indigo-600 transition-colors"
            >
              @{post.username}
            </button>
            <p className="text-[10px] text-gray-500">Posted in {groupName} • {new Date(post.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        
        {user?.id === post.user_id && (
          <div className="relative group/menu">
            <button className="p-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors">
              <MoreHorizontal size={20} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 hidden group-hover/menu:block z-20">
              <button 
                onClick={handleEdit}
                className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Edit Post
              </button>
              <button 
                onClick={handleDelete}
                className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete Post
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="px-4 pb-4">
        <p className="text-sm leading-relaxed">
          {post.content}
        </p>
      </div>

      {(resolvedVideoUrl || resolvedImageUrl) && (
        <div className="px-0 relative">
          {resolvedVideoUrl ? (
            <div className="relative overflow-hidden bg-black border border-gray-100 rounded-xl w-full max-h-[500px] flex items-center justify-center">
              <div className="relative w-full flex items-center justify-center select-none">
                <video
                  src={resolvedVideoUrl}
                  controls
                  muted
                  loop
                  playsInline
                  className="w-full h-auto object-contain max-h-[500px]"
                />
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden bg-gray-100 border border-gray-100 rounded-xl w-full">
              <div
                className={cn(
                  'relative w-full select-none',
                  groupImageMode === 'landscape' && 'h-[min(380px,52vh)] sm:h-[400px]'
                )}
              >
                <img
                  src={resolvedImageUrl}
                  alt=""
                  className={cn(
                    groupImageMode === 'landscape'
                      ? 'h-full w-full object-cover object-center'
                      : 'block w-full h-auto max-h-[min(92vh,1200px)] object-contain'
                  )}
                  referrerPolicy="no-referrer"
                  onLoad={handleGroupPostImageLoad}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-6">
          <button 
            onClick={handleLike}
            className={cn("flex items-center gap-2 text-sm font-bold transition-colors", isLiked ? "text-red-500" : "text-gray-500 hover:text-red-500")}
          >
            <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
            <span>{likesCount}</span>
          </button>
          <button onClick={handleComment} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">
            <MessageCircle size={20} />
            <span>{commentsCount}</span>
          </button>
          <button onClick={handleShare} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-colors">
            <Share2 size={20} />
            <span>{sharesCount}</span>
          </button>
        </div>
        <button className="text-gray-500 hover:text-yellow-500 transition-colors">
          <Bookmark size={20} />
        </button>
      </div>

      <AnimatePresence>
        {isCommentsOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCommentsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black">Comments</h3>
                <button
                  type="button"
                  onClick={() => setIsCommentsOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                {commentsLoading ? (
                  <p className="text-sm text-gray-500">Loading comments...</p>
                ) : commentsList.length === 0 ? (
                  <p className="text-sm text-gray-500">No comments yet. Be the first to comment.</p>
                ) : (
                  commentsList.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <img src={comment.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-white">@{comment.username}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-200 break-words">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingComment ? 'Posting...' : 'Post'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rule({ index, text }: { index: number; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-indigo-600 font-black text-xs">{index}.</span>
      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{text}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-4 border-b-2 transition-all",
        active ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      )}
    >
      {icon}
      <span className="font-bold text-sm uppercase tracking-wider">{label}</span>
    </button>
  );
}

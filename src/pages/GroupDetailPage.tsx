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
  Link2,
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
import { supabase } from '../lib/supabase';

/** Detect Postgres/Supabase permission / RLS-style failures for clearer production alerts. */
function isLikelyRlsOrPolicyError(error: unknown): boolean {
  if (error == null) return false;
  const o = error as Record<string, unknown>;
  const code = o.code != null ? String(o.code) : '';
  const msg = o.message != null ? String(o.message) : String(error);
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST116') return true;
  return /row-level security|\bRLS\b|violates (row-level|policy)|policy|permission denied|insufficient_privilege|not authorized|JWT expired/i.test(
    msg
  );
}

function describeGroupMutationFailure(error: unknown, action: 'update' | 'delete'): string {
  const rlsNote =
    ' This is often blocked by row-level security (RLS) in production — check Supabase policies for the `groups` table or use a server route with service role.';
  if (isLikelyRlsOrPolicyError(error)) {
    return action === 'delete'
      ? 'Could not delete this group.' + rlsNote
      : 'Could not update this group.' + rlsNote;
  }
  const msg =
    typeof error === 'object' && error !== null && 'message' in error && String((error as { message?: string }).message).trim()
      ? String((error as { message?: string }).message)
      : '';
  if (msg) {
    return action === 'delete' ? `Could not delete group: ${msg}` : `Could not save: ${msg}`;
  }
  return action === 'delete'
    ? 'Could not delete group. You may not have permission.'
    : 'Failed to save description.';
}

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'about'>('feed');
  const [isJoined, setIsJoined] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
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
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [editDescriptionOpen, setEditDescriptionOpen] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const groupMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [imagePreviewUrl, videoPreviewUrl]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) {
        setGroupMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [groupMenuOpen]);

  const fetchGroup = async () => {
    if (!id) return;
    try {
      const supabaseRes = await supabase
        .from('groups')
        .select(
          `
                *,
                group_members ( user_id, role )
              `
        )
        .eq('id', id)
        .single();

      const row = supabaseRes?.data;
      const membersFromDb = Array.isArray(row?.group_members) ? row.group_members : [];
      console.log('GROUP WITH MEMBERS:', supabaseRes?.data);

      if (supabaseRes.error && !row) {
        console.error('Error loading group from Supabase:', supabaseRes.error);
        setGroupInfo(null);
        return;
      }

      let membersForUi: any[] = [];
      if (membersFromDb.length) {
        const memberIds = membersFromDb.map((m: any) => m.user_id).filter(Boolean);
        let profileMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
        if (memberIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', memberIds);
          profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
        }
        membersForUi = membersFromDb.map((m: any) => ({
          id: String(m.user_id),
          username: profileMap[m.user_id]?.username || `user_${String(m.user_id).slice(0, 8)}`,
          avatar: profileMap[m.user_id]?.avatar_url || MOCK_USER.avatar,
          role: m.role || 'member',
        }));
      }

      const membersCount = membersForUi.length || membersFromDb.length;

      const joinedFromDb =
        !!user?.id &&
        (membersForUi.length
          ? membersForUi.some((m: any) => String(m?.id || '') === String(user.id))
          : membersFromDb.some((m: any) => String(m?.user_id || '') === String(user.id)));

      const creatorId = row?.creator_id ?? null;

      setGroupInfo({
        id: row?.id ?? id,
        name: row?.name ?? 'Group',
        description: row?.description ?? '',
        image: row?.image,
        type: row?.type ?? 'Public',
        members: membersForUi.length ? membersForUi : membersFromDb,
        members_count: membersCount,
        creator_id: creatorId,
        _myRoleSupabase: user?.id
          ? membersFromDb.find((m: any) => String(m?.user_id) === String(user.id))?.role
          : undefined,
      });
      if (user) {
        setIsJoined(joinedFromDb);
      }
    } catch (err) {
      console.error('Error fetching group:', err);
    }
  };

  const fetchPosts = async () => {
    const currentGroupId = id;
    if (!currentGroupId) return;
    console.log('groupId:', currentGroupId);
    setPostsLoading(true);
    setPostsError(null);
    try {
      const { data: postsData, error: postsErrorQuery } = await supabase
        .from('posts')
        .select('*')
        .eq('group_id', currentGroupId)
        .order('created_at', { ascending: false });
      console.log('group posts:', postsData);

      if (postsErrorQuery) {
        console.log('error:', postsErrorQuery);
        console.error('Error loading group posts:', postsErrorQuery);
        setPosts([]);
        setPostsError(postsErrorQuery.message || 'Failed to load group posts');
        return;
      }

      const basePosts = postsData || [];
      if (basePosts.length === 0) {
        setPosts([]);
        return;
      }

      const userIds = Array.from(
        new Set(basePosts.map((p: any) => p?.user_id).filter(Boolean))
      );
      let profilesById: Record<string, { id: string; username?: string | null; avatar_url?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profilesRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        if (profilesError) {
          console.error('Error loading profiles for group posts:', profilesError);
        } else if (profilesRows) {
          profilesById = profilesRows.reduce((acc: any, row: any) => {
            acc[row.id] = row;
            return acc;
          }, {});
        }
      }

      const postIds = basePosts.map((p: any) => p.id).filter(Boolean);
      let likesByPost: Record<string, number> = {};
      let commentsByPost: Record<string, number> = {};
      const likedPostIds = new Set<string>();
      let likesMergeOk = false;
      let commentsMergeOk = false;

      if (postIds.length > 0) {
        const { data: likeRows, error: likesAggErr } = await supabase
          .from('likes')
          .select('post_id, user_id')
          .in('post_id', postIds);
        if (likesAggErr) {
          console.error('Error loading likes for group merge:', likesAggErr);
        } else {
          likesMergeOk = true;
          (likeRows || []).forEach((row: { post_id: string; user_id?: string }) => {
            likesByPost[row.post_id] = (likesByPost[row.post_id] || 0) + 1;
            if (user?.id && String(row.user_id || '') === String(user.id)) {
              likedPostIds.add(String(row.post_id));
            }
          });
        }

        const { data: commentRows, error: commentsAggErr } = await supabase
          .from('comments')
          .select('post_id')
          .in('post_id', postIds);
        if (commentsAggErr) {
          console.error('Error loading comments for group merge:', commentsAggErr);
        } else {
          commentsMergeOk = true;
          (commentRows || []).forEach((row: { post_id: string }) => {
            commentsByPost[row.post_id] = (commentsByPost[row.post_id] || 0) + 1;
          });
        }
      }

      const mappedPosts = basePosts.map((post: any) => {
        const prof = post.user_id ? profilesById[post.user_id] : null;
        const likes_count = likesMergeOk ? likesByPost[post.id] ?? 0 : post.likes_count ?? 0;
        const comments_count = commentsMergeOk ? commentsByPost[post.id] ?? 0 : post.comments_count ?? 0;
        return {
          ...post,
          likes_count,
          comments_count,
          is_liked: likedPostIds.has(String(post.id)),
          profiles: prof || null,
          username: prof?.username || post.username || null,
          avatar_url: prof?.avatar_url || post.avatar_url || post.avatar || null,
        };
      });

      setPosts(mappedPosts || []);
    } catch (err) {
      console.log('error:', err);
      console.error('Error in fetchGroupPosts:', err);
      setPosts([]);
      setPostsError(err instanceof Error ? err.message : 'Failed to load group posts');
    } finally {
      setPostsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroup();
    fetchPosts();
  }, [id, user]);

  const handleJoinToggle = async () => {
    if (!user || !id) return;
    try {
      if (isJoined) {
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('group_id', id)
          .eq('user_id', user.id);
        if (error) {
          console.error('[GroupDetailPage] leave group_members:', error);
          return;
        }
      } else {
        console.log('JOIN GROUP ID:', id);
        const { error } = await supabase.from('group_members').insert({
          group_id: id,
          user_id: user.id,
          role: 'member',
        });
        const code = (error as { code?: string } | undefined)?.code;
        if (error && code !== '23505') {
          console.error('[GroupDetailPage] join group_members:', error);
          return;
        }
      }
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
    } catch (err) {
      console.error('Error toggling group join:', err);
    }
  };

  const handleCreatePost = async () => {
    console.log('[GroupDetailPage] Post to Group clicked');
    const currentGroupId = id;
    const hasPostPayload =
      !!newPostContent.trim() ||
      !!newPostImage.trim() ||
      !!selectedImageFile ||
      !!selectedVideoFile ||
      !!selectedMusicFile ||
      !!musicUrl.trim();
    if (!user || !hasPostPayload || !currentGroupId) return;
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
        group_id: currentGroupId,
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
    if (!id) return;
    try {
      const patch = type === 'image' ? { image: url } : { cover_image: url };
      const { error } = await supabase.from('groups').update(patch).eq('id', id);
      if (error) throw error;
      setGroupInfo((prev: any) => {
        if (!prev) return prev;
        if (type === 'image') {
          return { ...prev, image: url, image_url: url };
        }
        return { ...prev, cover_image: url, cover_image_url: url };
      });
      fetchGroup();
    } catch (err) {
      console.error(`Error updating group ${type}:`, err);
      alert(describeGroupMutationFailure(err, 'update'));
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
    if (!inviteUsername.trim() || !id) return;
    const trimmed = inviteUsername.trim().replace(/^@/, '');
    try {
      const { data: profileRow, error: findErr } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmed)
        .maybeSingle();
      if (findErr) {
        console.error('[GroupDetailPage] invite profile lookup:', findErr);
        alert('Could not look up that user.');
        return;
      }
      if (!profileRow?.id) {
        alert('No user found with that username.');
        return;
      }
      const { error } = await supabase.from('group_members').insert({
        group_id: id,
        user_id: profileRow.id,
        role: 'member',
      });
      const code = (error as { code?: string } | undefined)?.code;
      if (error && code !== '23505') {
        console.error('[GroupDetailPage] invite group_members:', error);
        alert(error.message || 'Could not add member.');
        return;
      }
      setInviteUsername('');
      setIsInviteOpen(false);
      fetchGroup();
      alert(code === '23505' ? 'That user is already in the group.' : 'Member added successfully!');
    } catch (err) {
      console.error('Error inviting user:', err);
    }
  };

  const myMember = Array.isArray(groupInfo?.members)
    ? groupInfo.members.find((m: any) => String(m.id) === String(user?.id))
    : null;
  const isOwnerUser =
    !!user?.id &&
    !!groupInfo?.creator_id &&
    String(groupInfo.creator_id) === String(user.id);
  const isAdminRole =
    myMember?.role === 'admin' ||
    myMember?.role === 'creator' ||
    groupInfo?._myRoleSupabase === 'admin';
  const canManageGroup = isOwnerUser || isAdminRole;

  const openEditDescriptionFromMenu = () => {
    setDraftDescription(typeof groupInfo?.description === 'string' ? groupInfo.description : '');
    setEditDescriptionOpen(true);
    setGroupMenuOpen(false);
  };

  const handleSaveDescription = async () => {
    if (!id) return;
    setSavingDescription(true);
    try {
      const { error } = await supabase.from('groups').update({ description: draftDescription }).eq('id', id);
      if (error) throw error;
      setEditDescriptionOpen(false);
      await fetchGroup();
    } catch (err) {
      console.error(err);
      alert(describeGroupMutationFailure(err, 'update'));
    } finally {
      setSavingDescription(false);
    }
  };

  const copyGroupLink = () => {
    const url = `${window.location.origin}/groups/${id}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setGroupMenuOpen(false);
      alert('Link copied to clipboard');
    });
  };

  const handleLeaveFromMenu = async () => {
    setGroupMenuOpen(false);
    if (isJoined) await handleJoinToggle();
  };

  const handleDeleteGroup = async () => {
    if (!id) return;
    if (!confirm('Delete this group permanently? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if (error) throw error;
      navigate('/groups');
    } catch (err) {
      console.error(err);
      alert(describeGroupMutationFailure(err, 'delete'));
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
              <div className="relative" ref={groupMenuRef}>
                <button
                  type="button"
                  aria-expanded={groupMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setGroupMenuOpen((o) => !o)}
                  className="p-3 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <MoreHorizontal size={24} />
                </button>
                {groupMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
                  >
                    {canManageGroup && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={openEditDescriptionFromMenu}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                      >
                        Edit Group
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={copyGroupLink}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      <Link2 size={16} className="opacity-70" />
                      Copy Group Link
                    </button>
                    {isJoined && !isOwnerUser && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleLeaveFromMenu()}
                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                      >
                        Leave Group
                      </button>
                    )}
                    {isOwnerUser && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleDeleteGroup()}
                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Delete Group
                      </button>
                    )}
                  </div>
                )}
              </div>
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
                
                {postsLoading ? (
                  <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
                    <p className="text-gray-500">Loading posts...</p>
                  </div>
                ) : postsError ? (
                  <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
                    <p className="text-red-500">{postsError}</p>
                  </div>
                ) : posts.length > 0 ? (
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
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <h3 className="font-bold text-lg">About this group</h3>
                    {canManageGroup && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftDescription(typeof groupInfo.description === 'string' ? groupInfo.description : '');
                          setEditDescriptionOpen(true);
                        }}
                        className="shrink-0 text-sm font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Edit
                      </button>
                    )}
                  </div>
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

      {/* Edit group description (owner / admin) */}
      <AnimatePresence>
        {editDescriptionOpen && canManageGroup && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !savingDescription && setEditDescriptionOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-gray-900"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-black">Edit group description</h2>
                <button
                  type="button"
                  disabled={savingDescription}
                  onClick={() => setEditDescriptionOpen(false)}
                  className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X size={22} />
                </button>
              </div>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={6}
                className="mb-6 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800"
                placeholder="Describe your group..."
              />
              <button
                type="button"
                disabled={savingDescription}
                onClick={() => void handleSaveDescription()}
                className="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingDescription ? 'Saving…' : 'Save'}
              </button>
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
  const [isLiked, setIsLiked] = useState<boolean>(!!post.is_liked);
  const [likesCount, setLikesCount] = useState<number>(Number(post.likes_count ?? post.likes ?? 0));
  const [commentsCount, setCommentsCount] = useState<number>(Number(post.comments_count ?? post.comments ?? 0));
  const [sharesCount, setSharesCount] = useState<number>(Number(post.shares || 0));
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<
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
    setIsLiked(!!post.is_liked);
    setLikesCount(Number(post.likes_count ?? post.likes ?? 0));
    setCommentsCount(Number(post.comments_count ?? post.comments ?? 0));
    setSharesCount(Number(post.shares || 0));
  }, [post.is_liked, post.likes_count, post.likes, post.comments_count, post.comments, post.shares, post.id]);

  const handleGroupPostImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) {
      setGroupImageMode(h > w ? 'portrait' : 'landscape');
    }
  }, []);
  
  const handleEdit = async () => {
    const newContent = prompt('Edit your post:', post.content);
    if (!newContent || newContent === post.content || !user?.id) return;
    try {
      const { error } = await supabase
        .from('posts')
        .update({ content: newContent })
        .eq('id', post.id)
        .eq('user_id', user.id);
      if (error) throw error;
      onUpdate();
    } catch (err) {
      console.error('Error updating post:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?') || !user?.id) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', user.id);
      if (error) throw error;
      onUpdate();
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  const handleLike = async () => {
    if (!user?.id || !post?.id) return;
    const wasLiked = isLiked;
    const nextLiked = !wasLiked;
    setIsLiked(nextLiked);
    setLikesCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));
    try {
      if (nextLiked) {
        const { error } = await supabase.from('likes').insert({
          post_id: post.id,
          user_id: user.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);
        if (error) throw error;
      }
      onUpdate();
    } catch (err) {
      setIsLiked(wasLiked);
      setLikesCount((prev) => Math.max(0, prev + (wasLiked ? 1 : -1)));
      console.error('Error liking group post:', err);
    }
  };

  const handleComment = async (targetPostId?: string) => {
    const postId = targetPostId || post.id;
    if (!postId) return;
    console.log('postId:', postId);
    setIsCommentsOpen(true);
    setCommentsLoading(true);
    try {
      const { data: commentsData, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      console.log('comments:', commentsData);

      const userIds = Array.from(new Set((commentsData || []).map((c: any) => c.user_id).filter(Boolean)));
      let profilesMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
      }

      const formatted = (commentsData || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        content: c.content,
        created_at: c.created_at,
        username: profilesMap[c.user_id]?.username || 'user',
        avatar: profilesMap[c.user_id]?.avatar_url || `https://picsum.photos/seed/${c.user_id}/100/100`,
      }));
      setComments(formatted || []);
      setCommentsCount(formatted.length);
    } catch (err) {
      console.error('Error loading group post comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!user || !post?.id || !trimmed || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      const { error } = await supabase.from('comments').insert([
        {
          content: trimmed,
          post_id: post.id,
          user_id: user.id,
        },
      ]);
      if (error) throw error;
      setCommentText('');
      await handleComment(post.id);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmittingComment(false);
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
          <button onClick={() => handleComment(post.id)} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">
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
                ) : comments.length === 0 ? (
                  <p className="text-sm text-gray-500">No comments yet. Be the first to comment.</p>
                ) : (
                  comments.map((comment) => (
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

import React, { useState, useEffect } from 'react';
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
  X,
  Send
} from 'lucide-react';
import { cn } from '../lib/utils';
import { MOCK_USER } from '../constants';

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
  const [inviteUsername, setInviteUsername] = useState('');

  const fetchGroup = async () => {
    try {
      const res = await fetch(`/api/groups/${id}`);
      const data = await res.json();
      setGroupInfo(data);
      if (user && data.members) {
        setIsJoined(data.members.some((m: any) => m.id === user.id));
      }
    } catch (err) {
      console.error("Error fetching group:", err);
    }
  };

  const fetchPosts = async () => {
    try {
      const res = await fetch(`/api/groups/${id}/posts`);
      const data = await res.json();
      setPosts(data);
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
      const endpoint = isJoined ? `/api/groups/${id}/leave` : `/api/groups/${id}/join`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      if (res.ok) {
        fetchGroup();
      }
    } catch (err) {
      console.error("Error toggling group join:", err);
    }
  };

  const handleCreatePost = async () => {
    if (!user || !newPostContent.trim()) return;
    try {
      const res = await fetch(`/api/groups/${id}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          avatar: user.avatar || MOCK_USER.avatar,
          content: newPostContent,
          imageUrl: newPostImage
        })
      });
      if (res.ok) {
        setNewPostContent('');
        setNewPostImage('');
        setIsCreatePostOpen(false);
        fetchPosts();
      }
    } catch (err) {
      console.error("Error creating post:", err);
    }
  };

  const handleUpdateImage = async (type: 'image' | 'cover_image', url: string) => {
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: url })
      });
      if (res.ok) {
        fetchGroup();
      }
    } catch (err) {
      console.error(`Error updating group ${type}:`, err);
    }
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return;
    try {
      const res = await fetch(`/api/groups/${id}/invite`, {
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

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 dark:bg-black pb-12"
    >
      {/* Cover & Header */}
      <div className="relative h-48 md:h-64 bg-indigo-600 group">
        <img src={groupInfo.cover_image || groupInfo.image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        {isJoined && (
          <button 
            onClick={() => {
              const url = prompt('Enter cover image URL:');
              if (url) handleUpdateImage('cover_image', url);
            }}
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
                  <img src={groupInfo.image} alt="" className="w-full h-full object-cover" />
                </div>
                {isJoined && (
                  <button 
                    onClick={() => {
                      const url = prompt('Enter group image URL:');
                      if (url) handleUpdateImage('image', url);
                    }}
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
                  <span className="font-bold">{groupInfo.members?.length || 0} Members</span>
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
                      <h4 className="font-bold text-sm mb-1">{groupInfo.members?.length || 0} Members</h4>
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
              className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
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
                  onClick={handleCreatePost}
                  disabled={!newPostContent.trim()}
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
  
  const handleEdit = async () => {
    const newContent = prompt('Edit your post:', post.content);
    if (newContent && newContent !== post.content) {
      try {
        const res = await fetch(`/api/groups/${groupId}/posts/${post.id}`, {
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
        const res = await fetch(`/api/groups/${groupId}/posts/${post.id}`, {
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

      {post.image_url && (
        <div className="aspect-video bg-gray-100 dark:bg-gray-800">
          <img src={post.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className={cn("flex items-center gap-2 text-sm font-bold transition-colors", isLiked ? "text-red-500" : "text-gray-500 hover:text-red-500")}
          >
            <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
            <span>{isLiked ? '1.3K' : '1.2K'}</span>
          </button>
          <button className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">
            <MessageCircle size={20} />
            <span>42</span>
          </button>
          <button className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-colors">
            <Share2 size={20} />
            <span>12</span>
          </button>
        </div>
        <button className="text-gray-500 hover:text-yellow-500 transition-colors">
          <Bookmark size={20} />
        </button>
      </div>
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

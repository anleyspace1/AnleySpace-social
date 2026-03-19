import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { 
  Plus, 
  Video, 
  Image as ImageIcon, 
  Smile, 
  MoreHorizontal, 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark,
  ChevronRight,
  TrendingUp,
  Users,
  ShoppingBag,
  Home,
  User,
  X,
  ChevronLeft,
  Radio,
  Edit2,
  Trash2,
  Flag,
  ExternalLink,
  Send,
  CheckCircle2,
  Circle,
  ListTodo,
  GripVertical
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { MOCK_USER } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ShareModal from '../components/ShareModal';
import StoryEditor from '../components/StoryEditor';
import { ResponsiveImage } from '../components/ResponsiveImage';

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="w-full lg:max-w-3xl lg:mx-auto space-y-4 lg:space-y-6">
      {category && (
        <div className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl shadow-sm border-b lg:border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">Category:</span>
            <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              {category}
            </span>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors font-bold"
          >
            Clear Filter
          </button>
        </div>
      )}
      <Stories />
      <CreatePost onGoLive={() => navigate('/live?host=true')} onPostCreated={handleRefresh} />
      <Feed category={category} refreshKey={refreshKey} />
    </div>
  );
}

function Stories() {
  const [selectedStory, setSelectedStory] = useState<number | null>(null);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const [storyImage, setStoryImage] = useState<string | null>(null);
  const [realStories, setRealStories] = useState<any[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { profile, user } = useAuth();

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const res = await fetch('/api/stories');
      if (res.ok) {
        const data = await res.json();
        setRealStories(data);
      }
    } catch (err) {
      console.error('Error fetching stories:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStoryImage(reader.result as string);
        setIsStoryEditorOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const stories = [
    { id: 's1', user: 'sarah_j', avatar: 'https://picsum.photos/seed/sarah/100/100', image: 'https://picsum.photos/seed/story1/400/700' },
    { id: 's2', user: 'tech_guru', avatar: 'https://picsum.photos/seed/tech/100/100', image: 'https://picsum.photos/seed/story2/400/700' },
    ...realStories.map(s => ({
      id: s.id,
      user: s.username,
      avatar: s.avatar,
      image: s.image_url
    }))
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="font-bold text-sm">Stories</h3>
        <button className="text-gray-400"><MoreHorizontal size={18} /></button>
      </div>
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
        {/* Add Story Button */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1 flex-shrink-0"
        >
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:border-indigo-500 hover:text-indigo-500 transition-all group">
            <Plus size={18} className="group-hover:scale-110 transition-transform" />
          </div>
          <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400">Your Story</span>
        </button>

        {/* Story Items */}
        {stories.map((story, i) => (
          <button 
            key={story.id} 
            onClick={() => setSelectedStory(i)}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600">
              <div className="w-full h-full rounded-full border-2 border-white dark:border-black overflow-hidden bg-gray-100 dark:bg-gray-800">
                <ResponsiveImage src={story.avatar} alt={story.user} width={64} height={64} className="w-full h-full object-cover" />
              </div>
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate w-14 sm:w-16 text-center">{story.user}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {selectedStory !== null && (
          <StoryViewer 
            key={selectedStory}
            stories={stories} 
            initialIndex={selectedStory} 
            onClose={() => setSelectedStory(null)} 
          />
        )}
      </AnimatePresence>

      <StoryEditor 
        isOpen={isStoryEditorOpen}
        onClose={() => setIsStoryEditorOpen(false)}
        onPublished={fetchStories}
        content={{
          image: storyImage || '',
          user: {
            username: profile?.username || 'me',
            avatar: profile?.avatar_url || MOCK_USER.avatar
          }
        }}
      />
    </div>
  );
}

function StoryViewer({ stories, initialIndex, onClose }: { stories: any[]; initialIndex: number; onClose: () => void; key?: React.Key }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [isLiked, setIsLiked] = useState(false);

  // Timer for progress
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        return prev + 1.5; // Slightly faster for better UX
      });
    }, 50);

    return () => clearInterval(timer);
  }, [currentIndex]);

  // Handle story transition when progress reaches 100
  useEffect(() => {
    if (progress >= 100) {
      if (currentIndex < (stories?.length || 0) - 1) {
        setCurrentIndex(currentIndex + 1);
        setProgress(0);
        setIsLiked(false);
      } else {
        onClose();
      }
    }
  }, [progress, currentIndex, stories?.length, onClose]);

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    alert(`Reply sent to ${stories[currentIndex].user}: ${reply}`);
    setReply('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
    >
      {/* Close Button - Top Right */}
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors z-[110]"
      >
        <X size={32} />
      </button>

      {/* Desktop Navigation Arrows */}
      <div className="hidden md:flex absolute inset-x-0 top-1/2 -translate-y-1/2 justify-between px-8 pointer-events-none">
        <button 
          disabled={currentIndex === 0}
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
              setCurrentIndex(currentIndex - 1);
              setProgress(0);
              setIsLiked(false);
            }
          }}
          className={cn(
            "w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white pointer-events-auto transition-all",
            currentIndex === 0 ? "opacity-0 cursor-default" : "hover:bg-white/20"
          )}
        >
          <ChevronLeft size={24} />
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex < (stories?.length || 0) - 1) {
              setCurrentIndex(currentIndex + 1);
              setProgress(0);
              setIsLiked(false);
            } else {
              onClose();
            }
          }}
          className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white pointer-events-auto hover:bg-white/20 transition-all"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-[400px] max-h-full aspect-[9/16] bg-gray-900 rounded-[32px] overflow-hidden shadow-2xl flex flex-col border border-white/10"
      >
        <div className="relative flex-1 overflow-hidden">
          <ResponsiveImage src={stories[currentIndex].image} alt="" width={400} height={711} className="w-full h-full object-cover" />
          
          {/* Progress Bars */}
          <div className="absolute top-4 left-4 right-4 flex gap-1.5 z-10">
            {stories.map((_, i) => (
              <div key={i} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-100 ease-linear"
                  style={{ 
                    width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%' 
                  }}
                />
              </div>
            ))}
          </div>

          {/* User Info */}
          <div className="absolute top-8 left-4 flex items-center justify-between right-4 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 to-purple-600">
                <ResponsiveImage src={stories[currentIndex].avatar} alt="" width={40} height={40} className="w-full h-full rounded-full border-2 border-black object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-bold text-sm leading-tight">{stories[currentIndex].user}</span>
                <span className="text-white/60 text-[10px]">12h</span>
              </div>
            </div>
          </div>

          {/* Mobile Navigation Areas */}
          <div className="absolute inset-0 flex md:hidden">
            <button 
              className="flex-1 h-full cursor-default" 
              onClick={() => {
                if (currentIndex > 0) {
                  setCurrentIndex(currentIndex - 1);
                  setProgress(0);
                  setIsLiked(false);
                }
              }}
            />
            <button 
              className="flex-1 h-full cursor-default" 
              onClick={() => {
                if (currentIndex < (stories?.length || 0) - 1) {
                  setCurrentIndex(currentIndex + 1);
                  setProgress(0);
                  setIsLiked(false);
                } else {
                  onClose();
                }
              }}
            />
          </div>
        </div>

        {/* Bottom Interaction Bar */}
        <div className="p-4 bg-black/40 backdrop-blur-md border-t border-white/5 flex items-center gap-3">
          <form onSubmit={handleReply} className="flex-1 flex items-center gap-2 bg-white/10 rounded-full px-4 py-2.5 border border-white/10">
            <input 
              type="text" 
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Send message"
              className="flex-1 bg-transparent border-none focus:ring-0 text-white text-xs placeholder:text-white/50"
            />
          </form>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="text-white hover:scale-110 transition-transform active:scale-125"
            >
              <Heart size={22} className={cn(isLiked ? "fill-red-500 text-red-500" : "text-white")} />
            </button>
            <button className="text-white hover:scale-110 transition-transform">
              <Share2 size={22} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreatePost({ onGoLive, onPostCreated }: { onGoLive: () => void; onPostCreated?: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <img src={profile?.avatar_url || MOCK_USER.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-500 text-left px-4 py-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm truncate"
            >
              What's on your mind, {profile?.display_name?.split(' ')[0] || 'friend'}?
            </button>
          </div>
          <button 
            onClick={onGoLive}
            className="bg-red-500 text-white px-4 py-2.5 rounded-full hover:bg-red-600 transition-all flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-red-500/20 whitespace-nowrap"
          >
            <Radio size={18} className="animate-pulse" />
            <span>Go Live</span>
          </button>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 overflow-x-auto no-scrollbar gap-2">
          <PostAction onClick={onGoLive} icon={<Video className="text-red-500" />} label="Live" />
          <PostAction onClick={() => setIsModalOpen(true)} icon={<ImageIcon className="text-green-500" />} label="Photo/Video" />
          <PostAction onClick={() => setIsModalOpen(true)} icon={<Smile className="text-yellow-500" />} label="Feeling/Activity" />
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <CreatePostModal 
            onClose={() => setIsModalOpen(false)} 
            onPostCreated={onPostCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function CreatePostModal({ onClose, onPostCreated }: { onClose: () => void; onPostCreated?: () => void }) {
  const { user, profile } = useAuth();
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setSelectedVideo(null);
      setVideoFile(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setSelectedImage(null);
      setImageFile(null);
      const url = URL.createObjectURL(file);
      setSelectedVideo(url);
    }
  };

  const handlePost = async () => {
    if (!user) {
      alert('You must be logged in to post');
      return;
    }
    
    if (!text.trim() && !imageFile && !videoFile) {
      alert('Please add some content to your post');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = null;
      let videoUrl = null;

      // 1. Upload Image to "posts" bucket if it exists
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = fileName; // Upload to root of "posts" bucket

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, imageFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Image upload error:', uploadError);
          if (uploadError.message.includes('Bucket not found')) {
            throw new Error('Storage bucket "posts" not found. Please create a public bucket named "posts" in your Supabase dashboard.');
          }
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        // 2. Retrieve the public URL
        const { data: publicUrlData } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrlData.publicUrl;
      }

      // Upload Video if exists
      if (videoFile) {
        const fileExt = videoFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `videos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, videoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Video upload error:', uploadError);
          if (uploadError.message.includes('Bucket not found')) {
            throw new Error('Storage bucket "posts" not found. Please create a public bucket named "posts" in your Supabase dashboard.');
          }
          throw new Error(`Video upload failed: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);
        
        videoUrl = publicUrlData.publicUrl;
      }

      // 3. Save the URL in the image_url column in the posts table
      const { error: insertError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: text.trim(),
          created_at: new Date(),
          image_url: imageUrl,
          video_url: videoUrl
        });
      
      if (insertError) {
        console.error('Database insertion error:', insertError);
        throw insertError;
      }

      onClose();
      // Refresh posts
      if (onPostCreated) {
        onPostCreated();
      } else if (typeof window !== 'undefined') {
        window.location.reload(); // Fallback
      }
    } catch (err: any) {
      console.error('Error creating post:', err);
      alert(err.message || 'Failed to create post. Please ensure your Supabase Storage "posts" bucket is public and configured correctly.');
    } finally {
      setLoading(false);
    }
  };

  const feelings = ['Happy', 'Loved', 'Excited', 'Crazy', 'Blessed', 'Sad'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-white/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white dark:bg-gray-900 w-full max-w-[500px] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="w-8" />
          <h3 className="font-bold text-lg">Create Post</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-3">
            <img src={profile?.avatar_url || MOCK_USER.avatar} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
            <div>
              <h4 className="font-bold text-sm">{profile?.display_name || profile?.username || 'User'}</h4>
              {feeling && (
                <span className="text-xs text-gray-500">is feeling <span className="font-bold">{feeling}</span></span>
              )}
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`What's on your mind, ${profile?.display_name?.split(' ')[0] || 'friend'}?`}
            className="w-full min-h-[120px] bg-transparent border-none resize-none focus:ring-0 text-lg placeholder:text-gray-400"
          />

          {selectedImage && (
            <div className="relative rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
              <img src={selectedImage} alt="Selected" className="w-full object-cover max-h-[300px]" referrerPolicy="no-referrer" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {selectedVideo && (
            <div className="relative rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
              <video src={selectedVideo} controls className="w-full max-h-[300px] bg-black" />
              <button 
                onClick={() => setSelectedVideo(null)}
                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors z-10"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-500">Add to your post</span>
              <div className="flex items-center gap-2">
                <label className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer text-green-500" title="Add Photo">
                  <ImageIcon size={20} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
                <label className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer text-blue-500" title="Add Video">
                  <Video size={20} />
                  <input type="file" className="hidden" accept="video/*" onChange={handleVideoUpload} />
                </label>
                <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-yellow-500" title="Feeling/Activity">
                  <Smile size={20} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {feelings.map((f) => (
                <button
                  key={f}
                  onClick={() => setFeeling(feeling === f ? null : f)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                    feeling === f 
                      ? "bg-indigo-600 text-white" 
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4">
          <button 
            disabled={(!text.trim() && !selectedImage && !selectedVideo) || loading}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
            onClick={handlePost}
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            Post
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PostAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {icon}
      <span className="text-xs font-bold text-gray-500">{label}</span>
    </button>
  );
}

function Feed({ category, refreshKey }: { category?: string | null; refreshKey?: number }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category, refreshKey, user]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      // 1. Fetch posts first (no join to avoid breaking if relationship is missing)
      let query = supabase
        .from('posts')
        .select('*');
      
      if (category) {
        query = query.eq('category', category);
      }
      
      const { data: postsData, error: postsError } = await query.order('created_at', { ascending: false });

      if (postsError) {
        console.error('Supabase error fetching global feed:', postsError);
        throw postsError;
      }

      if (!postsData || postsData.length === 0) {
        setPosts([]);
        return;
      }

      // 2. Fetch profiles for these users separately
      const userIds = Array.from(new Set(postsData.map(p => p.user_id)));
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles for posts:', profilesError);
        // Don't throw, we still want to show posts
      }

      // 3. Map profiles to posts
      const profilesMap = (profilesData || []).reduce((acc: any, profile: any) => {
        acc[profile.id] = profile;
        return acc;
      }, {});

      const postsWithProfiles = postsData.map(post => ({
        ...post,
        profiles: profilesMap[post.user_id] || null
      }));

      console.log('Global Feed Data:', postsWithProfiles);
      setPosts(postsWithProfiles);
    } catch (err) {
      console.error('Error in fetchPosts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId: string, postUserId: string) => {
    if (!user || user.id !== postUserId) {
      alert('You can only delete your own posts');
      return;
    }

    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        const { error } = await supabase
          .from('posts')
          .delete()
          .eq('id', postId)
          .eq('user_id', user.id);
        
        if (error) throw error;
        setPosts(posts.filter(p => p.id !== postId));
      } catch (err) {
        console.error('Error deleting post:', err);
        alert('Failed to delete post');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const filteredPosts = posts;

  return (
    <div className="space-y-4 lg:space-y-6 pb-4">
      {filteredPosts.length > 0 ? (
        filteredPosts.map((post, index) => (
          <React.Fragment key={post.id}>
            <PostItem 
              post={post} 
              onDelete={() => handleDeletePost(post.id, post.user_id)} 
            />
            {/* Insert suggested content for mobile/tablet between posts */}
            {index === 0 && (
              <div className="xl:hidden space-y-6">
                <PeopleYouMayKnow />
                <TrendingSection />
              </div>
            )}
          </React.Fragment>
        ))
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-800">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag size={32} className="text-gray-400" />
          </div>
          <h3 className="font-bold text-lg mb-2">No posts found</h3>
          <p className="text-gray-500 text-sm">Be the first to post in this category!</p>
        </div>
      )}
    </div>
  );
}

function PostItem({ post, onDelete }: { post: any; onDelete: () => void; key?: React.Key }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  const postUser = {
    name: post.profiles?.full_name || post.profiles?.username || post.username || 'User',
    username: post.profiles?.username || post.username,
    avatar: post.profiles?.avatar_url || post.avatar_url || `https://picsum.photos/seed/${post.user_id}/100/100`,
    time: post.created_at ? new Date(post.created_at).toLocaleString() : 'Just now',
    isMe: post.user_id === user?.id
  };

  useEffect(() => {
    if (user) {
      checkIfLiked();
      fetchLikesCount();
      fetchCommentsCount();
    }
    if (showComments) {
      fetchComments();
    }
  }, [post.id, user, showComments]);

  const fetchLikesCount = async () => {
    const { count, error } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);
    
    if (!error && count !== null) {
      setLikesCount(count);
    }
  };

  const fetchCommentsCount = async () => {
    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);
    
    if (!error && count !== null) {
      setCommentsCount(count);
    }
  };

  const checkIfLiked = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', post.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (!error && data) {
      setIsLiked(true);
    } else {
      setIsLiked(false);
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      const formattedComments = data.map(c => ({
        id: c.id,
        user: c.username || 'unknown',
        text: c.content,
        avatar: c.avatar_url || `https://picsum.photos/seed/${c.user_id}/100/100`,
        time: new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      
      setComments(formattedComments);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLike = async () => {
    if (!user) {
      alert('Please login to like posts');
      return;
    }

    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikesCount(prev => wasLiked ? prev - 1 : prev + 1);

    try {
      if (wasLiked) {
        // Unlike
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Like
        const { error } = await supabase
          .from('likes')
          .insert({
            post_id: post.id,
            user_id: user.id
          });
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Rollback on error
      setIsLiked(wasLiked);
      setLikesCount(prev => wasLiked ? prev + 1 : prev - 1);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Please login to comment');
      return;
    }
    if (!newComment.trim()) return;

    const commentText = newComment.trim();
    setNewComment('');

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: post.id,
          user_id: user.id,
          content: commentText,
          created_at: new Date()
        })
        .select()
        .single();
      
      if (error) throw error;

      const newCommentObj = {
        id: data.id,
        user: data.username || 'me',
        text: data.content,
        avatar: data.avatar_url || `https://picsum.photos/seed/${data.user_id}/100/100`,
        time: 'now'
      };

      setComments([...comments, newCommentObj]);
      setCommentsCount(prev => prev + 1);
    } catch (err) {
      console.error('Error adding comment:', err);
      setNewComment(commentText); // Restore text on error
      alert('Failed to add comment');
    }
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
  };

  const handleSaveEdit = async () => {
    if (!user || user.id !== post.user_id) return;
    if (!editContent.trim()) return;
    
    try {
      const { error } = await supabase
        .from('posts')
        .update({ content: editContent.trim() })
        .eq('id', post.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating post:', err);
      alert('Failed to update post');
    }
  };

  const formatCount = (count: number) => {
    return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800 overflow-hidden hover:opacity-80 transition-opacity"
          >
            <img src={postUser.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </button>
          <div>
            <button 
              onClick={() => navigate('/profile')}
              className="font-bold text-sm hover:underline hover:text-indigo-600 transition-colors block text-left"
            >
              {postUser.name}
            </button>
            <span className="text-[10px] text-gray-400">{postUser.time}</span>
          </div>
        </div>
        <PostMenu 
          isMe={postUser.isMe} 
          onDelete={onDelete}
          onEdit={() => setIsEditing(true)}
          onReport={() => alert('Post reported. Thank you for keeping our community safe.')}
          onShare={handleShare}
          onCopyLink={handleCopyLink}
        />
      </div>
      
      <div className="px-4 pb-4">
        {isEditing ? (
          <div className="space-y-3 mb-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-gray-800 dark:text-gray-200"
              placeholder="What's on your mind?"
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(post.content);
                }}
                className="px-4 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm mb-4">{post.content}</p>
        )}
      </div>

      {(post.video_url || post.image_url) && (
        <div className="px-0">
          <div className="relative overflow-hidden bg-gray-100 dark:bg-gray-800 border-y lg:border lg:rounded-2xl border-gray-100 dark:border-gray-800 aspect-video flex items-center justify-center w-full">
            {post.video_url ? (
              <video 
                src={post.video_url} 
                controls 
                className="w-full h-full object-contain bg-black" 
              />
            ) : (
              <ResponsiveImage 
                src={post.image_url} 
                alt="" 
                width={800}
                height={450}
                className="w-full h-full object-cover" 
              />
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-white transition-colors",
              isLiked ? "bg-red-500" : "bg-indigo-600"
            )}>
              <Heart size={10} fill="white" />
            </div>
            <span className="text-xs text-gray-500">{formatCount(likesCount)}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <button onClick={() => setShowComments(!showComments)} className="hover:underline">
              {formatCount(commentsCount)} comments
            </button>
            <span>{post.shares_count || 0} shares</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
          <FeedAction 
            icon={<Heart size={20} className={cn("transition-colors", isLiked && "text-red-500 fill-red-500")} />} 
            label="Like" 
            active={isLiked}
            onClick={handleLike}
          />
          <FeedAction 
            icon={<MessageCircle size={20} className={cn("transition-colors", showComments && "text-indigo-600")} />} 
            label="Comment" 
            active={showComments}
            onClick={() => setShowComments(!showComments)}
          />
          <FeedAction icon={<Share2 size={20} />} label="Share" onClick={handleShare} />
          <FeedAction 
            icon={<Bookmark size={20} className={cn("transition-colors", isSaved && "text-yellow-500 fill-yellow-500")} />} 
            label="Save" 
            active={isSaved}
            onClick={() => setIsSaved(!isSaved)}
          />
        </div>

        {/* Expandable Comment Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="space-y-4 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                  {loadingComments ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : comments.length > 0 ? (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <ResponsiveImage src={comment.avatar} alt="" width={40} height={40} className="w-8 h-8 rounded-full object-cover" />
                        <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">@{comment.user}</span>
                            <span className="text-[10px] text-gray-400">{comment.time}</span>
                          </div>
                          <p className="text-xs text-gray-700 dark:text-gray-300">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-xs text-gray-500 py-4">No comments yet. Be the first to comment!</p>
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5">
                  <ResponsiveImage src={profile?.avatar_url || MOCK_USER.avatar} alt="" width={40} height={40} className="w-7 h-7 rounded-full object-cover ml-1" />
                  <input 
                    type="text" 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..." 
                    className="flex-1 bg-transparent border-none focus:ring-0 py-1.5 text-xs"
                  />
                  <button 
                    type="submit"
                    disabled={!newComment.trim()}
                    className={cn(
                      "p-1.5 rounded-xl transition-all",
                      newComment.trim() ? "bg-indigo-600 text-white" : "text-gray-400"
                    )}
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
          image: post.image_url,
          user: {
            username: (postUser.name || 'user').toLowerCase().replace(' ', '_'),
            avatar: postUser.avatar
          }
        }}
      />
    </div>
  );
}

function PostMenu({ isMe, onEdit, onDelete, onReport, onShare, onCopyLink }: { isMe: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void; onShare: () => void; onCopyLink: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => setIsOpen(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 transition-colors"
      >
        <MoreHorizontal size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden"
          >
            <div className="py-1">
              {isMe ? (
                <>
                  <MenuButton icon={<Edit2 size={16} />} label="Edit Post" onClick={() => { onEdit(); setIsOpen(false); }} />
                  <MenuButton icon={<Trash2 size={16} />} label="Delete Post" onClick={() => { onDelete(); setIsOpen(false); }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" />
                </>
              ) : (
                <>
                  <MenuButton icon={<Flag size={16} />} label="Report Post" onClick={() => { onReport(); setIsOpen(false); }} />
                  <MenuButton icon={<Share2 size={16} />} label="Share Post" onClick={() => { onShare(); setIsOpen(false); }} />
                  <MenuButton icon={<ExternalLink size={16} />} label="Copy Link" onClick={() => { onCopyLink(); setIsOpen(false); }} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({ icon, label, onClick, className }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button 
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function RightSidebar() {
  return (
    <aside className="hidden xl:block space-y-6 sticky top-22 h-fit w-80">
      <PeopleYouMayKnow />
      <TrendingSection />
      <SuggestedGroups />
    </aside>
  );
}

function FeedAction({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-all text-gray-500",
        active ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-indigo-600"
      )}
    >
      {icon}
      <span className="text-xs font-bold hidden sm:inline">{label}</span>
    </button>
  );
}

function PeopleYouMayKnow() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSuggested = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .neq('id', user.id)
          .limit(3);
        
        if (error) throw error;
        
        if (data) {
          setPeople(data);
          
          const { data: followsData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id)
            .in('following_id', data.map(p => p.id));
          
          const followingMap: Record<string, boolean> = {};
          followsData?.forEach(f => {
            followingMap[f.following_id] = true;
          });
          setFollowing(followingMap);
        }
      } catch (err) {
        console.error('Error fetching suggested users:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggested();
  }, [user]);

  const handleFollow = async (id: string) => {
    if (!user) return;
    const wasFollowing = following[id];
    setFollowing(prev => ({ ...prev, [id]: !wasFollowing }));

    try {
      if (wasFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', id);
      } else {
        await supabase
          .from('follows')
          .insert([{ follower_id: user.id, following_id: id }]);
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      setFollowing(prev => ({ ...prev, [id]: wasFollowing }));
    }
  };

  if (loading) return null;
  if (people.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">People You May Know</h3>
      <div className="space-y-4">
        {people.map((person) => (
          <div key={person.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(`/profile/${person.username}`)}
                className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800 overflow-hidden hover:opacity-80 transition-opacity"
              >
                <img src={person.avatar_url || `https://picsum.photos/seed/${person.id}/100/100`} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </button>
              <button 
                onClick={() => navigate(`/profile/${person.username}`)}
                className="text-sm font-bold hover:underline hover:text-indigo-600 transition-colors"
              >
                {person.full_name || person.username}
              </button>
            </div>
            <button 
              onClick={() => handleFollow(person.id)}
              className={cn(
                "text-xs font-bold transition-colors",
                following[person.id] ? "text-gray-400" : "text-indigo-600 hover:underline"
              )}
            >
              {following[person.id] ? 'Following' : 'Follow'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendingSection() {
  const navigate = useNavigate();
  const trends = ['SummerVibes', 'TechNews', 'TravelGoals', 'FitnessJourney', 'FoodieLife'];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl p-4 shadow-sm border-b lg:border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">Trending</h3>
      <div className="space-y-3">
        {trends.map((trend) => (
          <button 
            key={trend} 
            onClick={() => navigate(`/hashtag/${trend}`)}
            className="block text-indigo-600 text-sm font-bold hover:underline"
          >
            #{trend}
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestedGroups() {
  const navigate = useNavigate();
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  
  const groups = [
    { id: 'g1', name: 'Photographers', icon: '📸', image: 'https://picsum.photos/seed/photo/400/200' },
    { id: 'g2', name: 'Travelers', icon: '✈️', image: 'https://picsum.photos/seed/travel/400/200' },
  ];

  const handleJoin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setJoined(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">Suggested Groups</h3>
      <div className="space-y-4">
        {groups.map(group => (
          <div 
            key={group.id} 
            onClick={() => navigate(`/groups/${group.id}`)}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                {group.icon}
              </div>
              <span className="text-sm font-bold group-hover:text-indigo-600 transition-colors">{group.name}</span>
            </div>
            <button 
              onClick={(e) => handleJoin(e, group.id)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                joined[group.id] 
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-500" 
                  : "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:bg-indigo-100"
              )}
            >
              {joined[group.id] ? 'Leave' : 'Join'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

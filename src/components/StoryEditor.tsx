import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Type, 
  Sticker, 
  Smile, 
  Download, 
  Send,
  Heart
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiOrigin';

interface StoryEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished?: () => void;
  content: {
    image: string;
    user: {
      username: string;
      avatar: string;
    };
  };
}

export default function StoryEditor({ isOpen, onClose, onPublished, content }: StoryEditorProps) {
  const [text, setText] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(true);
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePublish = async () => {
    if (!user) {
      alert('You must be logged in to post a story');
      return;
    }

    setIsPublishing(true);
    try {
      let finalImageUrl = content.image;

      // 1. If image is base64, upload to Supabase Storage
      if (content.image.startsWith('data:')) {
        try {
          // Convert base64 to Blob
          const base64Data = content.image.split(',')[1];
          const mimeType = content.image.split(',')[0].split(':')[1].split(';')[0];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });

          const fileExt = mimeType.split('/')[1] || 'jpg';
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          const filePath = `stories/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('posts') // Reusing "posts" bucket if "stories" doesn't exist
            .upload(filePath, blob, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            // If it fails, we'll try to fallback to base64 if it's not too large, 
            // but the user wants a public URL.
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('posts')
              .getPublicUrl(filePath);
            
            finalImageUrl = publicUrlData.publicUrl;
          }
        } catch (uploadErr) {
          console.error('Failed to upload image to Supabase:', uploadErr);
        }
      }

      const response = await fetch(apiUrl('/api/stories'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          userId: user.id,
          username: content.user.username,
          avatar: content.user.avatar,
          imageUrl: finalImageUrl,
        }),
      });

      if (response.ok) {
        alert('Published to your story!');
        if (onPublished) onPublished();
        onClose();
      } else {
        throw new Error('Failed to publish story');
      }
    } catch (err) {
      console.error('Publish story error:', err);
      alert('Failed to publish story. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] bg-black flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full h-full max-w-md md:h-[90vh] md:rounded-3xl overflow-hidden bg-gray-900 shadow-2xl flex flex-col"
          >
            {/* Background Image */}
            <div className="absolute inset-0">
              <img src={content.image} alt="" className="w-full h-full object-cover blur-md opacity-50" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
            </div>

            {/* Header */}
            <div className="relative z-10 p-4 flex items-center justify-between text-white">
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={24} />
              </button>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setShowTextInput(true);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Add Text"
                >
                  <Type size={20} />
                </button>
                <button 
                  onClick={() => alert('Stickers feature coming soon! 🎨')}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Add Sticker"
                >
                  <Sticker size={20} />
                </button>
                <button 
                  onClick={() => alert('Emoji picker coming soon! 😊')}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Add Emoji"
                >
                  <Smile size={20} />
                </button>
                <button 
                  onClick={() => {
                    if (content.image) {
                      const link = document.createElement('a');
                      link.href = content.image;
                      link.download = `story-${Date.now()}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Download"
                >
                  <Download size={20} />
                </button>
              </div>
            </div>

            {/* Content Preview */}
            <div className="relative flex-1 flex flex-col items-center justify-center p-4 md:p-6 overflow-hidden min-h-0">
              <div 
                ref={containerRef}
                className="relative w-full h-full max-w-[min(100%,400px)] max-h-[70vh] aspect-[9/16] bg-black rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex items-center justify-center"
              >
                <img 
                  src={content.image} 
                  alt="" 
                  className="w-full h-full object-contain" 
                  referrerPolicy="no-referrer" 
                />
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 rounded-full z-30">
                  <img src={content.user.avatar} alt="" className="w-6 h-6 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                  <span className="text-white text-[10px] font-bold">@{content.user.username}</span>
                </div>

                {/* Editable Text Overlay - Now Draggable and constrained to the image */}
                <AnimatePresence>
                  {showTextInput && (
                    <motion.div 
                      drag
                      dragConstraints={containerRef}
                      dragElastic={0.1}
                      dragMomentum={false}
                      initial={{ scale: 0.8, opacity: 0, x: '-50%', y: '-50%' }}
                      animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute z-40 bg-white/90 text-black px-4 py-2 rounded-lg font-bold text-xl shadow-xl cursor-move active:scale-105 transition-transform left-1/2 top-1/2"
                      style={{ touchAction: 'none' }}
                    >
                      <input 
                        ref={inputRef}
                        type="text" 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Add text..."
                        className="bg-transparent border-none focus:ring-0 text-center placeholder:text-black/30 w-full min-w-[120px] cursor-text"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 p-6 flex items-center justify-between gap-4">
              <button 
                onClick={onClose}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded-2xl font-bold transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                {isPublishing ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    <span>Share to Story</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

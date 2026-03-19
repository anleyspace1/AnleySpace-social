import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageCircle, 
  Plus, 
  Copy, 
  Share,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStory: () => void;
  postUrl?: string;
}

export default function ShareModal({ isOpen, onClose, onAddStory, postUrl }: ShareModalProps) {
  const handleCopyLink = () => {
    const url = postUrl || window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
      onClose();
    });
  };

  const shareOptions = [
    { 
      id: 'messages', 
      icon: <MessageCircle size={24} />, 
      label: 'Share to Messages', 
      color: 'bg-blue-500',
      onClick: () => { alert('Sharing to messages...'); onClose(); }
    },
    { 
      id: 'story', 
      icon: <Plus size={24} />, 
      label: 'Add to Story', 
      color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600',
      onClick: onAddStory
    },
    { 
      id: 'copy', 
      icon: <Copy size={24} />, 
      label: 'Copy Post Link', 
      color: 'bg-gray-500',
      onClick: handleCopyLink
    },
    { 
      id: 'other', 
      icon: <Share size={24} />, 
      label: 'Share to Other Apps', 
      color: 'bg-green-500',
      onClick: () => { 
        if (navigator.share) {
          navigator.share({
            title: 'Check out this post!',
            url: postUrl || window.location.href
          }).catch(console.error);
        } else {
          alert('Sharing to other apps...'); 
        }
        onClose(); 
      }
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border-t sm:border border-gray-100 dark:border-gray-800"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Share</h3>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {shareOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={option.onClick}
                  className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group"
                >
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform",
                    option.color
                  )}>
                    {option.icon}
                  </div>
                  <span className="text-sm font-bold text-center">{option.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl">
                <div className="flex-1 truncate text-sm text-gray-500">
                  {postUrl || window.location.href}
                </div>
                <button 
                  onClick={handleCopyLink}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

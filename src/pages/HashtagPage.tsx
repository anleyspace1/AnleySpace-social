import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Hash, TrendingUp, Users, Grid, PlaySquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { MOCK_VIDEOS } from '../constants';

export default function HashtagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'posts' | 'reels'>('posts');

  // Mock data for the hashtag
  const stats = {
    posts: '1.2M',
    views: '450M',
    creators: '12K'
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 dark:bg-black pb-12"
    >
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-14 sm:top-16 z-30">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Hash size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-black">#{tag}</h1>
              <p className="text-sm text-gray-500">Trending in Lifestyle</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard icon={<Grid size={16} />} label="Posts" value={stats.posts} />
            <StatCard icon={<TrendingUp size={16} />} label="Views" value={stats.views} />
            <StatCard icon={<Users size={16} />} label="Creators" value={stats.creators} />
          </div>

          <div className="flex gap-8 border-b border-gray-100 dark:border-gray-800">
            <TabButton 
              active={activeTab === 'posts'} 
              onClick={() => setActiveTab('posts')} 
              icon={<Grid size={18} />} 
              label="Posts" 
            />
            <TabButton 
              active={activeTab === 'reels'} 
              onClick={() => setActiveTab('reels')} 
              icon={<PlaySquare size={18} />} 
              label="Reels" 
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {activeTab === 'posts' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-2xl overflow-hidden group cursor-pointer relative"
              >
                <img 
                  src={`https://picsum.photos/seed/tag${i}/500/500`} 
                  alt="" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="flex items-center gap-4 text-white font-bold">
                    <span className="flex items-center gap-1"><TrendingUp size={18} /> {Math.floor(Math.random() * 100)}K</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {MOCK_VIDEOS.map((video, i) => (
              <motion.div 
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate('/reels')}
                className="aspect-[9/16] bg-gray-200 dark:bg-gray-800 rounded-2xl overflow-hidden group cursor-pointer relative"
              >
                <img 
                  src={video.thumbnail} 
                  alt="" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center gap-2 text-white text-[10px] font-bold">
                    <PlaySquare size={12} />
                    {video.viewerCount || '1.2K'}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-black">{value}</p>
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

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Bookmark, Search, Grid, List, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'posts' | 'products' | 'videos'>('all');

  const savedItems = [
    { id: 1, type: 'post', title: 'Amazing weekend trip views', user: 'Jessica Brown', image: 'https://picsum.photos/seed/post1/400/300' },
    { id: 2, type: 'product', title: 'Vintage Camera', price: '$120', image: 'https://picsum.photos/seed/cam/400/300' },
    { id: 3, type: 'video', title: 'How to cook the perfect steak', user: 'Chef Gordon', image: 'https://picsum.photos/seed/steak/400/300' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="max-w-6xl mx-auto p-4 md:p-6 pb-24"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black">Saved</h1>
          <p className="text-sm text-gray-500">Items you've saved for later</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Sidebar - Collections */}
        <div className="w-full md:w-64 space-y-2">
          <CollectionButton active={activeTab === 'all'} onClick={() => setActiveTab('all')} icon={<Bookmark size={18} />} label="All Items" />
          <CollectionButton active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} icon={<Grid size={18} />} label="Saved Posts" />
          <CollectionButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Bookmark size={18} />} label="Marketplace" />
          <CollectionButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} icon={<Bookmark size={18} />} label="Videos" />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search saved items..." 
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-500"><Grid size={18} /></button>
              <button className="p-2 rounded-lg text-gray-400"><List size={18} /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedItems.filter(item => activeTab === 'all' || item.type === activeTab.slice(0, -1)).map(item => (
              <SavedCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CollectionButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
        active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface SavedCardProps {
  key?: React.Key;
  item: any;
}

function SavedCard({ item }: SavedCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm group">
      <div className="aspect-video relative">
        <img src={item.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-2 right-2 flex gap-1">
          <button className="p-1.5 bg-black/50 text-white rounded-full backdrop-blur-sm hover:bg-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
          <button className="p-1.5 bg-black/50 text-white rounded-full backdrop-blur-sm">
            <MoreHorizontal size={14} />
          </button>
        </div>
        <div className="absolute bottom-2 left-2">
          <span className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider">
            {item.type}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-sm mb-1 line-clamp-1">{item.title}</h3>
        <p className="text-xs text-gray-500">
          {item.type === 'product' ? `Price: ${item.price}` : `Saved from ${item.user}`}
        </p>
      </div>
    </div>
  );
}

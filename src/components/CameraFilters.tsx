import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Star, Settings2, GripVertical, Trash2, Heart, X } from 'lucide-react';

export interface Filter {
  id: string;
  name: string;
  class: string;
  type: 'css' | 'ai';
  aiConfig?: {
    smoothing?: number;
    slimming?: number;
    eyes?: number;
    lighting?: number;
  };
  style?: React.CSSProperties;
}

export const CAMERA_FILTERS: Filter[] = [
  { id: 'none', name: 'Original', class: '', type: 'css' },
  { 
    id: 'beauty_ai', 
    name: 'Beauty AI', 
    class: '', 
    type: 'ai',
    aiConfig: { smoothing: 0.6, slimming: 0.2, eyes: 0.1, lighting: 0.1 }
  },
  { 
    id: 'glam_ai', 
    name: 'Glam AI', 
    class: '', 
    type: 'ai',
    aiConfig: { smoothing: 0.8, slimming: 0.3, eyes: 0.2, lighting: 0.2 }
  },
  { 
    id: 'slim_ai', 
    name: 'Slim AI', 
    class: '', 
    type: 'ai',
    aiConfig: { smoothing: 0.2, slimming: 0.5, eyes: 0.1, lighting: 0.1 }
  },
  { id: 'beauty', name: 'Beauty', class: 'brightness-[1.05] contrast-[1.05] saturate-[1.1]', type: 'css' },
  { id: 'vintage', name: 'Vintage', class: 'sepia-[0.4] contrast-[1.1] brightness-[0.9]', type: 'css' },
  { id: 'bw', name: 'B&W', class: 'grayscale-[1]', type: 'css' },
  { id: 'vivid', name: 'Vivid', class: 'saturate-[1.6] contrast-[1.1]', type: 'css' },
  { id: 'cool', name: 'Cool', class: 'hue-rotate-[180deg] saturate-[1.2] brightness-[1.05]', type: 'css' },
  { id: 'warm', name: 'Warm', class: 'sepia-[0.3] saturate-[1.3] brightness-[1.05]', type: 'css' },
  { id: 'noir', name: 'Noir', class: 'grayscale-[1] contrast-[1.6] brightness-[0.8]', type: 'css' },
  { id: 'cyber', name: 'Cyber', class: 'hue-rotate-[280deg] saturate-[2] contrast-[1.2]', type: 'css' },
  { id: 'dreamy', name: 'Dreamy', class: 'brightness-[1.1] blur-[0.5px] saturate-[1.2]', type: 'css' },
];

interface CameraFiltersProps {
  selectedFilterId: string;
  onFilterSelect: (filterId: string) => void;
}

export default function CameraFilters({ selectedFilterId, onFilterSelect }: CameraFiltersProps) {
  const [favorites, setFavorites] = React.useState<string[]>(() => {
    const saved = localStorage.getItem('favorite_filters');
    return saved ? JSON.parse(saved) : ['beauty_ai', 'glam_ai'];
  });
  const [isManageOpen, setIsManageOpen] = React.useState(false);

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newFavorites = favorites.includes(id)
      ? favorites.filter(f => f !== id)
      : [...favorites, id];
    setFavorites(newFavorites);
    localStorage.setItem('favorite_filters', JSON.stringify(newFavorites));
  };

  // Sort filters: favorites first, then others
  const sortedFilters = [...CAMERA_FILTERS].sort((a, b) => {
    const aFav = favorites.includes(a.id);
    const bFav = favorites.includes(b.id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  return (
    <div className="relative">
      <div className="w-full overflow-x-auto no-scrollbar py-4 px-6 flex items-center gap-4 bg-gradient-to-t from-black/60 to-transparent">
        <button 
          onClick={() => setIsManageOpen(true)}
          className="flex flex-col items-center gap-2 flex-shrink-0 group"
        >
          <div className="w-14 h-14 rounded-full border-2 border-white/20 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all">
            <Settings2 size={24} className="text-white" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Manage</span>
        </button>

        {sortedFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onFilterSelect(filter.id)}
            className="flex flex-col items-center gap-2 flex-shrink-0 group relative"
          >
            <div 
              className={cn(
                "w-14 h-14 rounded-full border-2 transition-all overflow-hidden relative",
                selectedFilterId === filter.id 
                  ? "border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.5)]" 
                  : "border-white/20 hover:border-white/40"
              )}
            >
              {/* Filter Preview Circle */}
              <div className={cn("w-full h-full bg-gray-800", filter.class)} />
              
              {/* Favorite Indicator */}
              {favorites.includes(filter.id) && (
                <div className="absolute top-1 right-1">
                  <Heart size={10} className="text-red-500 fill-red-500" />
                </div>
              )}

              {selectedFilterId === filter.id && (
                <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>
              )}
            </div>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest transition-colors",
              selectedFilterId === filter.id ? "text-white" : "text-white/40 group-hover:text-white/60"
            )}>
              {filter.name}
            </span>
          </button>
        ))}
      </div>

      {/* Manage Filters Modal */}
      <AnimatePresence>
        {isManageOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-xl flex items-end"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full bg-gray-900 rounded-t-[32px] p-8 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-white">Manage Filters</h2>
                <button 
                  onClick={() => setIsManageOpen(false)}
                  className="p-2 bg-white/10 rounded-full text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {CAMERA_FILTERS.map((filter) => (
                  <div 
                    key={filter.id}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn("w-12 h-12 rounded-xl bg-gray-800", filter.class)} />
                      <div>
                        <h4 className="font-bold text-white">{filter.name}</h4>
                        <p className="text-xs text-white/40 uppercase tracking-widest">{filter.type === 'ai' ? 'AI Powered' : 'Classic'}</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => toggleFavorite(e, filter.id)}
                      className={cn(
                        "p-3 rounded-xl transition-all",
                        favorites.includes(filter.id) 
                          ? "bg-red-500/20 text-red-500" 
                          : "bg-white/10 text-white/40"
                      )}
                    >
                      <Heart size={20} fill={favorites.includes(filter.id) ? "currentColor" : "none"} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

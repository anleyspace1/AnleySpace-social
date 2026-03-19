import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Plus, ShoppingBag, Bell, PlaySquare } from 'lucide-react';
import { cn } from '../lib/utils';

export default function BottomNav({ isReels, isCreateReel }: { isReels?: boolean; isCreateReel?: boolean }) {
  if (isCreateReel) return null;

  return (
    <nav className={cn(
      "lg:hidden fixed bottom-0 left-0 right-0 h-[72px] z-[100] flex items-center justify-around px-2 border-t",
      isReels 
        ? "bg-black/80 backdrop-blur-xl border-white/10" 
        : "bg-white/90 dark:bg-black/90 backdrop-blur-xl border-gray-200 dark:border-gray-800"
    )}>
      <BottomNavItem to="/" icon={<Home size={26} />} label="HOME" isReels={isReels} />
      <BottomNavItem to="/explore" icon={<Compass size={26} />} label="EXPLORE" isReels={isReels} />
      
      <div className="relative -top-6">
        <NavLink to="/reels/create" className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-500/40 border-4 border-white dark:border-black active:scale-95 transition-transform">
          <Plus size={32} strokeWidth={2.5} />
        </NavLink>
      </div>

      <BottomNavItem to="/reels" icon={<PlaySquare size={26} />} label="REELS" isReels={isReels} />
      <BottomNavItem to="/marketplace" icon={<ShoppingBag size={26} />} label="SHOP" isReels={isReels} />
    </nav>
  );
}

function BottomNavItem({ to, icon, label, isReels }: { to: string; icon: React.ReactNode; label: string; isReels?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(
        "flex flex-col items-center gap-1 transition-all duration-300",
        isActive 
          ? (isReels ? "text-white scale-110" : "text-indigo-600 dark:text-indigo-400 scale-110") 
          : (isReels ? "text-white/40 hover:text-white/60" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200")
      )}
    >
      {icon}
      <span className="text-[10px] font-black tracking-tighter">{label}</span>
    </NavLink>
  );
}

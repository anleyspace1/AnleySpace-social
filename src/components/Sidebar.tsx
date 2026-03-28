import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Home, 
  Users, 
  LayoutGrid, 
  ShoppingBag, 
  Wallet,
  Bookmark,
  ChevronRight,
  Bell,
  Moon,
  Sun,
  LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';
import { MOCK_USER } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { ResponsiveImage } from './ResponsiveImage';
import { supabase } from '../lib/supabase';
import { useGroupNotificationsOptional } from '../contexts/GroupNotificationsContext';

export type SidebarNavAppearance = 'default' | 'darkColumn';

export default function Sidebar({
  onClose,
  darkMode,
  setDarkMode,
  navAppearance = 'default',
}: {
  onClose?: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  /** Desktop Home left column: purple accent nav on dark strip. */
  navAppearance?: SidebarNavAppearance;
}) {
  const { user, signOut } = useAuth();
  const groupNotif = useGroupNotificationsOptional();
  const groupUnread = groupNotif?.unreadCount ?? 0;
  const [displayUser, setDisplayUser] = useState({
    displayName: 'User',
    username: 'user',
    avatar: MOCK_USER.avatar as string,
  });

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        if (!cancelled) {
          setDisplayUser({
            displayName: 'User',
            username: 'user',
            avatar: MOCK_USER.avatar as string,
          });
        }
        return;
      }

      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', uid)
        .maybeSingle();

      if (cancelled) return;

      if (error || !profileRow) {
        setDisplayUser({
          displayName: 'User',
          username: uid ? `user_${uid.slice(0, 6)}` : 'user',
          avatar: MOCK_USER.avatar as string,
        });
        return;
      }

      const uname = (profileRow.username || '').trim() || (uid ? `user_${uid.slice(0, 6)}` : 'user');
      setDisplayUser({
        displayName: uname,
        username: uname,
        avatar: profileRow.avatar_url || (MOCK_USER.avatar as string),
      });
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
        <NavLink 
          to="/profile" 
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 mb-6 p-2 rounded-xl transition-all',
            navAppearance === 'darkColumn' ? 'hover:bg-white/5' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
          )}
        >
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-indigo-500 p-0.5">
            <ResponsiveImage src={displayUser.avatar} alt={displayUser.username} width={48} height={48} className="w-full h-full rounded-full object-cover" />
          </div>
          <div>
            <h3
              className={cn(
                'font-bold text-sm',
                navAppearance === 'darkColumn' ? 'text-white' : 'text-gray-900 dark:text-white'
              )}
            >
              {displayUser.displayName}
            </h3>
            <p className="text-xs text-gray-400">@{displayUser.username}</p>
          </div>
        </NavLink>

        <nav className="space-y-1">
          <SidebarLink to="/" icon={<Home size={20} />} label="Home" onClick={onClose} navAppearance={navAppearance} />
          <SidebarLink to="/friends" icon={<Users size={20} />} label="Friends" onClick={onClose} navAppearance={navAppearance} />
          <SidebarLink
            to="/groups"
            icon={<LayoutGrid size={20} />}
            label="Groups"
            onClick={onClose}
            navAppearance={navAppearance}
            badgeCount={groupUnread > 0 ? groupUnread : undefined}
          />
          <SidebarLink to="/marketplace" icon={<ShoppingBag size={20} />} label="Marketplace" onClick={onClose} navAppearance={navAppearance} />
          <SidebarLink to="/assets" icon={<Wallet size={20} />} label="Assets" onClick={onClose} navAppearance={navAppearance} />
          <SidebarLink to="/notifications" icon={<Bell size={20} />} label="Notifications" onClick={onClose} navAppearance={navAppearance} />
          <SidebarLink to="/saved" icon={<Bookmark size={20} />} label="Saved" onClick={onClose} navAppearance={navAppearance} />
        </nav>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Settings</h4>
        <button 
          onClick={() => setDarkMode(!darkMode)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all',
            navAppearance === 'darkColumn'
              ? 'hover:bg-white/5 text-gray-300'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
          )}
        >
          <div className="flex items-center gap-3">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span className="text-sm">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </div>
          <div className={cn(
            "w-10 h-5 rounded-full relative transition-colors",
            darkMode ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"
          )}>
            <div className={cn(
              "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
              darkMode ? "left-6" : "left-1"
            )} />
          </div>
        </button>

        <button 
          onClick={() => signOut()}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl transition-all',
            navAppearance === 'darkColumn'
              ? 'hover:bg-red-500/15 text-red-300'
              : 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600'
          )}
        >
          <LogOut size={20} />
          <span className="text-sm font-bold">Logout</span>
        </button>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Categories</h4>
        <nav className="space-y-1">
          <CategoryLink to="/?category=Technology" label="Technology" onClick={onClose} navAppearance={navAppearance} />
          <CategoryLink to="/?category=Sports" label="Sports" onClick={onClose} navAppearance={navAppearance} />
          <CategoryLink to="/?category=Art" label="Art" onClick={onClose} navAppearance={navAppearance} />
          <CategoryLink to="/?category=Business" label="Business" onClick={onClose} navAppearance={navAppearance} />
          <CategoryLink to="/?category=Education" label="Education" onClick={onClose} navAppearance={navAppearance} />
        </nav>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Shortcuts</h4>
        <nav className="space-y-1">
          <ShortcutLink to="/groups/travel" color="bg-blue-100 text-blue-600" label="Travel Lovers" onClick={onClose} navAppearance={navAppearance} />
          <ShortcutLink to="/groups/music" color="bg-purple-100 text-purple-600" label="Music Hub" onClick={onClose} navAppearance={navAppearance} />
          <ShortcutLink to="/groups/fitness" color="bg-orange-100 text-orange-600" label="Fitness Club" onClick={onClose} navAppearance={navAppearance} />
          <ShortcutLink to="/groups/gaming" color="bg-red-100 text-red-600" label="Gaming World" onClick={onClose} navAppearance={navAppearance} />
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  onClick,
  navAppearance,
  badgeCount,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  navAppearance: SidebarNavAppearance;
  /** Optional unread badge (e.g. group message notifications). */
  badgeCount?: number;
}) {
  return (
    <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
      <NavLink 
        to={to}
        onClick={onClick}
        className={({ isActive }) => cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative',
          navAppearance === 'darkColumn'
            ? isActive
              ? 'bg-gradient-to-r from-indigo-500/25 to-violet-500/20 text-indigo-200 font-bold border border-indigo-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
            : isActive
              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 font-bold'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
      >
        {icon}
        <span className="text-sm">{label}</span>
        {badgeCount != null && badgeCount > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold leading-none">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </NavLink>
    </motion.div>
  );
}

function CategoryLink({
  to,
  label,
  onClick,
  navAppearance,
}: {
  to: string;
  label: string;
  onClick?: () => void;
  navAppearance: SidebarNavAppearance;
}) {
  return (
    <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
      <NavLink 
        to={to}
        onClick={onClick}
        className={({ isActive }) => cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm',
          navAppearance === 'darkColumn'
            ? isActive
              ? 'bg-indigo-500/20 text-indigo-200 font-bold border border-indigo-400/30'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
            : isActive
              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 font-bold'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
      >
        {label}
      </NavLink>
    </motion.div>
  );
}

function ShortcutLink({
  to,
  color,
  label,
  onClick,
  navAppearance,
}: {
  to: string;
  color: string;
  label: string;
  onClick?: () => void;
  navAppearance: SidebarNavAppearance;
}) {
  return (
    <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
      <NavLink 
        to={to}
        onClick={onClick}
        className={({ isActive }) => cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group',
          navAppearance === 'darkColumn'
            ? isActive
              ? 'bg-indigo-500/20 text-indigo-200 font-bold border border-indigo-400/30'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
            : isActive
              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 font-bold'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-110 shadow-sm", color)}>
          {label.charAt(0)}
        </div>
        <span className="text-sm">{label}</span>
      </NavLink>
    </motion.div>
  );
}

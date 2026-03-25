import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Search, 
  Plus, 
  ShoppingBag, 
  User, 
  MessageCircle, 
  Bell, 
  Compass,
  Radio,
  Menu,
  Moon,
  Sun,
  Wallet,
  Gift,
  Share2,
  Settings,
  ArrowLeft,
  Users,
  Bookmark,
  LayoutGrid,
  PlaySquare,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { ResponsiveImage } from './components/ResponsiveImage';

// Pages
import HomePage, { RightSidebar } from './pages/HomePage';
import ExplorePage from './pages/ExplorePage';
import MarketplacePage from './pages/MarketplacePage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import ProductDetailPage from './pages/ProductDetailPage';
import WalletPage from './pages/WalletPage';
import InviteEarnPage from './pages/InviteEarnPage';
import LivePage from './pages/LivePage';
import ReelsPage from './pages/ReelsPage';
import FriendsPage from './pages/FriendsPage';
import GroupsPage from './pages/GroupsPage';
import SavedPage from './pages/SavedPage';
import GiftsPage from './pages/GiftsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CreatorTipsPage from './pages/CreatorTipsPage';
import GroupChatPage from './pages/GroupChatPage';
import GroupDetailPage from './pages/GroupDetailPage';
import HashtagPage from './pages/HashtagPage';
import NotificationsPage from './pages/NotificationsPage';
import PostRedirectPage from './pages/PostRedirectPage';
import EditProfilePage from './pages/EditProfilePage';
import CreateReelPage from './pages/CreateReelPage';
import StoryPage from './pages/StoryPage';
import AssetsHomePage from './assets_system/pages/AssetsHomePage';
import CreatorGemsPage from './assets_system/pages/CreatorGemsPage';
import InfluencerGiftsPage from './assets_system/pages/InfluencerGiftsPage';
import TrendingAssetsPage from './assets_system/pages/TrendingAssetsPage';
import MyAssetsPage from './assets_system/pages/MyAssetsPage';
import RewardsPage from './assets_system/pages/RewardsPage';
import { MOCK_USER } from './constants';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotificationsOptional } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import CallManager from './components/CallManager';

import { supabase } from './lib/supabase';

function Header({ darkMode, setDarkMode }: { darkMode: boolean; setDarkMode: (val: boolean) => void }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const notifCtx = useNotificationsOptional();
  const unreadNotifications = notifCtx?.unreadCount ?? 0;
  const isLive = location.pathname === '/live';

  const userAvatar = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.avatar || MOCK_USER.avatar;
  const avatarCacheKey = profile?.updated_at || profile?.avatar_url || '';
  const userAvatarSrc =
    typeof userAvatar === 'string' && userAvatar.startsWith('data:')
      ? userAvatar
      : `${userAvatar}${String(userAvatar).includes('?') ? '&' : '?'}t=${encodeURIComponent(String(avatarCacheKey))}`;

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
          .limit(5);

        if (error) throw error;
        let idMatch: any[] = [];
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          const { data: byId, error: byIdError } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', trimmedQuery)
            .limit(1);
          if (!byIdError) {
            idMatch = byId || [];
          }
        }

        const merged = [...(data || []), ...idMatch];
        const unique = merged.filter((row, idx, arr) => arr.findIndex((r) => r.id === row.id) === idx);
        setSearchResults(
          unique.map((row) => ({
            ...row,
            username: row.username || `user_${String(row.id).slice(0, 6)}`,
            display_name: row.display_name || 'User',
          }))
        );
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (isLive) return null;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 sm:h-16 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 z-50 flex items-center justify-between px-2 sm:px-4 lg:px-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-black text-xl sm:text-2xl">A</span>
            </div>
            <span className="text-lg sm:text-xl font-black tracking-tight hidden sm:block">AnleySpace</span>
          </div>
        </div>

        <div className="flex-1 mx-2 sm:mx-8 flex justify-center relative">
          <div className="relative w-full max-w-[140px] xs:max-w-[180px] sm:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Search..." 
              className="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-full py-1.5 sm:py-2 pl-8 sm:pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all text-[11px] sm:text-sm"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={12} />
              </button>
            )}

            {/* Search Results Dropdown */}
            <AnimatePresence>
              {showResults && (searchQuery.trim().length >= 2) && (
                <>
                  <div 
                    className="fixed inset-0 z-[-1]" 
                    onClick={() => setShowResults(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1c26] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-[60]"
                  >
                    {isSearching ? (
                      <div className="p-4 text-center text-gray-500 text-xs">Searching...</div>
                    ) : searchResults.length > 0 ? (
                      <div className="p-2">
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            onClick={() => {
                              navigate(`/profile/${result.id}`);
                              setShowResults(false);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors text-left"
                          >
                            <ResponsiveImage 
                              src={result.avatar_url || `https://picsum.photos/seed/${result.id}/100/100`} 
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full object-cover" 
                              alt="" 
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">@{result.username || `user_${String(result.id).slice(0, 6)}`}</p>
                              <p className="text-[10px] text-gray-500 truncate">{result.display_name || 'User'}</p>
                            </div>
                          </button>
                        ))}
                        <button 
                          onClick={() => {
                            navigate(`/explore?q=${searchQuery}`);
                            setShowResults(false);
                          }}
                          className="w-full p-2 text-center text-xs text-indigo-600 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors mt-1"
                        >
                          See all results for "{searchQuery}"
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-gray-500 text-xs">No users found</div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:flex items-center gap-1 mr-2">
            <HeaderIcon to="/" icon={<Home size={20} />} label="Home" />
            <HeaderIcon to="/explore" icon={<Compass size={20} />} label="Explore" />
            <HeaderIcon to="/reels" icon={<PlaySquare size={20} />} label="Reels" />
            <NavLink
              to="/notifications"
              title="Notifications"
              className={({ isActive }) =>
                cn(
                  'p-3 sm:p-2.5 rounded-xl transition-all relative group inline-flex items-center justify-center',
                  isActive
                    ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'
                )
              }
            >
              <Bell size={20} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold leading-none">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </NavLink>
          </div>
          
          <HeaderIcon to="/messages" icon={<MessageCircle size={20} className="sm:size-[22px]" />} label="Messages" />
          
          <NavLink to="/live" className="flex items-center gap-1 bg-red-500 text-white px-2.5 sm:px-4 py-1.5 rounded-full font-bold hover:bg-red-600 transition-colors text-[10px] sm:text-sm shadow-lg shadow-red-500/20">
            <Radio size={14} className="sm:size-[18px]" />
            <span className="hidden xs:inline sm:inline">Live</span>
          </NavLink>

          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="hidden sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <NavLink to={user?.id ? `/profile/${user.id}` : '/profile'} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-800 hover:border-indigo-500 transition-colors flex-shrink-0 cursor-pointer">
            <img src={userAvatarSrc} alt="Avatar" className="w-full h-full object-cover" />
          </NavLink>
        </div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-black p-6 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-xl">A</span>
                  </div>
                  <span className="text-xl font-bold tracking-tight">AnleySpace</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <Sidebar
                onClose={() => setIsMobileMenuOpen(false)}
                darkMode={darkMode}
                setDarkMode={setDarkMode}
                navAppearance="default"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function HeaderIcon({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink 
      to={to} 
      title={label}
      className={({ isActive }) => cn(
        "p-3 sm:p-2.5 rounded-xl transition-all relative group",
        isActive ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900"
      )}
    >
      {icon}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
    </NavLink>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </Router>
    </AuthProvider>
  );
}

function AppContent() {
  const location = useLocation();
  const { user } = useAuth();
  const isReels = location.pathname === '/reels';
  const isCreateReel = location.pathname === '/reels/create';
  const isHome = location.pathname === '/' && !isReels && !isCreateReel;
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/forgot-password' || location.pathname === '/reset-password';
  
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen font-sans overflow-x-hidden',
        isHome
          ? 'bg-[#F5F6FA] text-gray-900 flex flex-col min-h-[100dvh] h-[100dvh] overflow-hidden'
          : 'bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white'
      )}
    >
      <CallManager />
      {!isReels && !isCreateReel && <Header darkMode={darkMode} setDarkMode={setDarkMode} />}
      
      <div
        className={cn(
          'mx-auto flex',
          isReels || isCreateReel
            ? 'max-w-none p-0'
            : 'max-w-[1600px] pt-14 sm:pt-16 px-0 lg:px-6 pb-[72px] lg:pb-0',
          isHome
            ? 'flex-1 min-h-0 w-full gap-0 items-stretch overflow-hidden'
            : 'gap-6'
        )}
      >
          {!isReels && !isCreateReel && (
            <aside
              className={cn(
                'hidden lg:block w-72 flex-shrink-0',
                isHome
                  ? 'sticky top-14 sm:top-16 self-start h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden no-scrollbar py-4 pl-3 pr-2 rounded-r-2xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white shadow-xl shadow-black/10'
                  : 'sticky top-[72px] h-fit'
              )}
            >
              <Sidebar
                darkMode={darkMode}
                setDarkMode={setDarkMode}
                navAppearance={isHome ? 'darkColumn' : 'default'}
              />
            </aside>
          )}
          
          <main
            className={cn(
              'flex-1 min-w-0',
              isReels || isCreateReel
                ? 'p-0 min-h-[calc(100vh-56px)] sm:min-h-[calc(100vh-64px)]'
                : isHome
                  ? 'flex-1 min-h-0 h-full overflow-y-auto overflow-x-hidden home-feed-scroll bg-[#F5F6FA] px-3 sm:px-4 py-4 lg:py-6'
                  : 'min-h-[calc(100vh-56px)] sm:min-h-[calc(100vh-64px)] py-0 lg:py-6'
            )}
          >
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/explore" element={<ProtectedRoute><ExplorePage /></ProtectedRoute>} />
                <Route path="/reels" element={<ProtectedRoute><ReelsPage /></ProtectedRoute>} />
                <Route path="/reels/:id" element={<ProtectedRoute><ReelsPage /></ProtectedRoute>} />
                <Route path="/reels/create" element={<ProtectedRoute><CreateReelPage /></ProtectedRoute>} />
                <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
                <Route path="/assets" element={<ProtectedRoute><AssetsHomePage /></ProtectedRoute>} />
                <Route path="/assets/gems" element={<ProtectedRoute><CreatorGemsPage /></ProtectedRoute>} />
                <Route path="/assets/gifts" element={<ProtectedRoute><InfluencerGiftsPage /></ProtectedRoute>} />
                <Route path="/assets/trending" element={<ProtectedRoute><TrendingAssetsPage /></ProtectedRoute>} />
                <Route path="/assets/my-assets" element={<ProtectedRoute><MyAssetsPage /></ProtectedRoute>} />
                <Route path="/assets/rewards" element={<ProtectedRoute><RewardsPage /></ProtectedRoute>} />
                <Route path="/marketplace/product/:id" element={<ProtectedRoute><ProductDetailPage /></ProtectedRoute>} />
                <Route path="/friends" element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
                <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
                <Route path="/saved" element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/profile/:id" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/profile/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
                <Route path="/invite" element={<ProtectedRoute><InviteEarnPage /></ProtectedRoute>} />
                <Route path="/live" element={<ProtectedRoute><LivePage /></ProtectedRoute>} />
                <Route path="/gifts" element={<ProtectedRoute><GiftsPage /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                <Route path="/creator-tips" element={<ProtectedRoute><CreatorTipsPage /></ProtectedRoute>} />
                <Route path="/groups/:id" element={<ProtectedRoute><GroupDetailPage /></ProtectedRoute>} />
                <Route path="/groups/:id/chat" element={<ProtectedRoute><GroupChatPage /></ProtectedRoute>} />
                <Route path="/hashtag/:tag" element={<ProtectedRoute><HashtagPage /></ProtectedRoute>} />
                <Route path="/story/:id" element={<ProtectedRoute><StoryPage /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                <Route path="/post/:id" element={<ProtectedRoute><PostRedirectPage /></ProtectedRoute>} />
              </Routes>
            </AnimatePresence>
          </main>

          {!isReels && (
            <div className="hidden xl:block">
              <Routes>
                <Route path="/" element={<RightSidebar />} />
                <Route path="/explore" element={<RightSidebar />} />
                <Route path="*" element={null} />
              </Routes>
            </div>
          )}
        </div>
        <BottomNav isReels={isReels} isCreateReel={isCreateReel} />
      </div>
  );
}

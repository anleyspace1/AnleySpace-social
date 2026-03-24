import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Coins, Gift, TrendingUp, Briefcase, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { assetsApi, type AssetsOverview } from '../api';

const assetCards = [
  { title: 'Creator Gems', description: 'Buy and list creator gems.', icon: Coins, path: '/assets/gems' },
  { title: 'Influencer Gifts', description: 'Trade top creator gifts.', icon: Gift, path: '/assets/gifts' },
  { title: 'Trending Assets', description: 'Track growth and popularity.', icon: TrendingUp, path: '/assets/trending' },
  { title: 'My Assets', description: 'Manage holdings and transfers.', icon: Briefcase, path: '/assets/my-assets' },
  { title: 'Rewards', description: 'See points and unlock status.', icon: Trophy, path: '/assets/rewards' },
];

export default function AssetsHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || 'u1';
  const [overview, setOverview] = useState<AssetsOverview | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await assetsApi.getOverview(userId);
        if (alive) setOverview(data);
      } catch {
        if (alive) setOverview(null);
      }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [userId]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto pb-12 px-4 lg:px-0">
      <div className="pt-4 lg:pt-0 mb-8">
        <h1 className="text-3xl lg:text-4xl text-white font-bold tracking-tight">Assets</h1>
        <p className="text-sm text-gray-400 mt-1">Manage digital assets in one place.</p>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
          <p className="text-xs text-gray-400">Total Assets</p>
          <p className="text-2xl text-white font-bold">{Number(overview?.total_assets || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
          <p className="text-xs text-gray-400">Est. Value</p>
          <p className="text-2xl text-white font-bold">{Number(overview?.estimated_value || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
          <p className="text-xs text-gray-400">Active Listings</p>
          <p className="text-2xl text-white font-bold">{Number(overview?.listings_count || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
          <p className="text-xs text-gray-400">Reward Status</p>
          <p className="text-2xl text-white font-bold capitalize">{overview?.reward_status || 'locked'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {assetCards.map((card, idx) => (
          <motion.button
            key={card.title}
            type="button"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => navigate(card.path)}
            className="text-left bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center mb-4">
              <card.icon size={24} />
            </div>
            <h3 className="text-xl text-white font-bold mb-1">{card.title}</h3>
            <p className="text-sm text-gray-400">{card.description}</p>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

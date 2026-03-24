import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp } from 'lucide-react';
import { assetsApi, type TrendingAsset } from '../api';

export default function TrendingAssetsPage() {
  const [items, setItems] = useState<TrendingAsset[]>([]);

  useEffect(() => {
    const load = () => assetsApi.getTrending().then(setItems).catch(() => setItems([]));
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto pb-12 px-4 lg:px-0">
      <h1 className="text-3xl text-white font-bold tracking-tight mb-6">Trending Assets</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={`${item.asset_type}-${item.asset_id}`} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex items-center justify-between hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
            <div>
              <p className="text-white font-bold">{item.asset_name}</p>
              <p className="text-xs text-gray-400 uppercase">{item.asset_type}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Popularity: {Number(item.total_volume).toLocaleString()}</p>
              <p className="text-sm text-emerald-500 flex items-center gap-1 justify-end">
                <TrendingUp size={14} />
                {Number(item.growth_percent).toFixed(2)}%
              </p>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-sm text-gray-400 mt-4">
          No transactions yet. Trending data will appear as users trade assets.
        </div>
      )}
    </motion.div>
  );
}

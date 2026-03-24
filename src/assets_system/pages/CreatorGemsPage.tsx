import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Coins } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { assetsApi, type CreatorGem } from '../api';

export default function CreatorGemsPage() {
  const { user } = useAuth();
  const userId = user?.id || 'u1';
  const [gems, setGems] = useState<CreatorGem[]>([]);
  const [busyId, setBusyId] = useState<string>('');

  const load = async () => {
    setGems(await assetsApi.getGems());
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 7000);
    return () => clearInterval(timer);
  }, []);

  const runAction = async (fn: () => Promise<unknown>, id: string) => {
    try {
      setBusyId(id);
      await fn();
      await load();
    } finally {
      setBusyId('');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto pb-12 px-4 lg:px-0">
      <h1 className="text-3xl text-white font-bold tracking-tight mb-6">Creator Gems</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
        {gems.map((gem) => (
          <div key={gem.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
            <h3 className="text-lg text-white font-bold">{gem.name}</h3>
            <p className="text-sm text-gray-400 mb-4">@{gem.creator_id}</p>
            <div className="space-y-2 text-sm">
              <p className="font-semibold flex items-center gap-1"><Coins size={14} /> Price: {Number(gem.price).toLocaleString()}</p>
              <p>Supply: {Number(gem.supply).toLocaleString()}</p>
              <p>Listed: {Number(gem.listed_count).toLocaleString()}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busyId === gem.id}
                onClick={() => runAction(() => assetsApi.buyGem({ userId, gemId: gem.id, quantity: 1 }), gem.id)}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition flex-1 text-sm font-bold text-white disabled:opacity-60"
              >
                Buy
              </button>
              <button
                type="button"
                disabled={busyId === gem.id}
                onClick={() => runAction(() => assetsApi.listGem({ userId, gemId: gem.id, quantity: 1 }), gem.id)}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition flex-1 text-sm font-bold text-white disabled:opacity-60"
              >
                List for Sale
              </button>
            </div>
          </div>
        ))}
      </div>
      {gems.length === 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-sm text-gray-400">
          No gems available yet.
        </div>
      )}
    </motion.div>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { assetsApi, type InfluencerGift } from '../api';

export default function InfluencerGiftsPage() {
  const { user } = useAuth();
  const userId = user?.id || 'u1';
  const [gifts, setGifts] = useState<InfluencerGift[]>([]);
  const [busyId, setBusyId] = useState<string>('');

  const load = async () => {
    setGifts(await assetsApi.getGifts());
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 7000);
    return () => clearInterval(timer);
  }, []);

  const action = async (giftId: string, mode: 'buy' | 'resell') => {
    try {
      setBusyId(giftId + mode);
      if (mode === 'buy') {
        await assetsApi.buyGift({ userId, giftId, quantity: 1 });
      } else {
        await assetsApi.resellGift({ userId, giftId, quantity: 1, resalePrice: 50 });
      }
      await load();
    } finally {
      setBusyId('');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto pb-12 px-4 lg:px-0">
      <h1 className="text-3xl text-white font-bold tracking-tight mb-6">Influencer Gifts</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
        {gifts.map((gift) => (
          <div key={gift.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
            <h3 className="text-lg text-white font-bold">{gift.title}</h3>
            <p className="text-sm text-gray-400 mb-3">Creator: @{gift.creator_name}</p>
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Price: {Number(gift.price).toLocaleString()} Coins</p>
              <p>Earnings: {Number(gift.earnings_percent).toFixed(1)}%</p>
              <p>Available: {Number(gift.available_quantity).toLocaleString()}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busyId === gift.id + 'buy'}
                onClick={() => action(gift.id, 'buy')}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition flex-1 text-sm font-bold text-white disabled:opacity-60"
              >
                Buy Gift
              </button>
              <button
                type="button"
                disabled={busyId === gift.id + 'resell'}
                onClick={() => action(gift.id, 'resell')}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition flex-1 text-sm font-bold text-white disabled:opacity-60"
              >
                Resell Gift
              </button>
            </div>
          </div>
        ))}
      </div>
      {gifts.length === 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-sm text-gray-400">
          No gifts available yet.
        </div>
      )}
    </motion.div>
  );
}

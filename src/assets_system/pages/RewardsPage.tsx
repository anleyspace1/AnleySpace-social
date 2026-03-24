import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { assetsApi, type RewardState } from '../api';

export default function RewardsPage() {
  const { user } = useAuth();
  const userId = user?.id || 'u1';
  const [reward, setReward] = useState<RewardState | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = () => assetsApi.getRewards(userId).then(setReward).catch(() => setReward(null));

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [userId]);

  const onClaim = async () => {
    try {
      setClaiming(true);
      await assetsApi.claimRewards(userId);
      await load();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto pb-12 px-4 lg:px-0">
      <h1 className="text-3xl text-white font-bold tracking-tight mb-6">Rewards</h1>
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
        <p className="text-sm text-gray-400 mb-2">Points</p>
        <p className="text-4xl text-white font-bold">{Number(reward?.points || 0).toLocaleString()}</p>

        <div className="mt-6 space-y-2 text-sm">
          <p>
            Eligibility:{' '}
            <span className={`font-bold ${reward?.eligibility_status === 'unlocked' ? 'text-emerald-500' : 'text-amber-500'}`}>
              {reward?.eligibility_status || 'locked'}
            </span>
          </p>
          <p>Tier: <span className="font-bold">{reward?.current_tier || 'Bronze'}</span></p>
          <p>Estimated Reward: <span className="font-bold">{Number(reward?.estimated_reward || 0).toFixed(2)} Coins</span></p>
        </div>

        <div className="mt-5">
          <div className="w-full h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, Number(reward?.progress_percent || 0)))}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{Number(reward?.progress_percent || 0).toFixed(1)}% progress</p>
        </div>
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming || reward?.eligibility_status !== 'unlocked'}
          className="mt-5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-sm font-bold text-white disabled:opacity-60"
        >
          Claim Activity Reward
        </button>
        {!!reward?.logs?.length && (
          <div className="mt-6">
            <p className="text-sm font-bold mb-2">Reward Logs</p>
            <div className="space-y-2">
              {reward.logs.slice(0, 5).map((log) => (
                <div key={log.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 text-sm flex items-center justify-between">
                  <span>{new Date(log.created_at).toLocaleDateString()}</span>
                  <span className="font-bold">{Number(log.reward_amount).toFixed(0)} Coins</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

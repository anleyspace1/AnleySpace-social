import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, ArrowLeft, TrendingUp, Users, Heart, MessageCircle, Share2, Eye, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

const MOCK_STATS = {
  totalPosts: 124,
  totalViews: 45000,
  engagementRate: 8.5,
  likes: 12000,
  comments: 3500,
  shares: 1200,
  followersGained: 450,
};

export default function AnalyticsPage() {
  const navigate = useNavigate();

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl mx-auto p-4 md:p-8 pb-24"
    >
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">Posts & Views Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          icon={<LayoutGrid className="text-indigo-500" />} 
          label="Total Posts" 
          value={MOCK_STATS.totalPosts} 
          trend="+12 this month"
          color="indigo"
        />
        <StatCard 
          icon={<Eye className="text-emerald-500" />} 
          label="Total Views" 
          value={MOCK_STATS.totalViews} 
          trend="+15% vs last month"
          color="emerald"
        />
        <StatCard 
          icon={<TrendingUp className="text-purple-500" />} 
          label="Engagement Rate" 
          value={`${MOCK_STATS.engagementRate}%`} 
          trend="Above average"
          color="purple"
        />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-8 mb-8">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <BarChart3 size={20} className="text-indigo-500" />
          Engagement Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <EngagementStat icon={<Heart className="text-red-500" />} label="Likes" value={MOCK_STATS.likes} />
          <EngagementStat icon={<MessageCircle className="text-blue-500" />} label="Comments" value={MOCK_STATS.comments} />
          <EngagementStat icon={<Share2 className="text-indigo-500" />} label="Shares" value={MOCK_STATS.shares} />
          <EngagementStat icon={<Users className="text-purple-500" />} label="Followers" value={MOCK_STATS.followersGained} />
        </div>
      </div>

      <div className="bg-gradient-to-tr from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="text-xl font-bold mb-2">Grow your audience faster!</h4>
            <p className="text-indigo-100 text-sm opacity-80">Check out our creator tips to boost your engagement and reach more viewers.</p>
          </div>
          <button 
            onClick={() => navigate('/creator-tips')}
            className="bg-white text-indigo-600 px-8 py-3 rounded-2xl font-black hover:bg-indigo-50 transition-colors whitespace-nowrap"
          >
            View Creator Tips
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, trend, color }: { icon: React.ReactNode; label: string; value: string | number; trend: string; color: string }) {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  }[color as keyof typeof colorClasses];

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl hover:shadow-lg transition-shadow">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4", colorClasses)}>
        {icon}
      </div>
      <p className="text-gray-500 text-sm font-medium mb-1">{label}</p>
      <h4 className="text-3xl font-black mb-2">
        {typeof value === 'number' && value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value}
      </h4>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{trend}</p>
    </div>
  );
}

function EngagementStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-10 h-10 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center mb-3">
        {icon}
      </div>
      <h5 className="font-black text-lg">
        {value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value}
      </h5>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

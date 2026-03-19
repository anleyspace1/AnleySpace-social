import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Lightbulb, TrendingUp, Users, Zap, Star, Rocket, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CreatorTipsPage() {
  const navigate = useNavigate();

  const tips = [
    {
      icon: <Zap className="text-yellow-500" />,
      title: "Post Consistently",
      description: "Aim to post at least 3-5 times a week to keep your audience engaged and attract new followers."
    },
    {
      icon: <TrendingUp className="text-indigo-500" />,
      title: "Use Trending Sounds",
      description: "Incorporate popular music and sounds into your reels to increase the chances of appearing on the Explore page."
    },
    {
      icon: <Users className="text-emerald-500" />,
      title: "Engage with Comments",
      description: "Reply to your viewers' comments to build a community and encourage more interaction on your posts."
    },
    {
      icon: <Target className="text-red-500" />,
      title: "Niche Down",
      description: "Focus on a specific topic or style to attract a dedicated audience that shares your interests."
    },
    {
      icon: <Star className="text-purple-500" />,
      title: "High Quality Visuals",
      description: "Ensure your lighting is good and your camera is steady. High-quality content is more likely to be shared."
    },
    {
      icon: <Rocket className="text-blue-500" />,
      title: "Collaborate with Others",
      description: "Partner with other creators to cross-pollinate your audiences and reach new potential fans."
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-4 md:p-8 pb-24"
    >
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">Creator Tips & Tricks</h1>
      </div>

      <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white mb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
            <Lightbulb size={24} />
          </div>
          <h2 className="text-3xl font-black mb-4">Master the Art of Creation</h2>
          <p className="text-indigo-100 max-w-lg">
            Ready to take your content to the next level? Follow these expert tips to grow your presence on AnleySpace and build a loyal community.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tips.map((tip, index) => (
          <motion.div 
            key={index}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              {tip.icon}
            </div>
            <h3 className="text-lg font-bold mb-2">{tip.title}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
              {tip.description}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 p-8 bg-gray-100 dark:bg-gray-900 rounded-[2.5rem] text-center">
        <h3 className="text-xl font-bold mb-2">Need more help?</h3>
        <p className="text-gray-500 mb-6">Join our Creator Community Discord to chat with other creators and get direct support.</p>
        <button className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-colors">
          Join Creator Discord
        </button>
      </div>
    </motion.div>
  );
}

import React from 'react';
import { motion } from 'motion/react';
import { Gift, ArrowLeft, ChevronRight, User, Calendar, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MOCK_GIFTS = [
  { id: 1, sender: 'Alice', type: 'Diamond', value: 50, date: '2024-03-01', avatar: 'https://picsum.photos/seed/alice/100/100' },
  { id: 2, sender: 'Bob', type: 'Heart', value: 10, date: '2024-02-28', avatar: 'https://picsum.photos/seed/bob/100/100' },
  { id: 3, sender: 'Charlie', type: 'Rocket', value: 100, date: '2024-02-25', avatar: 'https://picsum.photos/seed/charlie/100/100' },
  { id: 4, sender: 'Diana', type: 'Star', value: 5, date: '2024-02-20', avatar: 'https://picsum.photos/seed/diana/100/100' },
];

export default function GiftsPage() {
  const navigate = useNavigate();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto p-4 md:p-8 pb-24"
    >
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">My Gifts</h1>
      </div>

      <div className="bg-gradient-to-tr from-orange-500 to-pink-600 rounded-3xl p-8 text-white mb-8 shadow-xl shadow-orange-500/20">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <Gift size={28} />
          </div>
          <div>
            <p className="text-orange-100 text-sm font-medium">Total Received</p>
            <h2 className="text-4xl font-black">{MOCK_GIFTS.length} Gifts</h2>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2 text-orange-100 text-sm">
          <Coins size={16} />
          <span>Total Value: {MOCK_GIFTS.reduce((acc, curr) => acc + curr.value, 0)} Coins</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-lg mb-4">Recent Gifts</h3>
        {MOCK_GIFTS.map((gift) => (
          <div 
            key={gift.id}
            className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 rounded-2xl flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-100 dark:border-gray-800">
                <img src={gift.avatar} alt={gift.sender} className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="font-bold text-sm">@{gift.sender}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                  <span className="flex items-center gap-1"><Calendar size={10} /> {gift.date}</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full" />
                  <span className="text-orange-500 font-bold">{gift.type}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-black text-indigo-600 dark:text-indigo-400">+{gift.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Coins</p>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
            </div>
          </div>
        ))}
      </div>

      {MOCK_GIFTS.length === 0 && (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            <Gift size={40} />
          </div>
          <p className="text-gray-500">No gifts received yet.</p>
        </div>
      )}
    </motion.div>
  );
}

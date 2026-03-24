import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, ListTodo, Plus, CheckCircle2, Circle, Trash2, Users, LayoutGrid, ShoppingBag, Bookmark } from 'lucide-react';
import { cn } from '../lib/utils';

export function PeopleYouMayKnow() {
  const navigate = useNavigate();
  const people = [
    { name: 'Jessica Brown', avatar: 'https://picsum.photos/seed/p1/100/100' },
    { name: 'Anthony Harris', avatar: 'https://picsum.photos/seed/p2/100/100' },
    { name: 'Olixja Martin', avatar: 'https://picsum.photos/seed/p3/100/100' },
  ];

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/20 hover:scale-[1.02] transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
      <h3 className="text-white font-bold text-sm mb-4">People You May Know</h3>
      <div className="space-y-4">
        {people.map((person) => (
          <div key={person.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate('/profile')}
                className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800 overflow-hidden hover:opacity-80 transition-opacity"
              >
                <img src={person.avatar} alt="" className="w-full h-full object-cover" />
              </button>
              <div className="flex flex-col">
                <span className="text-sm text-white font-bold leading-none mb-1">{person.name}</span>
                <span className="text-[10px] text-gray-400">Suggested for you</span>
              </div>
            </div>
            <button className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-xs font-bold text-white">Follow</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendingSection() {
  const trends = ['DanceOff', 'CookingHacks', 'VibeCheck', 'TechNews', 'TravelGoals'];
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/20 hover:scale-[1.02] transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-indigo-600" />
        <h3 className="text-white font-bold text-sm">Trending Now</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {trends.map((trend) => (
          <button key={trend} className="px-3 py-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-[10px] font-bold text-gray-400 hover:text-indigo-300 transition-all">
            #{trend}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SuggestedGroups() {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/20 hover:scale-[1.02] transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
      <h3 className="text-white font-bold text-sm mb-4">Suggested Groups</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">📸</div>
            <span className="text-sm text-white font-bold">Photographers</span>
          </div>
          <button className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-xs font-bold text-white">Join</button>
        </div>
      </div>
    </div>
  );
}

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
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">People You May Know</h3>
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
                <span className="text-sm font-bold leading-none mb-1">{person.name}</span>
                <span className="text-[10px] text-gray-500">Suggested for you</span>
              </div>
            </div>
            <button className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">Follow</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendingSection() {
  const trends = ['DanceOff', 'CookingHacks', 'VibeCheck', 'TechNews', 'TravelGoals'];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-indigo-600" />
        <h3 className="font-bold text-sm">Trending Now</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {trends.map((trend) => (
          <button key={trend} className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
            #{trend}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SuggestedGroups() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <h3 className="font-bold text-sm mb-4">Suggested Groups</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">📸</div>
            <span className="text-sm font-bold">Photographers</span>
          </div>
          <button className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold">Join</button>
        </div>
      </div>
    </div>
  );
}

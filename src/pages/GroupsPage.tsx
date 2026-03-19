import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Search, Globe, Lock, MoreHorizontal, MessageSquare, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_USER } from '../constants';

export default function GroupsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');
  const [activeTab, setActiveTab] = useState<'joined' | 'suggested'>('joined');
  const [joinedGroups, setJoinedGroups] = useState<any[]>([]);
  const [suggestedGroups, setSuggestedGroups] = useState<any[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchGroups = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [joinedRes, allRes] = await Promise.all([
        fetch(`/api/groups/joined/${user.id}`),
        fetch('/api/groups')
      ]);
      const joinedData = await joinedRes.json();
      const allData = await allRes.json();
      
      setJoinedGroups(joinedData);
      // Suggested are groups not joined
      const joinedIds = new Set(joinedData.map((g: any) => g.id));
      let filteredSuggested = allData.filter((g: any) => !joinedIds.has(g.id));
      
      if (categoryFilter) {
        filteredSuggested = filteredSuggested.filter((g: any) => g.category === categoryFilter);
      }
      
      setSuggestedGroups(filteredSuggested);
    } catch (err) {
      console.error("Error fetching groups:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGroups();
      // Sync users from Supabase to local DB
      fetch('/api/users/sync-all', { method: 'POST' })
        .then(res => res.json())
        .then(data => console.log('DEBUG: Sync-all result in GroupsPage:', data))
        .catch(err => console.error('DEBUG: Sync-all error in GroupsPage:', err));
    }
  }, [categoryFilter, user]);

  const handleJoinGroup = async (groupId: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/groups/${groupId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      if (res.ok) {
        fetchGroups();
      }
    } catch (err) {
      console.error("Error joining group:", err);
    }
  };

  const handleCreateGroup = async (groupData: any) => {
    if (!user) return;
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...groupData, creatorId: user.id })
      });
      if (res.ok) {
        setIsCreateModalOpen(false);
        fetchGroups();
      }
    } catch (err) {
      console.error("Error creating group:", err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="lg:max-w-5xl lg:mx-auto p-0 lg:p-6 pb-12"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-4 lg:px-0 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-black">Groups</h1>
          <p className="text-sm text-gray-500">Connect with people who share your interests</p>
        </div>
        <div className="flex items-center gap-3">
          {categoryFilter && (
            <button 
              onClick={() => setSearchParams({})}
              className="text-xs text-indigo-600 font-bold hover:underline"
            >
              Clear Filter: {categoryFilter}
            </button>
          )}
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 flex items-center gap-2 hover:bg-indigo-700 transition-all"
          >
            <Plus size={18} />
            Create Group
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Content */}
        <div className="flex-1 space-y-6">
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 lg:px-0">
            <TabButton active={activeTab === 'joined'} onClick={() => setActiveTab('joined')} label="Your Groups" />
            <TabButton active={activeTab === 'suggested'} onClick={() => setActiveTab('suggested')} label="Discover" />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 lg:gap-6">
              {activeTab === 'joined' && joinedGroups.map(group => (
                <GroupCard key={group.id} group={group} joined />
              ))}
              {activeTab === 'suggested' && suggestedGroups.map(group => (
                <GroupCard key={group.id} group={group} onJoin={() => handleJoinGroup(group.id)} />
              ))}
              {activeTab === 'joined' && joinedGroups.length === 0 && (
                <div className="col-span-2 py-12 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
                  <Users size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">You haven't joined any groups yet.</p>
                  <button onClick={() => setActiveTab('suggested')} className="text-indigo-600 font-bold mt-2">Discover Groups</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-full md:w-72 space-y-6">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-none lg:rounded-2xl border-b lg:border border-gray-100 dark:border-gray-800 shadow-sm">
            <h3 className="font-bold text-sm mb-4">Categories</h3>
            <div className="space-y-2">
              {['Technology', 'Sports', 'Art', 'Business', 'Education'].map(cat => (
                <button 
                  key={cat} 
                  onClick={() => {
                    setSearchParams({ category: cat });
                    setActiveTab('suggested');
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-xl text-sm transition-all",
                    categoryFilter === cat 
                      ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 font-bold" 
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateGroupModal 
            onClose={() => setIsCreateModalOpen(false)}
            onConfirm={handleCreateGroup}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CreateGroupModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (data: any) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'Public' | 'Private'>('Public');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Create New Group</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Group Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter group name"
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 px-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
              rows={3}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 px-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Privacy</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setType('Public')}
                className={cn(
                  "py-3 rounded-2xl font-bold border flex items-center justify-center gap-2 transition-all",
                  type === 'Public' ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700"
                )}
              >
                <Globe size={18} />
                Public
              </button>
              <button 
                onClick={() => setType('Private')}
                className={cn(
                  "py-3 rounded-2xl font-bold border flex items-center justify-center gap-2 transition-all",
                  type === 'Private' ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700"
                )}
              >
                <Lock size={18} />
                Private
              </button>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!name.trim()}
            onClick={() => onConfirm({ name, description, type })}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
          >
            Create Group
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
        active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-white dark:bg-gray-900 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800"
      )}
    >
      {label}
    </button>
  );
}

interface GroupCardProps {
  key?: React.Key;
  group: any;
  joined?: boolean;
  onJoin?: () => void;
}

function GroupCard({ group, joined, onJoin }: GroupCardProps) {
  const navigate = useNavigate();

  return (
    <div 
      onClick={() => joined && navigate(`/groups/${group.id}/chat`)}
      className={cn(
        "bg-white dark:bg-gray-900 rounded-none lg:rounded-2xl border-b lg:border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm group",
        joined && "cursor-pointer hover:border-indigo-500 transition-colors"
      )}
    >
      <div className="h-32 relative">
        <img src={group.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-2 right-2">
          <button className="p-1.5 bg-black/50 text-white rounded-full backdrop-blur-sm">
            <MoreHorizontal size={16} />
          </button>
        </div>
        {joined && (
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl text-white">
              <MessageSquare size={24} />
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-sm mb-1">{group.name}</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-4">
          <span className="flex items-center gap-1">
            {group.type === 'Public' ? <Globe size={12} /> : <Lock size={12} />}
            {group.type} Group
          </span>
          <span>•</span>
          <span>{group.members || '0'} members</span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (joined) {
              navigate(`/groups/${group.id}`);
            } else if (onJoin) {
              onJoin();
            }
          }}
          className={cn(
            "w-full py-2 rounded-xl text-xs font-bold transition-all",
            joined 
              ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/40" 
              : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/20"
          )}
        >
          {joined ? 'Open Chat' : 'Join Group'}
        </button>
      </div>
    </div>
  );
}

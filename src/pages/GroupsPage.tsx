import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Search, Globe, Lock, MoreHorizontal, MessageSquare, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_USER } from '../constants';
import { supabase } from '../lib/supabase';

/** Prefer JWT user id from Supabase Auth so group_members.user_id matches RLS and .eq('user_id', ...) filters. */
async function resolveAuthUserId(fallback: { id?: string } | null): Promise<string | null> {
  const { data: authData, error } = await supabase.auth.getUser();
  if (error) console.warn('[GroupsPage] getUser', error);
  let id = authData?.user?.id ?? fallback?.id ?? null;
  if (!id) {
    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) console.warn('[GroupsPage] getSession', sessErr);
    id = sessData?.session?.user?.id ?? null;
  }
  if (id) return String(id).trim();
  return null;
}

function mergeUniqueGroupsById(...lists: (any[] | undefined)[]): any[] {
  const map = new Map<string, any>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const g of list) {
      if (g?.id) map.set(String(g.id), g);
    }
  }
  return Array.from(map.values());
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function resolveGroupUuid(group: any): string | null {
  const candidates = [group?.id, group?.group_id, group?.uuid];
  for (const c of candidates) {
    if (isUuid(c)) return c.trim();
  }
  return null;
}

/**
 * Persist group + admin membership in Supabase from the client.
 * RLS requires `auth.uid() = creator_id` — creator_id MUST match the JWT user id (see migration).
 * Production (Vercel): ensure session is loaded/refreshed so the anon client sends Authorization.
 */
async function insertGroupAndMembershipInSupabase(opts: {
  id: string;
  name: string;
  description: string;
  image: string;
  userId: string;
}): Promise<{ error: string | null }> {
  const uidFromCaller = String(opts.userId ?? '').trim();
  if (!uidFromCaller) {
    console.error('[GroupsPage] insertGroupAndMembershipInSupabase: refused — empty userId');
    return { error: 'Missing user id for group insert.' };
  }

  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
    if (refErr) console.warn('[GroupsPage] refreshSession', refErr);
    session = refreshed.session ?? null;
  }
  const creatorId = session?.user?.id ? String(session.user.id).trim() : '';
  if (!creatorId) {
    console.error('[GroupsPage] insertGroupAndMembershipInSupabase: no Supabase session — RLS insert will fail');
    return {
      error:
        'Your session could not be verified with Supabase. Try signing out and back in, then create the group again.',
    };
  }
  if (creatorId !== uidFromCaller) {
    console.error('[GroupsPage] creator_id mismatch (session vs caller)', { creatorId, uidFromCaller });
    return { error: 'Account session mismatch. Please sign in again.' };
  }

  const rowCore = {
    id: opts.id,
    name: opts.name,
    description: opts.description ?? '',
    image: opts.image,
    creator_id: creatorId,
  };

  // Prefer insert without optional `user_id` so WITH CHECK (auth.uid() = creator_id) is the only gate.
  let { error: gErr } = await supabase.from('groups').insert(rowCore);
  if (gErr) {
    const msg = String(gErr.message || '');
    const isSchemaUserId =
      /user_id|42703|does not exist|schema cache|column/i.test(msg) && /user_id/i.test(msg);
    if (isSchemaUserId) {
      ({ error: gErr } = await supabase.from('groups').insert({ ...rowCore, user_id: creatorId }));
    }
  }
  const gCode = (gErr as { code?: string } | undefined)?.code;
  if (gErr && gCode === '23505') {
    const { error: upErr } = await supabase.from('groups').upsert(rowCore, { onConflict: 'id' });
    if (upErr) console.error('[GroupsPage] groups upsert (after duplicate):', upErr);
    if (upErr) {
      return { error: upErr.message || 'Could not save group to Supabase.' };
    }
  } else if (gErr) {
    console.error('[GroupsPage] groups insert:', gErr);
    const rlsHint =
      /row-level security|RLS|42501|policy/i.test(String(gErr.message))
        ? ' If this is production, confirm RLS policy allows INSERT when creator_id = auth.uid(), and that creator_id type matches auth.uid().'
        : '';
    return { error: (gErr.message || 'Could not create group in Supabase.') + rlsHint };
  }

  const { error: mErr } = await supabase.from('group_members').insert({
    group_id: opts.id,
    user_id: creatorId,
    role: 'admin',
  });
  const mCode = (mErr as { code?: string } | undefined)?.code;
  if (mErr && mCode === '23505') {
    const { error: muErr } = await supabase
      .from('group_members')
      .upsert(
        { group_id: opts.id, user_id: creatorId, role: 'admin' },
        { onConflict: 'group_id,user_id' }
      );
    if (muErr) console.error('[GroupsPage] group_members upsert:', muErr);
    if (muErr) return { error: muErr.message || 'Could not add group membership.' };
  } else if (mErr) {
    console.error('[GroupsPage] group_members insert:', mErr);
    return { error: mErr.message || 'Could not add group membership.' };
  }

  const { data: memCheck, error: memCheckErr } = await supabase
    .from('group_members')
    .select('group_id, user_id, role')
    .eq('group_id', opts.id)
    .eq('user_id', creatorId)
    .maybeSingle();
  if (memCheckErr) {
    console.error('[GroupsPage] group_members post-insert verify:', memCheckErr);
  } else if (!memCheck?.user_id) {
    const { error: fixErr } = await supabase
      .from('group_members')
      .update({ user_id: creatorId })
      .eq('group_id', opts.id)
      .is('user_id', null);
    if (fixErr) console.error('[GroupsPage] group_members repair user_id failed:', fixErr);
    else console.log('[GroupsPage] group_members repaired NULL user_id for group', opts.id);
  }

  return { error: null };
}

export default function GroupsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');
  const [activeTab, setActiveTab] = useState<'joined' | 'suggested'>('joined');
  const [joinedGroups, setJoinedGroups] = useState<any[]>([]);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [suggestedGroups, setSuggestedGroups] = useState<any[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchGroups = async () => {
    const uid = await resolveAuthUserId(user);
    if (!uid) {
      console.warn('[GroupsPage] fetchGroups skipped: no auth user id');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const discoverRes = await supabase
        .from('groups')
        .select(`
          *,
          group_members ( user_id )
        `)
        .order('created_at', { ascending: false });

      if (discoverRes.error) {
        console.error('[GroupsPage] discover groups select error:', discoverRes.error);
      }
      console.log('GROUP WITH MEMBERS:', discoverRes.data);
      const allData = Array.isArray(discoverRes.data) ? discoverRes.data : [];
      const mappedAllGroups = await Promise.all(
        allData.map(async (group: any) => {
          const members = Array.isArray(group?.group_members) ? group.group_members : [];
          let membersCount = members.length || 0;

          if (membersCount === 0 && group?.id) {
            const { count, error: countError } = await supabase
              .from('group_members')
              .select('*', { count: 'exact', head: true })
              .eq('group_id', group.id);
            if (countError) {
              console.warn('[GroupsPage] group_members fallback count query failed (check SELECT RLS):', countError);
            } else {
              membersCount = count || 0;
            }
          }

          const joined = members.some((m: any) => String(m?.user_id || '') === uid);
          return {
            ...group,
            id: resolveGroupUuid(group) || group?.id,
            name: group?.name || 'Untitled Group',
            description: group?.description || '',
            type: group?.type || 'Public',
            members: membersCount,
            members_count: membersCount,
            isJoined: joined,
            image:
              (typeof group?.image === 'string' && group.image.trim()) ||
              `https://picsum.photos/seed/${group?.id || 'group'}/400/200`,
          };
        })
      );
      let groups = mappedAllGroups.filter((g: any) => g.isJoined);
      console.log('[GroupsPage] fetchGroups result', {
        userId: uid,
        joinedCount: Array.isArray(groups) ? groups.length : 0,
        allCount: mappedAllGroups.length,
        joinedIds: Array.isArray(groups) ? groups.map((g: any) => g.id) : []
      });
      
      setJoinedGroups(groups);
      setJoinedGroupIds(
        new Set(
          (Array.isArray(groups) ? groups : [])
            .map((g: any) => resolveGroupUuid(g))
            .filter(Boolean) as string[]
        )
      );
      // Suggested are groups not joined
      let filteredSuggested = mappedAllGroups.filter((g: any) => !g.isJoined);
      
      if (categoryFilter) {
        filteredSuggested = filteredSuggested.filter((g: any) => g.category === categoryFilter);
      }
      
      setSuggestedGroups(filteredSuggested);
      return { joinedData: groups, allData };
    } catch (err) {
      console.error("Error fetching groups:", err);
      return { joinedData: [], allData: [] };
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [categoryFilter, user]);

  const handleJoinGroup = async (group: any) => {
    const uid = await resolveAuthUserId(user);
    if (!uid) return;
    const groupId = resolveGroupUuid(group);
    if (!groupId) {
      console.error('[GroupsPage] join group: missing UUID group.id', group);
      return;
    }
    try {
      const { error } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: uid,
        role: 'member',
      });
      const code = (error as { code?: string } | undefined)?.code;
      if (error && code !== '23505') {
        console.error('[GroupsPage] join group_members insert:', error);
        return;
      }
      console.log('JOIN GROUP ID:', groupId);
      setJoinedGroupIds((prev) => new Set([...prev, groupId]));
      setJoinedGroups((prev) => {
        const exists = prev.some((g: any) => resolveGroupUuid(g) === groupId);
        if (exists) return prev;
        return [
          {
            ...group,
            members: Number(group?.members || group?.members_count || 0) + 1,
            members_count: Number(group?.members_count || group?.members || 0) + 1,
          },
          ...prev,
        ];
      });
      setSuggestedGroups((prev) =>
        prev
          .map((g: any) => {
            if (resolveGroupUuid(g) !== groupId) return g;
            return {
              ...g,
              members: Number(g?.members || g?.members_count || 0) + 1,
              members_count: Number(g?.members_count || g?.members || 0) + 1,
            };
          })
          .filter((g: any) => resolveGroupUuid(g) !== groupId)
      );
      await fetchGroups();
    } catch (err) {
      console.error('Error joining group:', err);
    }
  };

  const handleCreateGroup = async (groupData: any) => {
    const memberUserId = await resolveAuthUserId(user);
    if (!memberUserId) {
      console.error('[GroupsPage] create group: no auth user id', user);
      setCreateError('You must be signed in to create a group.');
      return;
    }
    setCreateError(null);
    try {
      const newId = crypto.randomUUID();
      const imageUrl = `https://picsum.photos/seed/${newId}/400/200`;
      const { error: supabaseErr } = await insertGroupAndMembershipInSupabase({
        id: newId,
        name: groupData.name?.trim() || 'New Group',
        description: groupData.description ?? '',
        image: imageUrl,
        userId: memberUserId,
      });
      if (supabaseErr) {
        setCreateError(supabaseErr);
        console.error('[GroupsPage] group create failed:', supabaseErr);
        return;
      }

      const createdGroupId = newId;
      const created = {
        id: newId,
        name: groupData.name,
        description: groupData.description,
        type: groupData.type,
        image: imageUrl,
      };

      setIsCreateModalOpen(false);
      const refreshed = await fetchGroups();
      const refreshedJoined = Array.isArray(refreshed?.joinedData) ? refreshed.joinedData : [];
      const hasCreatedInJoined = createdGroupId
        ? refreshedJoined.some((g: any) => String(g?.id) === createdGroupId)
        : false;
      console.log('[GroupsPage] post-create joined verification', {
        groupId: createdGroupId,
        hasCreatedInJoined,
      });
      if (createdGroupId && !hasCreatedInJoined) {
        const fallbackGroup = {
          id: createdGroupId,
          name: (created.name as string) || groupData?.name || 'New Group',
          description: (created.description as string) || groupData?.description || '',
          image: imageUrl,
          type: (created.type as string) || groupData?.type || 'Public',
          creator_id: memberUserId,
        };
        setJoinedGroups((prev) => {
          if (prev.some((g: any) => String(g?.id) === createdGroupId)) return prev;
          return [fallbackGroup, ...prev];
        });
        setSuggestedGroups((prev) => prev.filter((g: any) => String(g?.id) !== createdGroupId));
        console.warn('[GroupsPage] created group missing from joined list; injected locally', {
          groupId: createdGroupId,
        });
      }
    } catch (err) {
      console.error('Error creating group:', err);
      setCreateError('Unexpected error creating group.');
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
            onClick={() => { setCreateError(null); setIsCreateModalOpen(true); }}
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
                <GroupCard
                  key={group.id}
                  group={group}
                  joined={Boolean(resolveGroupUuid(group) && joinedGroupIds.has(resolveGroupUuid(group)!))}
                  onJoin={() => handleJoinGroup(group)}
                />
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
            error={createError}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CreateGroupModal({
  onClose,
  onConfirm,
  error,
}: {
  onClose: () => void;
  onConfirm: (data: any) => void;
  error?: string | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'Public' | 'Private'>('Public');
  const [pending, setPending] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setPending(true);
    await onConfirm({ name, description, type });
    setPending(false);
  };

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
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 px-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-gray-900 dark:text-white caret-indigo-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              disabled={pending}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
              rows={3}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-4 px-4 focus:ring-2 focus:ring-indigo-500 transition-all font-bold resize-none text-gray-900 dark:text-white caret-indigo-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              disabled={pending}
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
                disabled={pending}
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
                disabled={pending}
              >
                <Lock size={18} />
                Private
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-xl px-3 py-2 text-xs font-bold mb-1">
              {error}
            </div>
          )}

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!name.trim() || pending}
            onClick={handleSubmit}
            className="w-full bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
          >
            {pending ? 'Creating...' : 'Create Group'}
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

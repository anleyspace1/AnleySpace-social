import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Gift, ArrowLeft, ChevronRight, User, Calendar, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiOrigin';
import { getBearerAuthHeaders } from '../lib/supabaseAuthHeaders';
import { subscribeMonetizationRefresh } from '../lib/monetizationRealtime';

type GiftRow = {
  id: string;
  post_id?: string;
  sender_id: string;
  creator_id: string;
  coins: number;
  gift_type?: string | null;
  created_at: string;
};

type GiftItem = {
  id: string;
  coins: number;
  sender: {
    username: string;
    avatar_url: string;
  };
  createdAt: string;
};

function giftTypeFromCoins(coins: number): string {
  if (coins >= 100) return 'Rocket';
  if (coins >= 50) return 'Diamond';
  if (coins >= 10) return 'Heart';
  return 'Star';
}

export default function GiftsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReceivedGifts = useCallback(async () => {
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    const sessionUserId = sessionUser?.id ?? null;
    const effectiveUserId = sessionUserId || user?.id || null;
    if (!effectiveUserId) {
      setGifts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const uid = String(effectiveUserId);
    if (import.meta.env.DEV) {
      console.log('[Gifts] currentUser.id:', user?.id);
      console.log('[Gifts] sessionUser.id:', sessionUser?.id);
      console.log('[Gifts] effectiveUserId (query):', uid);
    }

    let rawRows: GiftRow[] = [];
    let loadedViaApi = false;
    const headers = await getBearerAuthHeaders();
    if (headers) {
      try {
        const res = await fetch(apiUrl('/api/monetization/gifts/received'), { headers });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          gifts?: GiftRow[];
          error?: string;
        };
        if (res.ok && j.ok === true && Array.isArray(j.gifts)) {
          rawRows = j.gifts;
          loadedViaApi = true;
          if (import.meta.env.DEV) {
            console.log('[Gifts] load source: api', 'before map raw count:', rawRows.length);
            if (rawRows[0]) {
              console.log('[Gifts] sample row post_id:', rawRows[0].post_id, 'creator_id:', rawRows[0].creator_id);
            }
          }
        } else if (import.meta.env.DEV) {
          console.warn('[Gifts] api /gifts/received failed, falling back to Supabase', res.status, j?.error);
        }
      } catch (e) {
        console.warn('[Gifts] api /gifts/received network error, falling back to Supabase', e);
      }
    }

    if (!loadedViaApi) {
      const { data, error } = await supabase
        .from('gift_transactions')
        .select('id, post_id, sender_id, creator_id, coins, gift_type, created_at')
        .eq('creator_id', uid)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        console.warn('[GiftsPage] failed to load gift_transactions', error);
        setLoading(false);
        return;
      }
      rawRows = (data || []) as GiftRow[];
      if (import.meta.env.DEV) {
        console.log('[Gifts] load source: supabase direct', 'before map raw count:', rawRows.length);
      }
    }

    const rows = rawRows.filter(
      (r) => r.sender_id && String(r.creator_id) === uid
    );
    if (import.meta.env.DEV && rawRows.length > 0 && rows.length === 0) {
      console.warn('[Gifts] rows dropped by filter (sender_id / creator_id mismatch)', {
        rawFirst: rawRows[0],
        uid,
      });
    }
    const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
    let senderMap: Record<string, { username?: string | null; avatar_url?: string | null }> = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds);
      senderMap = (senders || []).reduce((acc, cur) => {
        acc[String(cur.id)] = { username: cur.username, avatar_url: cur.avatar_url };
        return acc;
      }, {} as Record<string, { username?: string | null; avatar_url?: string | null }>);
    }

    const mapped = rows.map((r) => {
      const senderProfile = senderMap[r.sender_id];
      const senderName = String(senderProfile?.username || `user_${r.sender_id.slice(0, 6)}`);
      const value = Math.max(0, Math.floor(Number(r.coins) || 0));
      const type = String(r.gift_type || '').trim() || giftTypeFromCoins(value);
      void type;
      return {
        id: r.id,
        coins: value,
        sender: {
          username: senderName,
          avatar_url: String(senderProfile?.avatar_url || `https://picsum.photos/seed/${r.sender_id}/100/100`),
        },
        createdAt: r.created_at,
      };
    });
    if (import.meta.env.DEV) {
      const totalCoins = mapped.reduce((a, c) => a + c.coins, 0);
      console.log('[Gifts] total count:', mapped.length, 'total coins:', totalCoins);
    }
    setGifts(mapped);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadReceivedGifts();
  }, [loadReceivedGifts]);

  useEffect(() => {
    return subscribeMonetizationRefresh(() => void loadReceivedGifts());
  }, [loadReceivedGifts]);

  useEffect(() => {
    if (!user?.id) return () => {};
    const channel = supabase
      .channel(`my-gifts-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gift_transactions',
          filter: `creator_id=eq.${String(user.id)}`,
        },
        () => void loadReceivedGifts()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadReceivedGifts, user?.id]);

  const totalValue = useMemo(() => gifts.reduce((acc, curr) => acc + curr.coins, 0), [gifts]);

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
            <h2 className="text-4xl font-black">{gifts.length} Gifts</h2>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2 text-orange-100 text-sm">
          <Coins size={16} />
          <span>Total Value: {totalValue} Coins</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-lg mb-4">Recent Gifts</h3>
        {gifts.map((gift) => (
          <div 
            key={gift.id}
            className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 rounded-2xl flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-100 dark:border-gray-800">
                <img
                  src={gift.sender.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-bold text-sm">@{gift.sender.username}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar size={10} /> {new Date(gift.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right max-w-[220px]">
                <p className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                  {gift.sender.username} voye {gift.coins} Tip
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
            </div>
          </div>
        ))}
      </div>

      {!loading && gifts.length === 0 && (
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

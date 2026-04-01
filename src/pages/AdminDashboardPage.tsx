import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiOrigin';
import { getBearerAuthHeaders } from '../lib/supabaseAuthHeaders';
import { supabase } from '../lib/supabase';
import { boostPostAction, BOOST_COST } from '../lib/boostPost';

type WithdrawRequest = {
  id: string;
  user_id: string;
  coins: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  payment_method: string;
  payment_details: string;
  created_at: string;
};

type SupportMessage = {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type ModerationUser = {
  id: string;
  username: string | null;
  is_banned: boolean | null;
};

type AdminPost = {
  id: string;
  user_id: string;
  content: string | null;
  created_at: string;
};

type ReportItem = {
  id: string;
  post_id: string | null;
  reporter_id: string | null;
  reason: string | null;
  created_at: string;
};

type AdItem = {
  id: string;
  user_id: string | null;
  title: string | null;
  clicks: number | null;
  impressions: number | null;
  is_active: boolean | null;
  status: 'pending' | 'approved' | 'rejected' | string | null;
  target_country: string | null;
  target_interest: string | null;
  target_min_age: number | null;
  target_max_age: number | null;
};

type AdminTopPost = {
  id: string;
  user_id: string | null;
  views: number | null;
};

type TopEarningUser = {
  user_id: string;
  username: string | null;
  coins_earned: number;
  monetization_disabled: boolean;
};

type SuspiciousPost = {
  post_id: string;
  reports_count: number;
  user_id: string | null;
};

const ADMIN_EMAIL = 'anleyspace@gmail.com';

function statusBadgeClass(status: string): string {
  if (status === 'approved') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  }
  if (status === 'rejected') {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  }
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
}

export default function AdminDashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  console.log('AUTH USER:', user);
  console.log('ADMIN CHECK:', profile);
  console.log('ADMIN PROFILE:', profile);
  const role = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : '';
  const isAdmin = role === 'admin' || user?.email === ADMIN_EMAIL;
  const waitingProfile = !!user && !profile;
  const [requests, setRequests] = useState<WithdrawRequest[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [moderationUsers, setModerationUsers] = useState<ModerationUser[]>([]);
  const [adminPosts, setAdminPosts] = useState<AdminPost[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    totalViews: 0,
    activeToday: 0,
    topPosts: [] as AdminTopPost[],
    newUsersToday: 0,
    totalRevenue: 0,
    totalCreatorPayouts: 0,
    totalValidViews: 0,
    topEarningUsers: [] as TopEarningUser[],
    totalLikes: 0,
    totalComments: 0,
    adsSummary: {
      totalAds: 0,
      activeAds: 0,
      totalClicks: 0,
      totalImpressions: 0,
      avgCtrPct: 0,
    },
    suspiciousPosts: [] as SuspiciousPost[],
    platformWalletCoins: 0,
    platformRevenueUsd: 0,
    todayRevenueCoins: 0,
    todayRevenueUsd: 0,
    netProfitCoins: 0,
    netProfitUsd: 0,
    totalPayoutsCost: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const withdrawStats = useMemo(() => {
    if (!requests) return null;
    const total = requests.length;
    const pending = requests.filter((r) => r.status === 'pending').length;
    const approved = requests.filter((r) => r.status === 'approved').length;
    const rejected = requests.filter((r) => r.status === 'rejected').length;
    const totalCoinsRequested = requests.reduce((sum, r) => sum + (Number(r.coins) || 0), 0);
    return { total, pending, approved, rejected, totalCoinsRequested };
  }, [requests]);

  const loadRequests = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const headers = await getBearerAuthHeaders();
      if (!headers) throw new Error('Missing auth session');
      const res = await fetch(apiUrl('/api/admin/withdraw-requests'), { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load requests');
      setRequests(Array.isArray(body) ? body : []);
    } catch (err: any) {
      alert(err?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile) return;
    void (async () => {
      async function fetchStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { count: usersCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        const { count: postsCount } = await supabase
          .from('posts')
          .select('*', { count: 'exact', head: true });

        const { data: posts } = await supabase
          .from('posts')
          .select('view_count, views, valid_views');

        let totalViews = 0;
        let totalValidViews = 0;
        (posts || []).forEach((p) => {
          const row = p as { view_count?: number | null; views?: number | null; valid_views?: number | null };
          totalViews += Number(row.view_count || row.views || 0) || 0;
          totalValidViews += Number(row.valid_views || 0) || 0;
        });
        console.log('ADMIN VIEWS DEBUG:', (posts || []).slice(0, 5));

        const { count: activeToday } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('last_active_at', today.toISOString());

        const { count: newUsersToday } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', today.toISOString());

        const { data: topPosts } = await supabase
          .from('posts')
          .select('id, user_id, views')
          .order('views', { ascending: false })
          .limit(5);

        const { data: revenueData } = await supabase
          .from('withdraw_requests')
          .select('amount, coins, status');
        const totalRevenue = (revenueData || [])
          .filter((r: { status?: string | null }) => String(r.status || '').toLowerCase() === 'approved')
          .reduce(
            (sum, r: { amount?: number | null; coins?: number | null }) =>
              sum + Number(r.amount ?? r.coins ?? 0),
            0
          );

        const [{ count: likesCount }, { count: commentsCount }] = await Promise.all([
          supabase.from('likes').select('*', { count: 'exact', head: true }),
          supabase.from('comments').select('*', { count: 'exact', head: true }),
        ]);

        const { data: creatorDailyRows } = await supabase
          .from('creator_daily_view_earnings')
          .select('user_id, coins');
        const totalCreatorPayouts = (creatorDailyRows || []).reduce(
          (sum, r) => sum + Number((r as { coins?: number | null }).coins || 0),
          0
        );
        const byUser = new Map<string, number>();
        (creatorDailyRows || []).forEach((r: { user_id?: string | null; coins?: number | null }) => {
          const uid = String(r.user_id || '').trim();
          if (!uid) return;
          byUser.set(uid, (byUser.get(uid) || 0) + Number(r.coins || 0));
        });
        const rankedUsers = [...byUser.entries()]
          .map(([user_id, coins_earned]) => ({ user_id, coins_earned }))
          .sort((a, b) => b.coins_earned - a.coins_earned)
          .slice(0, 5);
        let topEarningUsers: TopEarningUser[] = rankedUsers.map((x) => ({
          user_id: x.user_id,
          username: null,
          coins_earned: x.coins_earned,
          monetization_disabled: false,
        }));
        if (rankedUsers.length > 0) {
          const ids = rankedUsers.map((x) => x.user_id);
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, username, monetization_disabled')
            .in('id', ids);
          const userMap = new Map((profs || []).map((p: any) => [String(p.id), p]));
          topEarningUsers = rankedUsers.map((x) => ({
            user_id: x.user_id,
            username: String((userMap.get(x.user_id) as { username?: string | null } | undefined)?.username || '').trim() || null,
            coins_earned: x.coins_earned,
            monetization_disabled: !!(userMap.get(x.user_id) as { monetization_disabled?: boolean | null } | undefined)
              ?.monetization_disabled,
          }));
        }

        const totalLikes = likesCount || 0;
        const totalComments = commentsCount || 0;

        const { data: pwData, error: pwErr } = await supabase
          .from('platform_wallet')
          .select('coins')
          .limit(1)
          .maybeSingle();
        const platformWalletCoins = pwErr
          ? 0
          : Number((pwData as { coins?: number | null } | null)?.coins ?? 0) || 0;
        console.log('PLATFORM WALLET:', platformWalletCoins);

        const usd = platformWalletCoins / 100;
        console.log('PLATFORM REVENUE USD:', usd);

        const { data: todayTx } = await supabase
          .from('transactions')
          .select('amount, created_at, type')
          .gte('created_at', today.toISOString())
          .eq('type', 'spend');

        const todayRevenueCoins = (todayTx || []).reduce(
          (sum, tx) => sum + Number((tx as { amount?: number | null }).amount || 0),
          0
        );
        const todayRevenueUSD = todayRevenueCoins / 100;
        console.log('DAILY REVENUE:', {
          coins: todayRevenueCoins,
          usd: todayRevenueUSD,
        });

        const { data: payouts } = await supabase.from('creator_daily_view_earnings').select('coins');
        const totalPayouts = (payouts || []).reduce(
          (sum, p) => sum + Number((p as { coins?: number | null }).coins || 0),
          0
        );

        const netCoins = platformWalletCoins - totalPayouts;
        const netUSD = netCoins / 100;
        console.log('PROFIT:', {
          revenue: platformWalletCoins,
          payouts: totalPayouts,
          net: netCoins,
          usd: netUSD,
        });

        setStats((prev) => ({
          totalUsers: usersCount || 0,
          totalPosts: postsCount || 0,
          totalViews,
          activeToday: activeToday || 0,
          topPosts: (topPosts || []) as AdminTopPost[],
          newUsersToday: newUsersToday || 0,
          totalRevenue,
          totalCreatorPayouts,
          totalValidViews,
          topEarningUsers,
          totalLikes,
          totalComments,
          platformWalletCoins,
          platformRevenueUsd: usd,
          todayRevenueCoins,
          todayRevenueUsd: todayRevenueUSD,
          netProfitCoins: netCoins,
          netProfitUsd: netUSD,
          totalPayoutsCost: totalPayouts,
          adsSummary: prev.adsSummary,
          suspiciousPosts: prev.suspiciousPosts,
        }));

        console.log('ADMIN STATS:', {
          usersCount,
          postsCount,
          totalViews,
        });
        console.log('ADMIN ACTIVITY:', {
          activeToday,
          topPosts,
        });
        console.log('ADMIN GROWTH:', {
          newUsersToday,
          totalRevenue,
        });
        console.log('CREATOR STATS:', {
          total_creator_payouts: totalCreatorPayouts,
          total_valid_views: totalValidViews,
          top_earning_users: topEarningUsers,
        });
      }

      await fetchStats();
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false });
      console.log('SUPPORT FETCH:', data, error);
      if (error) {
        console.error('SUPPORT FETCH ERROR:', error);
        setSupportMessages([]);
        return;
      }
      setSupportMessages(Array.isArray(data) ? (data as SupportMessage[]) : []);
    })();
  }, [isAdmin, profile]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile) return;
    void (async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('id, post_id, reporter_id, reason, created_at')
        .order('created_at', { ascending: false });
      console.log('REPORTS FETCH:', data, error);
      if (error) {
        setReports([]);
        return;
      }
      setReports(Array.isArray(data) ? (data as ReportItem[]) : []);
    })();
  }, [isAdmin, profile]);

  useEffect(() => {
    const adsSummary = (() => {
      const totalAds = ads.length;
      const activeAds = ads.filter((a) => !!a.is_active).length;
      const totalClicks = ads.reduce((sum, a) => sum + Number(a.clicks || 0), 0);
      const totalImpressions = ads.reduce((sum, a) => sum + Number(a.impressions || 0), 0);
      const avgCtrPct = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      return { totalAds, activeAds, totalClicks, totalImpressions, avgCtrPct };
    })();

    const reportsByPost = new Map<string, number>();
    reports.forEach((r) => {
      const pid = String(r.post_id || '').trim();
      if (!pid) return;
      reportsByPost.set(pid, (reportsByPost.get(pid) || 0) + 1);
    });
    const suspiciousPosts = [...reportsByPost.entries()]
      .filter(([, count]) => count >= 2)
      .map(([post_id, reports_count]) => ({
        post_id,
        reports_count,
        user_id: adminPosts.find((p) => p.id === post_id)?.user_id || null,
      }))
      .sort((a, b) => b.reports_count - a.reports_count)
      .slice(0, 10);

    setStats((prev) => ({ ...prev, adsSummary, suspiciousPosts }));
  }, [ads, reports]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile) return;
    void (async () => {
      const { data, error } = await supabase
        .from('ads')
        .select('id, user_id, title, clicks, impressions, is_active, status, target_country, target_interest, target_min_age, target_max_age')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('ADS FETCH ERROR:', error);
        setAds([]);
        return;
      }
      setAds(Array.isArray(data) ? (data as AdItem[]) : []);
    })();
  }, [isAdmin, profile]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile) return;
    void (async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, user_id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        console.error('ADMIN POSTS FETCH ERROR:', error);
        setAdminPosts([]);
        return;
      }
      setAdminPosts(Array.isArray(data) ? (data as AdminPost[]) : []);
    })();
  }, [isAdmin, profile]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!profile) return;
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, is_banned')
        .limit(100);
      if (error) {
        console.error('MODERATION USERS FETCH ERROR:', error);
        setModerationUsers([]);
        return;
      }
      setModerationUsers(Array.isArray(data) ? (data as ModerationUser[]) : []);
    })();
  }, [isAdmin, profile]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.email || user.email !== ADMIN_EMAIL) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      console.log('AUTH USER:', authUser);
      if (!authUser) return;

      const { data: profileBefore, error: beforeError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      console.log('ADMIN PROFILE BEFORE:', profileBefore, beforeError);
      if (beforeError || !profileBefore) return;

      if (String(profileBefore.role || '').trim().toLowerCase() !== 'admin') {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', authUser.id);
        if (updateError) {
          console.error('ADMIN ROLE UPDATE ERROR:', updateError);
        }
      }

      const { data: updatedProfile, error: afterError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      console.log('ADMIN PROFILE AFTER:', updatedProfile, afterError);
    })();
  }, [authLoading, user?.id, user?.email]);

  const handleAction = async (request: WithdrawRequest, action: 'approve' | 'reject') => {
    if (request.status !== 'pending') return;
    try {
      setBusyId(request.id);
      const headers = await getBearerAuthHeaders();
      if (!headers) throw new Error('Missing auth session');
      const res = await fetch(apiUrl(`/api/admin/withdraw-requests/${request.id}/${action}`), {
        method: 'POST',
        headers,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed to ${action} request`);
      alert(action === 'approve' ? 'Withdraw approved' : 'Withdraw rejected and refunded');
      await loadRequests();
    } catch (err: any) {
      alert(err?.message || `Failed to ${action} request`);
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdrawStatusUpdate = async (
    request: WithdrawRequest,
    nextStatus: 'approved' | 'rejected'
  ) => {
    try {
      setBusyId(request.id);
      if (nextStatus === 'rejected') {
        const headers = await getBearerAuthHeaders();
        if (!headers) throw new Error('Missing auth session');
        const res = await fetch(apiUrl(`/api/admin/withdraw-requests/${request.id}/reject`), {
          method: 'POST',
          headers,
        });
        const body = await res.json().catch(() => null);
        console.log('REJECT FLOW:', { status: res.status, ok: res.ok, body });
        if (!res.ok) {
          throw new Error((body && (body as { error?: string }).error) || 'Failed to reject withdraw request');
        }
        await loadRequests();
        return;
      }

      const { data, error } = await supabase
        .from('withdraw_requests')
        .update({ status: nextStatus })
        .eq('id', request.id)
        .select('*');
      console.log('WITHDRAW UPDATE:', data, error);
      if (error) throw error;

      const notifMessage =
        nextStatus === 'approved'
          ? 'Your withdraw has been approved'
          : 'Your withdraw was rejected';
      const { data: notifData, error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: request.user_id,
          type: 'system',
          message: notifMessage,
        })
        .select('*');
      console.log('NOTIFICATION INSERT:', notifData, notifError);

      await loadRequests();
    } catch (err: any) {
      alert(err?.message || 'Failed to update withdraw request');
    } finally {
      setBusyId(null);
    }
  };

  const handleBanToggle = async (targetUserId: string, nextBanned: boolean) => {
    console.log('ADMIN ACTION:', {
      action: 'ban_user',
      adminId: user?.id,
      targetUserId: targetUserId,
    });
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_banned: nextBanned })
      .eq('id', targetUserId)
      .select('id, username, is_banned');
    console.log('BAN UPDATE:', data, error);
    if (error) {
      alert(error.message || 'Failed to update user ban status');
      return;
    }
    setModerationUsers((prev) =>
      prev.map((u) => (u.id === targetUserId ? { ...u, is_banned: nextBanned } : u))
    );
  };

  const handleAdminDeletePost = async (postId: string) => {
    console.log('ADMIN ACTION:', {
      action: 'delete_post',
      adminId: user?.id,
      postId: postId,
    });
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .select('*');
    console.log('ADMIN DELETE POST:', data, error);
    if (error) {
      alert(error.message || 'Failed to delete post');
      return;
    }
    setAdminPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleAdToggle = async (adId: string, nextActive: boolean) => {
    console.log('ADMIN ACTION:', {
      action: 'toggle_ad',
      adminId: user?.id,
      adId: adId,
      isActive: nextActive,
    });
    const { data, error } = await supabase
      .from('ads')
      .update({ is_active: nextActive })
      .eq('id', adId)
      .select('id, user_id, title, clicks, impressions, is_active, status, target_country, target_interest, target_min_age, target_max_age')
      .maybeSingle();
    if (error) {
      alert(error.message || 'Failed to update ad');
      return;
    }
    setAds((prev) =>
      prev.map((a) =>
        a.id === adId
          ? ((data as AdItem | null) || { ...a, is_active: nextActive })
          : a
      )
    );
  };

  const handleAdReview = async (adId: string, nextStatus: 'approved' | 'rejected') => {
    const patch =
      nextStatus === 'approved'
        ? { status: 'approved', is_active: true }
        : { status: 'rejected', is_active: false };
    const { data, error } = await supabase
      .from('ads')
      .update(patch)
      .eq('id', adId)
      .select('id, user_id, title, clicks, impressions, is_active, status, target_country, target_interest, target_min_age, target_max_age')
      .maybeSingle();
    if (error) {
      alert(error.message || 'Failed to update ad review status');
      return;
    }
    setAds((prev) =>
      prev.map((a) =>
        a.id === adId
          ? ((data as AdItem | null) || { ...a, ...patch })
          : a
      )
    );
  };

  const handleDeleteAd = async (adId: string) => {
    const { error } = await supabase
      .from('ads')
      .delete()
      .eq('id', adId);
    if (error) {
      alert(error.message || 'Failed to delete ad');
      return;
    }
    setAds((prev) => prev.filter((a) => a.id !== adId));
  };

  const handleToggleCreatorMonetization = async (targetUserId: string, nextDisabled: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ monetization_disabled: nextDisabled })
      .eq('id', targetUserId);
    if (error) {
      alert(error.message || 'Failed to update monetization status');
      return;
    }
    setStats((prev) => ({
      ...prev,
      topEarningUsers: prev.topEarningUsers.map((u) =>
        u.user_id === targetUserId ? { ...u, monetization_disabled: nextDisabled } : u
      ),
    }));
  };

  const handleBoostTopPost = async (postId: string) => {
    if (!user?.id) {
      alert('Please login first');
      return;
    }
    const res = await boostPostAction(postId, user.id);
    if (!res.ok) {
      alert(res.message || 'Boost failed');
      return;
    }
    alert(`Post boosted (${BOOST_COST} coins)`);
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (ads.length === 0) return;
    void (async () => {
      const candidates = ads.filter((a) => {
        const clicks = Number(a.clicks || 0);
        const impressions = Number(a.impressions || 0);
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        return impressions > 100 && ctr < 1 && !!a.is_active;
      });
      if (candidates.length === 0) return;
      for (const ad of candidates) {
        await supabase.from('ads').update({ is_active: false }).eq('id', ad.id);
      }
      setAds((prev) =>
        prev.map((a) => (candidates.some((c) => c.id === a.id) ? { ...a, is_active: false } : a))
      );
    })();
  }, [isAdmin, ads]);

  if (authLoading || waitingProfile) return null;
  if (!isAdmin) return <div className="p-6 text-red-500">Access denied</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-black">Admin Dashboard</h1>
        <Link to="/admin/withdraws" className="text-sm font-bold text-indigo-400 hover:text-indigo-300">
          Withdraw-only page
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-bold mb-3">Platform Stats</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-gray-300">Users</p>
            <p className="text-2xl font-black">{stats.totalUsers}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-gray-300">Posts</p>
            <p className="text-2xl font-black">{stats.totalPosts}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-gray-300">
              Views:{' '}
              <span className="text-2xl font-black text-white">{stats.totalViews.toLocaleString()}</span>
            </p>
            <p className="text-sm text-gray-300 mt-2">
              Valid Views:{' '}
              <span className="text-xl font-black text-white">{stats.totalValidViews.toLocaleString()}</span>
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-xs text-amber-200/90">Platform earnings (coins)</p>
            <p className="text-2xl font-black text-amber-100">{stats.platformWalletCoins.toLocaleString()}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <h3 className="text-sm font-bold text-emerald-100/95 mb-2">Platform Revenue</h3>
            <p className="text-sm text-gray-200">
              Coins: <span className="font-black text-white">{stats.platformWalletCoins.toLocaleString()}</span>
            </p>
            <p className="text-sm text-gray-200 mt-1">
              USD:{' '}
              <span className="font-black text-emerald-200">
                $
                {stats.platformRevenueUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-4">
            <h3 className="text-sm font-bold text-sky-100/95 mb-2">Today Revenue</h3>
            <p className="text-sm text-gray-200">
              Coins: <span className="font-black text-white">{stats.todayRevenueCoins.toLocaleString()}</span>
            </p>
            <p className="text-sm text-gray-200 mt-1">
              USD:{' '}
              <span className="font-black text-sky-200">
                $
                {stats.todayRevenueUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
          <h3 className="text-sm font-bold text-violet-100/95 mb-3">Profit</h3>
          <div className="space-y-1.5 text-sm text-gray-200">
            <p>
              Revenue:{' '}
              <span className="font-black text-white">{stats.platformWalletCoins.toLocaleString()}</span>
            </p>
            <p>
              Payouts:{' '}
              <span className="font-black text-white">{stats.totalPayoutsCost.toLocaleString()}</span>
            </p>
            <p>
              Net:{' '}
              <span className="font-black text-white">{stats.netProfitCoins.toLocaleString()}</span>
            </p>
            <p>
              USD:{' '}
              <span className="font-black text-violet-200">
                $
                {stats.netProfitUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Activity</h3>
          <p className="text-sm text-gray-300">Active today: <span className="font-black text-white">{stats.activeToday}</span></p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Top Posts</h3>
          {stats.topPosts.length === 0 ? (
            <p className="text-sm text-gray-300">No top posts found</p>
          ) : (
            <div className="space-y-2">
              {stats.topPosts.map((post) => (
                <div key={post.id} className="text-sm border border-white/10 rounded-lg p-2">
                  <div className="text-gray-300">Post: {post.id}</div>
                  <div className="font-bold">Views: {Number(post.views || 0)}</div>
                  <button
                    type="button"
                    onClick={() => void handleBoostTopPost(post.id)}
                    className="mt-2 px-2 py-1 rounded bg-indigo-600 text-white font-bold text-xs"
                  >
                    Boost Post
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Growth</h3>
          <p className="text-sm text-gray-300">
            New users today: <span className="font-black text-white">{stats.newUsersToday}</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Revenue</h3>
          <p className="text-sm text-gray-300">
            Total earned: <span className="font-black text-white">${stats.totalRevenue}</span>
          </p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Creator Earnings</h3>
          <p className="text-sm text-gray-300">
            Total creator payouts: <span className="font-black text-white">{stats.totalCreatorPayouts}</span>
          </p>
          <p className="text-sm text-gray-300 mt-1">
            Total valid views: <span className="font-black text-white">{stats.totalValidViews}</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Top Earning Users</h3>
          {stats.topEarningUsers.length === 0 ? (
            <p className="text-sm text-gray-300">No creator earnings yet</p>
          ) : (
            <div className="space-y-2">
              {stats.topEarningUsers.map((u) => (
                <div key={u.user_id} className="text-sm border border-white/10 rounded-lg p-2">
                  <div className="text-gray-300">{u.username || u.user_id}</div>
                  <div className="font-bold">Coins earned: {u.coins_earned}</div>
                  <button
                    type="button"
                    onClick={() => void handleToggleCreatorMonetization(u.user_id, !u.monetization_disabled)}
                    className={`mt-2 px-2 py-1 rounded text-white font-bold text-xs ${
                      u.monetization_disabled ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {u.monetization_disabled ? 'Enable monetization' : 'Disable monetization'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Engagement</h3>
          <p className="text-sm text-gray-300">
            Total likes: <span className="font-black text-white">{stats.totalLikes}</span>
          </p>
          <p className="text-sm text-gray-300 mt-1">
            Total comments: <span className="font-black text-white">{stats.totalComments}</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold mb-2">Ads Performance Summary</h3>
          <p className="text-sm text-gray-300">Ads: <span className="font-black text-white">{stats.adsSummary.totalAds}</span></p>
          <p className="text-sm text-gray-300">Active ads: <span className="font-black text-white">{stats.adsSummary.activeAds}</span></p>
          <p className="text-sm text-gray-300">Clicks: <span className="font-black text-white">{stats.adsSummary.totalClicks}</span></p>
          <p className="text-sm text-gray-300">Impressions: <span className="font-black text-white">{stats.adsSummary.totalImpressions}</span></p>
          <p className="text-sm text-gray-300">Avg CTR: <span className="font-black text-white">{stats.adsSummary.avgCtrPct.toFixed(2)}%</span></p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-white/10 bg-black/20 p-4">
        <h3 className="text-base font-bold mb-2">Suspicious Posts (simple filter)</h3>
        {stats.suspiciousPosts.length === 0 ? (
          <p className="text-sm text-gray-300">No suspicious posts found</p>
        ) : (
          <div className="space-y-2">
            {stats.suspiciousPosts.map((sp) => (
              <div key={sp.post_id} className="text-sm border border-white/10 rounded-lg p-2">
                <div className="text-gray-300">Post: {sp.post_id}</div>
                <div className="font-bold">Reports: {sp.reports_count}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAdminDeletePost(sp.post_id)}
                    className="px-2 py-1 rounded bg-red-600 text-white font-bold text-xs"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={!sp.user_id}
                    onClick={() => sp.user_id && void handleBanToggle(sp.user_id, true)}
                    className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-xs disabled:opacity-50"
                  >
                    Ban User
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 p-4 shadow-lg">
          <p className="text-xs text-indigo-100">Total Requests</p>
          <p className="text-3xl font-black">{withdrawStats?.total ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 p-4 shadow-lg">
          <p className="text-xs text-yellow-100">Pending</p>
          <p className="text-3xl font-black">{withdrawStats?.pending ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 p-4 shadow-lg">
          <p className="text-xs text-green-100">Approved</p>
          <p className="text-3xl font-black">{withdrawStats?.approved ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-rose-600 to-red-700 p-4 shadow-lg">
          <p className="text-xs text-rose-100">Rejected</p>
          <p className="text-3xl font-black">{withdrawStats?.rejected ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-700 p-4 shadow-lg">
          <p className="text-xs text-purple-100">Total Coins Requested</p>
          <p className="text-3xl font-black">{withdrawStats?.totalCoinsRequested ?? 0}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">user_id</th>
              <th className="text-left p-3 font-bold">coins</th>
              <th className="text-left p-3 font-bold">payment_method</th>
              <th className="text-left p-3 font-bold">payment_details</th>
              <th className="text-left p-3 font-bold">status</th>
              <th className="text-left p-3 font-bold">created_at</th>
              <th className="text-left p-3 font-bold">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-300">Loading...</td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-300">No withdraw requests found</td>
              </tr>
            ) : (
              requests.map((request) => {
                const pending = request.status === 'pending';
                const disabled = !pending || busyId === request.id;
                return (
                  <tr key={request.id} className="border-t border-white/10">
                    <td className="p-3">{request.user_id}</td>
                    <td className="p-3">{request.coins}</td>
                    <td className="p-3">{request.payment_method}</td>
                    <td className="p-3">{request.payment_details}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusBadgeClass(request.status)}`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="p-3">{new Date(request.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleWithdrawStatusUpdate(request, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-green-600 disabled:bg-gray-600 text-white font-bold"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleWithdrawStatusUpdate(request, 'rejected')}
                          className="px-3 py-1.5 rounded-lg bg-red-600 disabled:bg-gray-600 text-white font-bold"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <div className="p-3 font-bold">Support Messages</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">user_id</th>
              <th className="text-left p-3 font-bold">message</th>
              <th className="text-left p-3 font-bold">created_at</th>
            </tr>
          </thead>
          <tbody>
            {supportMessages.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-gray-300">No support messages found</td>
              </tr>
            ) : (
              supportMessages.map((m) => (
                <tr key={m.id} className="border-t border-white/10">
                  <td className="p-3">{m.user_id}</td>
                  <td className="p-3">{m.message}</td>
                  <td className="p-3">{new Date(m.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <div className="p-3 font-bold">User Moderation</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">user_id</th>
              <th className="text-left p-3 font-bold">username</th>
              <th className="text-left p-3 font-bold">is_banned</th>
              <th className="text-left p-3 font-bold">actions</th>
            </tr>
          </thead>
          <tbody>
            {moderationUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-300">No users found</td>
              </tr>
            ) : (
              moderationUsers.map((u) => {
                const banned = !!u.is_banned;
                return (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="p-3">{u.id}</td>
                    <td className="p-3">{u.username || '-'}</td>
                    <td className="p-3">{String(banned)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void handleBanToggle(u.id, !banned)}
                        className={`px-3 py-1.5 rounded-lg text-white font-bold ${banned ? 'bg-emerald-600' : 'bg-red-600'}`}
                      >
                        {banned ? 'Unban' : 'Ban'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <div className="p-3 font-bold">Posts Moderation</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">post_id</th>
              <th className="text-left p-3 font-bold">user_id</th>
              <th className="text-left p-3 font-bold">content</th>
              <th className="text-left p-3 font-bold">created_at</th>
              <th className="text-left p-3 font-bold">actions</th>
            </tr>
          </thead>
          <tbody>
            {adminPosts.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-300">No posts found</td>
              </tr>
            ) : (
              adminPosts.map((post) => (
                <tr key={post.id} className="border-t border-white/10">
                  <td className="p-3">{post.id}</td>
                  <td className="p-3">{post.user_id}</td>
                  <td className="p-3">{post.content || '-'}</td>
                  <td className="p-3">{new Date(post.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => void handleAdminDeletePost(post.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold"
                    >
                      Delete Post
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <div className="p-3 font-bold">Reports</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">post_id</th>
              <th className="text-left p-3 font-bold">reporter_id</th>
              <th className="text-left p-3 font-bold">reason</th>
              <th className="text-left p-3 font-bold">created_at</th>
              <th className="text-left p-3 font-bold">actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-300">No reports found</td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="p-3">{r.post_id || '-'}</td>
                  <td className="p-3">{r.reporter_id || '-'}</td>
                  <td className="p-3">{r.reason || '-'}</td>
                  <td className="p-3">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!r.post_id}
                        onClick={() => r.post_id && void handleAdminDeletePost(r.post_id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold disabled:opacity-50"
                      >
                        Delete Post
                      </button>
                      <button
                        type="button"
                        disabled={!r.reporter_id}
                        onClick={() => r.reporter_id && void handleBanToggle(r.reporter_id, true)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold disabled:opacity-50"
                      >
                        Ban User
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <div className="p-3 font-bold">Ads Management</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">user_id</th>
              <th className="text-left p-3 font-bold">title</th>
              <th className="text-left p-3 font-bold">clicks</th>
              <th className="text-left p-3 font-bold">impressions</th>
              <th className="text-left p-3 font-bold">CTR %</th>
              <th className="text-left p-3 font-bold">active</th>
              <th className="text-left p-3 font-bold">status</th>
              <th className="text-left p-3 font-bold">target_country</th>
              <th className="text-left p-3 font-bold">target_interest</th>
              <th className="text-left p-3 font-bold">age_range</th>
              <th className="text-left p-3 font-bold">actions</th>
            </tr>
          </thead>
          <tbody>
            {ads.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-6 text-center text-gray-300">No ads found</td>
              </tr>
            ) : (
              ads.map((ad) => {
                const active = !!ad.is_active;
                const status = String(ad.status || 'pending');
                const clicks = Number(ad.clicks || 0);
                const impressions = Number(ad.impressions || 0);
                const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                console.log('ADS ANALYTICS:', { clicks, impressions });
                return (
                  <tr key={ad.id} className="border-t border-white/10">
                    <td className="p-3">{ad.user_id || '-'}</td>
                    <td className="p-3">{ad.title || 'Sponsored'}</td>
                    <td className="p-3">{clicks}</td>
                    <td className="p-3">{impressions}</td>
                    <td className="p-3">{ctr.toFixed(2)}%</td>
                    <td className="p-3">{active ? 'true' : 'false'}</td>
                    <td className="p-3">{status}</td>
                    <td className="p-3">{ad.target_country || '-'}</td>
                    <td className="p-3">{ad.target_interest || '-'}</td>
                    <td className="p-3">
                      {ad.target_min_age != null || ad.target_max_age != null
                        ? `${ad.target_min_age ?? '-'}-${ad.target_max_age ?? '-'}`
                        : '-'}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAdReview(ad.id, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-green-600 text-white font-bold"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdReview(ad.id, 'rejected')}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdToggle(ad.id, !active)}
                          className={`px-3 py-1.5 rounded-lg text-white font-bold ${active ? 'bg-yellow-600' : 'bg-green-600'}`}
                        >
                          {active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAd(ad.id)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


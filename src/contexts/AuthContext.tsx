import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, invalidateSessionCache } from '../lib/supabase';
import { apiUrl, fetchFeedApiSafe, shouldSkipOptionalExpressUserSync } from '../lib/apiOrigin';
import { loadPersonalizationFromSupabase } from '../lib/personalizedRanking';
import { incrementCoins } from '../lib/coinsWallet';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const applyDailyStreakReward = async (userId: string) => {
    try {
      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayIso = todayDate.toISOString().slice(0, 10);
      const yesterdayIso = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: row } = await supabase
        .from('profiles')
        .select('streak_count, last_login_date')
        .eq('id', userId)
        .maybeSingle();

      const lastDate = String((row as { last_login_date?: string | null } | null)?.last_login_date || '').slice(0, 10);
      if (lastDate === todayIso) return;

      const prevStreak = Number((row as { streak_count?: number | null } | null)?.streak_count || 0);
      const nextStreak = lastDate === yesterdayIso ? prevStreak + 1 : 1;
      const coinsToAward = nextStreak >= 7 ? 10 : 2;

      await supabase
        .from('profiles')
        .update({ streak_count: nextStreak, last_login_date: todayIso })
        .eq('id', userId);
      await incrementCoins(userId, coinsToAward);
      console.log('VIRAL EVENT:', { event: 'daily_streak', userId, streak: nextStreak, coins: coinsToAward });
    } catch (e) {
      console.warn('daily streak reward failed:', e);
    }
  };

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const deriveUsername = (u: User) => {
    const fromMeta = String(u.user_metadata?.username || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (fromMeta) return fromMeta;
    const fromEmail = String(u.email || '').split('@')[0]?.trim().toLowerCase().replace(/\s+/g, '_');
    if (fromEmail) return fromEmail;
    return `user_${u.id.slice(0, 6)}`;
  };

  const ensureProfileExists = async (u: User) => {
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, avatar_url')
        .eq('id', u.id)
        .maybeSingle();

      // Preserve real username when it already exists; never persist empty / whitespace-only.
      const emailLocal =
        String(u.email || '')
          .split('@')[0]
          ?.trim()
          .toLowerCase()
          .replace(/\s+/g, '_') || '';
      let username = String(existingProfile?.username ?? '').trim();
      if (!username) username = deriveUsername(u).trim();
      if (!username && emailLocal) username = emailLocal;
      if (!username) username = `user_${u.id.slice(0, 6)}`;
      const displayName =
        (existingProfile?.display_name ||
          existingProfile?.full_name ||
          String(u.user_metadata?.full_name || u.user_metadata?.display_name || '').trim()) || null;
      const avatarUrl =
        existingProfile?.avatar_url || String(u.user_metadata?.avatar_url || '').trim() || null;
      const inviteCode = String(u.id).slice(0, 8).toUpperCase();

      console.log('USERNAME SOURCE:', username);
      console.log('PROFILE UPSERT DATA (ensureProfileExists):', {
        id: u.id,
        full_name: displayName,
        display_name: displayName,
        username,
        sourceNote: 'full_name/display_name from existing row or auth user_metadata',
      });
      console.log('PROFILE INSERT DATA (ensureProfileExists upsert):', {
        id: u.id,
        username,
        email: u.email,
      });
      if (!username) {
        console.warn('USERNAME IS EMPTY OR NULL (ensureProfileExists)');
      }

      const { data: ensureProfileData, error: ensureProfileErr } = await supabase
        .from('profiles')
        .upsert(
          {
            id: u.id,
            username,
            display_name: displayName,
            full_name: displayName,
            avatar_url: avatarUrl,
            invite_code: inviteCode,
          },
          { onConflict: 'id' }
        )
        .select('id, username')
        .maybeSingle();

      console.log('PROFILE INSERT RESULT (ensureProfileExists):', {
        data: ensureProfileData,
        error: ensureProfileErr,
      });
    } catch (err) {
      console.warn('ensureProfileExists failed:', err);
    }
  };

  const tryApplyInviteFromStorage = async (profileRow: Record<string, unknown>, userId: string) => {
    if (typeof window === 'undefined') return profileRow;
    const raw = localStorage.getItem('invite_code');
    const inviteCode = raw ? String(raw).trim().toUpperCase() : '';
    if (!inviteCode || !profileRow || profileRow.referred_by) {
      return profileRow;
    }

    console.log('APPLYING INVITE CODE:', inviteCode);

    const { data: inviter, error: inviterErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (inviterErr) {
      console.warn('[invite] inviter lookup error:', inviterErr.message);
      return profileRow;
    }

    const inviterId = String((inviter as { id?: string } | null)?.id || '').trim();
    if (!inviterId) {
      return profileRow;
    }
    if (inviterId === userId) {
      localStorage.removeItem('invite_code');
      return profileRow;
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ referred_by: inviterId })
      .eq('id', userId);

    if (updateErr) {
      console.warn('[invite] referred_by update failed:', updateErr.message);
      return profileRow;
    }

    console.log('REFERRAL LINKED SUCCESS:', {
      newUserId: userId,
      inviterId,
    });
    localStorage.removeItem('invite_code');

    const { data: refreshed } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    return refreshed || { ...profileRow, referred_by: inviterId };
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error && !String(error.message || '').toLowerCase().includes('no rows')) {
        console.warn('Error fetching profile:', error.message);
        return;
      }
      let profileRow = data;
      if (!profileRow) {
        const { data: authUserData } = await supabase.auth.getUser();
        if (authUserData?.user) {
          await ensureProfileExists(authUserData.user);
          const { data: ensuredProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          profileRow = ensuredProfile;
        }
      }
      if (!profileRow) return;

      if (!(profileRow as { username?: string | null }).username) {
        console.warn('USERNAME MISSING:', profileRow.id);
      }

      profileRow = (await tryApplyInviteFromStorage(
        profileRow as Record<string, unknown>,
        userId
      )) as typeof profileRow;

      if (profileRow?.is_banned) {
        alert('Your account has been banned');
        await supabase.auth.signOut();
        window.location.href = '/login';
        return;
      }
      console.log('PROFILE LOADED:', profileRow);
      console.log('DISPLAY NAME:', {
        full_name: profileRow.full_name,
        display_name: profileRow.display_name,
        username: profileRow.username,
      });
      setProfile(profileRow);
      console.log('REFERRAL LINKED:', {
        newUserId: profileRow.id,
        referredBy: (profileRow as { referred_by?: string | null }).referred_by ?? null,
      });

      // Optional Express / local SQLite sync — skip when API host is cross-origin in prod (avoids CORS noise on Vercel)
      if (!shouldSkipOptionalExpressUserSync()) {
        try {
          console.log(`AUTH: Syncing profile for ${profileRow.username} (${profileRow.id}) to local DB`);
          const syncRes = await fetchFeedApiSafe(apiUrl('/api/users/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: profileRow.id,
              username: profileRow.username,
              full_name: profileRow.display_name || profileRow.full_name,
              avatar: profileRow.avatar_url
            })
          });
          if (syncRes?.ok) {
            console.log(`AUTH: Local DB sync successful for ${profileRow.username}`);
          } else if (syncRes) {
            const errData = await syncRes.json().catch(() => ({}));
            console.error(`AUTH: Local DB sync failed for ${profileRow.username}:`, errData);
          }
        } catch (err) {
          console.error('AUTH: Failed to sync user to local DB:', err);
        }
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code && String(code).trim().length > 0) {
        const normalized = String(code).trim().toUpperCase();
        localStorage.setItem('invite_code', normalized);
        console.log('INVITE CODE SAVED:', normalized);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Single auth listener — includes INITIAL_SESSION (avoids a second getSession() racing
    // onAuthStateChange and reduces duplicate work under React StrictMode).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('SUPABASE SESSION CHECK', event, session?.user?.id ?? '(no user)');
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        void loadPersonalizationFromSupabase(currentUser.id);
        fetchProfile(currentUser.id);
        void applyDailyStreakReward(currentUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    invalidateSessionCache();
    await supabase.auth.signOut();
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-100 dark:border-gray-800 text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4">Supabase Not Configured</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please add your Supabase credentials to the <strong>Secrets</strong> panel in AI Studio to enable authentication.
          </p>
          <div className="space-y-2 text-left bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-xs font-mono">
            <p>VITE_SUPABASE_URL</p>
            <p>VITE_SUPABASE_ANON_KEY</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

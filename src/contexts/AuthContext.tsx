import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, invalidateSessionCache } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.warn('Error fetching profile:', error.message);
        return;
      }
      setProfile(data);
      
      // Sync with local SQLite DB
      try {
        console.log(`AUTH: Syncing profile for ${data.username} (${data.id}) to local DB`);
        const syncRes = await fetch('/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.id,
            username: data.username,
            full_name: data.display_name,
            avatar: data.avatar_url
          })
        });
        if (syncRes.ok) {
          console.log(`AUTH: Local DB sync successful for ${data.username}`);
        } else {
          const errData = await syncRes.json();
          console.error(`AUTH: Local DB sync failed for ${data.username}:`, errData);
        }
      } catch (err) {
        console.error('AUTH: Failed to sync user to local DB:', err);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

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
        fetchProfile(currentUser.id);
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
      {!loading && children}
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

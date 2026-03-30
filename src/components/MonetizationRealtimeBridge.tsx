import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  registerMonetizationRealtimeSubscriptions,
  emitMonetizationRefresh,
} from '../lib/monetizationRealtime';

const POLL_MS = 10_000;

/**
 * Mount once under AuthProvider: wires Supabase Realtime + fallback polling so coins, gift points,
 * earnings, and Rewards UI stay fresh without a full page reload.
 */
export default function MonetizationRealtimeBridge() {
  const { user, refreshProfile } = useAuth();
  const unsubRef = useRef<(() => void) | null>(null);
  const refreshRef = useRef(refreshProfile);
  refreshRef.current = refreshProfile;

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) {
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    unsubRef.current?.();
    unsubRef.current = registerMonetizationRealtimeSubscriptions(user.id, () => refreshRef.current());

    const poll = window.setInterval(() => {
      void refreshRef.current();
      emitMonetizationRefresh();
    }, POLL_MS);

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      window.clearInterval(poll);
    };
  }, [user?.id]);

  return null;
}

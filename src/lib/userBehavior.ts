import { supabase } from './supabase';
import { apiUrl } from './apiOrigin';
import { getBearerAuthHeaders } from './supabaseAuthHeaders';
import { emitMonetizationRefresh } from './monetizationRealtime';

type BehaviorAction = 'like' | 'view' | 'comment' | 'follow' | 'share';
type BehaviorTarget = 'post' | 'video' | 'user';
const RECENT_EVENT_MS: Record<BehaviorAction, number> = {
  view: 30_000,
  like: 8_000,
  comment: 5_000,
  share: 10_000,
  follow: 15_000,
};
const recentEventMap = new Map<string, number>();

export async function trackUserBehavior(args: {
  userId: string;
  actionType: BehaviorAction;
  targetType: BehaviorTarget;
  targetId: string;
  category?: string | null;
}) {
  const isDev = import.meta.env.DEV;
  if (isDev) {
    console.log('[userBehavior][dev] invoked', {
      userId: args.userId,
      actionType: args.actionType,
      targetType: args.targetType,
      targetId: args.targetId,
      category: args.category ?? null,
    });
  }

  const userId = String(args.userId || '').trim();
  const targetId = String(args.targetId || '').trim();
  if (!userId || !targetId) {
    if (isDev) {
      console.log('[userBehavior][dev] skip: missing userId or targetId', { userId, targetId });
    }
    return;
  }
  const now = Date.now();
  const dedupeKey = `${userId}:${args.actionType}:${targetId}`;
  const lastAt = recentEventMap.get(dedupeKey) ?? 0;
  const cooldownMs = RECENT_EVENT_MS[args.actionType] ?? 5_000;
  if (now - lastAt < cooldownMs) {
    if (isDev) {
      console.log('[userBehavior][dev] skip: cooldown', {
        dedupeKey,
        cooldownMs,
        msSinceLast: now - lastAt,
      });
    }
    return;
  }

  let authUid: string | null = null;
  if (isDev) {
    const { data: { session } } = await supabase.auth.getSession();
    authUid = session?.user?.id ?? null;
    console.log('[userBehavior][dev] auth vs insert user_id', {
      authUid,
      insertUserId: userId,
      authMatchesPayload: authUid === userId,
      hasSupabaseSession: !!session,
    });
    if (!session) {
      console.warn(
        '[userBehavior][dev] No Supabase session — RLS policy requires authenticated; insert will likely fail (42501).'
      );
    } else if (authUid !== userId) {
      console.warn(
        '[userBehavior][dev] auth.uid() !== payload user_id — RLS WITH CHECK (auth.uid() = user_id) will reject insert.'
      );
    }
  }

  const insertPayload = {
    user_id: userId,
    action_type: args.actionType,
    target_type: args.targetType,
    target_id: targetId,
    category: String(args.category || '').trim() || null,
  };

  if (isDev) {
    console.log('[userBehavior][dev] inserting user_behavior', insertPayload);
  }

  const { data: insertedRows, error: behaviorErr } = await supabase
    .from('user_behavior')
    .insert(insertPayload)
    .select('id');
  const insertedRow = Array.isArray(insertedRows) ? insertedRows[0] : null;

  if (behaviorErr) {
    console.warn('[userBehavior] insert FAILED', {
      message: behaviorErr.message,
      code: behaviorErr.code,
      details: behaviorErr.details,
      hint: behaviorErr.hint,
      insertPayload,
      ...(isDev ? { authUid } : {}),
    });
    if (isDev) {
      console.log('[userBehavior][dev] insert failure (no cooldown consumed; will retry after cooldown window)');
    }
    return;
  }

  recentEventMap.set(dedupeKey, now);
  if (recentEventMap.size > 5000) {
    const cutoff = now - 10 * 60_000;
    for (const [k, t] of recentEventMap.entries()) {
      if (t < cutoff) recentEventMap.delete(k);
    }
  }

  if (isDev) {
    console.log('[userBehavior][dev] insert OK', {
      rowId: insertedRow?.id ?? null,
      insertPayload,
    });
  }

  // Non-blocking reward linkage: tracked actions now also increment profile activity points.
  void (async () => {
    try {
      const headers = await getBearerAuthHeaders();
      if (!headers) return;
      const res = await fetch(apiUrl('/api/rewards/activity-event'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          actionType: args.actionType,
          targetId,
        }),
      });
      const payload = await res.json().catch(() => null);
      const rowsUpdated = Number((payload as { rowsUpdated?: number } | null)?.rowsUpdated ?? NaN);
      if (!res.ok || rowsUpdated !== 1) {
        console.warn('[userBehavior] activity-event increment mismatch', {
          userId,
          actionType: args.actionType,
          targetId,
          status: res.status,
          payload,
        });
        return;
      }
      emitMonetizationRefresh();
    } catch (e) {
      console.warn('[userBehavior] activity-event linkage failed', e);
    }
  })();
}

export async function getUserTopInterest(userId: string): Promise<string | null> {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const { data } = await supabase
    .from('user_behavior')
    .select('action_type, category, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(50);

  const scores: Record<string, number> = {};
  (data || []).forEach((row: { action_type?: string | null; category?: string | null }) => {
    const category = String(row.category || '').trim().toLowerCase();
    if (!category) return;
    const action = String(row.action_type || '').trim().toLowerCase();
    const weight = action === 'like' ? 3 : action === 'comment' ? 2 : action === 'follow' ? 2 : action === 'view' ? 1 : 0;
    scores[category] = (scores[category] || 0) + weight;
  });

  let best: string | null = null;
  let bestScore = -1;
  Object.entries(scores).forEach(([k, v]) => {
    if (v > bestScore) {
      best = k;
      bestScore = v;
    }
  });
  return best;
}

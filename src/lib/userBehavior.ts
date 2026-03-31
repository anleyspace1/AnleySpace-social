import { supabase } from './supabase';

type BehaviorAction = 'like' | 'view' | 'comment' | 'follow';
type BehaviorTarget = 'post' | 'video' | 'user';

export async function trackUserBehavior(args: {
  userId: string;
  actionType: BehaviorAction;
  targetType: BehaviorTarget;
  targetId: string;
  category?: string | null;
}) {
  const userId = String(args.userId || '').trim();
  const targetId = String(args.targetId || '').trim();
  if (!userId || !targetId) return;

  await supabase.from('user_behavior').insert({
    user_id: userId,
    action_type: args.actionType,
    target_type: args.targetType,
    target_id: targetId,
    category: String(args.category || '').trim() || null,
  });
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

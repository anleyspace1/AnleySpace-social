import { supabase } from './supabase';
import { BOOST_COST } from './marketplaceCoins';

/** Non-blocking optional audit log; failures only go to console. */
function logWalletDeductFailed(userId: string, reason: string) {
  void supabase
    .from('wallet_events')
    .insert({ user_id: userId, event_type: 'deduct_failed', reason })
    .then(({ error }) => {
      if (error) console.warn('[wallet_events] insert failed', error);
    });
}

function logWalletBoostSuccess(userId: string, amount: number) {
  void supabase
    .from('wallet_events')
    .insert({ user_id: userId, event_type: 'boost_success', reason: 'ok', amount })
    .then(({ error }) => {
      if (error) console.warn('[wallet_events] insert failed', error);
    });
}

export const BOOST_OPTIONS = [
  { label: '⭐ 3 days', days: 3 },
  { label: '🔥 7 days', days: 7 },
  { label: '🚀 30 days', days: 30 },
];

export async function boostMarketplaceProduct(productId: string, days: number) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    console.warn('[BOOST] not authenticated', authErr);
    return { ok: false as const, error: 'Not authenticated' as const };
  }

  const cost = BOOST_COST[days];
  if (cost === undefined) {
    return { ok: false as const, error: 'Invalid boost duration' as const };
  }

  const { data: existing, error: wFetchErr } = await supabase
    .from('user_wallets')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (wFetchErr) {
    console.warn('[BOOST] wallet fetch', wFetchErr);
    return { ok: false as const, error: wFetchErr };
  }

  if (!existing) {
    const { error: insErr } = await supabase
      .from('user_wallets')
      .insert({ user_id: user.id, balance: 0 });

    if (insErr) {
      console.warn('[BOOST] wallet insert', insErr);
      return { ok: false as const, error: insErr };
    }
  }

  const { data: newBalance, error: deductErr } = await supabase.rpc('deduct_wallet_if_sufficient', {
    p_cost: cost,
  });

  if (deductErr) {
    console.warn('[BOOST] wallet deduct', deductErr);
    const msg =
      deductErr && typeof deductErr === 'object' && 'message' in deductErr
        ? String((deductErr as { message?: string }).message)
        : 'rpc_error';
    logWalletDeductFailed(user.id, msg);
    return { ok: false as const, error: deductErr };
  }

  if (newBalance == null) {
    const { data: rowAfter, error: rowErr } = await supabase
      .from('user_wallets')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (rowErr) {
      console.warn('[BOOST] deduct null: wallet row check failed', rowErr);
      logWalletDeductFailed(user.id, 'insufficient_balance');
      return {
        ok: false as const,
        error: 'Not enough coins' as const,
        deductFailureReason: 'insufficient_balance' as const,
      };
    }

    if (!rowAfter) {
      const { error: createErr } = await supabase
        .from('user_wallets')
        .insert({ user_id: user.id, balance: 0 });
      const code = createErr && typeof createErr === 'object' && 'code' in createErr ? String((createErr as { code?: string }).code) : '';
      if (createErr && code !== '23505') {
        console.warn('[BOOST] deduct null: create wallet failed', createErr);
      }
      console.warn('[BOOST] deduct null: no wallet row (ensured empty wallet exists)');
      logWalletDeductFailed(user.id, 'missing_wallet');
      return {
        ok: false as const,
        error: 'Not enough coins' as const,
        deductFailureReason: 'missing_wallet' as const,
      };
    }

    console.warn('[BOOST] deduct null: insufficient balance');
    logWalletDeductFailed(user.id, 'insufficient_balance');
    return {
      ok: false as const,
      error: 'Not enough coins' as const,
      deductFailureReason: 'insufficient_balance' as const,
    };
  }

  const { error: boostErr } = await supabase
    .from('marketplace')
    .update({
      is_featured: true,
      featured_until: until.toISOString(),
    })
    .eq('id', productId);

  if (boostErr) {
    console.warn('[BOOST] failed', boostErr);
    const { error: refundErr } = await supabase.rpc('refund_wallet_coins', { p_amount: cost });
    if (refundErr) console.warn('[BOOST] refund failed', refundErr);
    return { ok: false as const, error: boostErr };
  }

  logWalletBoostSuccess(user.id, cost);
  return { ok: true as const, until };
}

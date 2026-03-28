import { supabase } from './supabase';

export type CoinsPackage = 100 | 250 | 700;

export const COIN_PURCHASE_PACKAGES: { coins: CoinsPackage; label: string; priceUsd: string }[] = [
  { coins: 100, label: '100 coins', priceUsd: '$5' },
  { coins: 250, label: '250 coins', priceUsd: '$10' },
  { coins: 700, label: '700 coins', priceUsd: '$20' },
];

export async function buyCoins(coins: CoinsPackage): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ coinsPackage: coins }),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Checkout failed');
  }

  if (typeof data.url === 'string' && data.url) {
    window.location.href = data.url;
    return;
  }

  throw new Error('No checkout URL');
}

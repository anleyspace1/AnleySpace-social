import { supabase } from './supabase';
import { apiUrl } from './apiOrigin';

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

  const pkgRow = COIN_PURCHASE_PACKAGES.find((p) => p.coins === coins);
  console.log('Buying coins:', { coins, price: pkgRow?.priceUsd });

  const res = await fetch(apiUrl('/api/create-checkout-session'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ coinsPackage: coins }),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  console.log('Checkout response:', data);

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Checkout failed');
  }

  if (data.url) {
    window.location.href = data.url;
    return;
  }

  throw new Error('No checkout URL');
}

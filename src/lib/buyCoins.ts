import { supabase } from './supabase';
import { apiUrl } from './apiOrigin';

/** Stripe Checkout is served as `/api/create-checkout-session` on the same host as the SPA (Vercel serverless). Always use same-origin so it works when `VITE_API_ORIGIN` points at a different API server. */
function getCheckoutSessionUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/create-checkout-session`;
  }
  return apiUrl('/api/create-checkout-session');
}

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
  const checkoutUrl = getCheckoutSessionUrl();
  console.log('[buyCoins] POST', checkoutUrl, { coins, price: pkgRow?.priceUsd });

  let res: Response;
  try {
    res = await fetch(checkoutUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ coinsPackage: coins }),
    });
  } catch (e) {
    console.error('[buyCoins] fetch failed:', checkoutUrl, e);
    const httpsPageHttpApi =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      checkoutUrl.startsWith('http:');
    const hint = httpsPageHttpApi
      ? ' Use HTTPS for VITE_API_ORIGIN / VITE_API_URL (mixed content is blocked).'
      : ' Set VITE_API_ORIGIN or VITE_API_URL to your deployed Express API (HTTPS), redeploy Vercel, and ensure the server is running.';
    throw new Error(
      e instanceof Error && e.message === 'Failed to fetch'
        ? `Cannot reach coin checkout (${checkoutUrl}).${hint}`
        : e instanceof Error
          ? e.message
          : 'Checkout failed'
    );
  }

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  console.log('[buyCoins] Checkout response:', { status: res.status, ok: res.ok, data });

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Checkout failed');
  }

  if (data.url) {
    window.location.href = data.url;
    return;
  }

  throw new Error('No checkout URL');
}
